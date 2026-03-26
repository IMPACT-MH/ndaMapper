import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { loadMissionContext } from "@/lib/researchContext";
import { buildNetworkGraph } from "@/lib/networkBuilder";
import {
  createErrorResponse,
  createSuccessResponse,
  createOptionsResponse,
  CORS_HEADERS,
} from "@/lib/api-client";
import type {
  DataStructure,
  DataElement,
  CustomTag,
  StructureSuggestion,
  SuggestRequest,
  SuggestResponse,
} from "@/types";

const MAX_SUGGESTIONS = 6;

async function fetchStructureList(): Promise<DataStructure[]> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;
    const response = await fetch(`${baseUrl}/api/v1/data-structures`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return [];
    const data = await response.json() as { dataStructures?: Record<string, DataStructure> } | null;
    if (!data || !data.dataStructures) return [];
    return Object.entries(data.dataStructures)
      .map(([key, s]) => ({ ...s, shortName: s.shortName ?? key }))
      .filter((s) => Boolean(s.shortName));
  } catch {
    return [];
  }
}

async function fetchDataElements(shortName: string): Promise<DataElement[]> {
  try {
    const response = await fetch(
      `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return [];
    const data = await response.json() as { dataElements?: DataElement[] };
    return data.dataElements ?? [];
  } catch {
    return [];
  }
}

async function fetchTagMap(): Promise<Record<string, { customCategories: string[]; customDataTypes: string[] }>> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;

    const tagsRes = await fetch(`${baseUrl}/api/v1/tags`);
    if (!tagsRes.ok) return {};
    const tags = (await tagsRes.json()) as CustomTag[];

    // Exclude soft-deleted tags
    const activeTags = tags.filter(
      (t) =>
        t.tagType !== "Removed Category" &&
        t.tagType !== "Removed Data Type" &&
        !t.name.startsWith("REMOVED_")
    );

    // Fetch structures for each active tag in parallel
    const tagStructures = await Promise.all(
      activeTags.map(async (tag) => {
        const res = await fetch(`${baseUrl}/api/v1/tags/${tag.id}/dataStructures`);
        if (!res.ok) return { tag, shortNames: [] as string[] };
        const data = (await res.json()) as { dataStructures: DataStructure[] };
        return {
          tag,
          shortNames: (data.dataStructures ?? []).map((s) => s.shortName.toLowerCase()),
        };
      })
    );

    // Build reverse map: lowercase shortName → {customCategories, customDataTypes}
    const map: Record<string, { customCategories: string[]; customDataTypes: string[] }> = {};
    for (const { tag, shortNames } of tagStructures) {
      for (const sn of shortNames) {
        if (!map[sn]) map[sn] = { customCategories: [], customDataTypes: [] };
        if (tag.tagType === "Data Type") {
          map[sn].customDataTypes.push(tag.name);
        } else {
          map[sn].customCategories.push(tag.name);
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return createErrorResponse(
      "ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.",
      503
    );
  }

  let body: SuggestRequest;
  try {
    body = await request.json() as SuggestRequest;
  } catch {
    return createErrorResponse("Invalid JSON request body", 400);
  }

  const { question, databaseStructures = [], conversationHistory = [], excludeShortNames = [] } = body;
  if (!question?.trim()) {
    return createErrorResponse("question is required", 400);
  }

  // Load mission context, structure list, and custom tag map
  const [missionContext, allStructures, tagMap] = await Promise.all([
    loadMissionContext(),
    fetchStructureList(),
    fetchTagMap(),
  ]);

  // Filter to database structures if provided
  const availableStructures =
    databaseStructures.length > 0
      ? allStructures.filter((s) =>
          databaseStructures.some(
            (db) => db.toLowerCase() === s.shortName.toLowerCase()
          )
        )
      : allStructures;

  // Filter out already-shown structures if excludeShortNames provided
  const filteredStructures = excludeShortNames.length > 0
    ? availableStructures.filter(
        (s) => !excludeShortNames.map((n) => n.toLowerCase()).includes(s.shortName.toLowerCase())
      )
    : availableStructures;

  // Build compact summary for the LLM (omit dataElements to save tokens)
  const structureSummary = filteredStructures.slice(0, 500).map((s) => {
    const custom = tagMap[s.shortName.toLowerCase()];
    return {
      shortName: s.shortName,
      title: s.title,
      categories: custom?.customCategories.length
        ? custom.customCategories.slice(0, 3)
        : s.categories?.slice(0, 3),
      dataTypes: custom?.customDataTypes.length
        ? custom.customDataTypes.slice(0, 3)
        : (s.dataTypes ?? (s.dataType ? [s.dataType] : undefined))?.slice(0, 3),
      sites: s.submittedByProjects?.slice(0, 5),
    };
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a research assistant helping scientists find relevant mental health instruments in the IMPACT-MH database.

${missionContext}

## Available Instruments (${structureSummary.length} total)
${JSON.stringify(structureSummary, null, 2)}

## Your Task
Given the researcher's question, identify the ${MAX_SUGGESTIONS} most relevant instruments from the list above.

Rules:
- Only suggest shortNames that appear exactly in the instruments list above
- confidence = "high" if directly measures the construct; "medium" if partially relevant; "low" if tangentially related
- Include site information from the instruments list
- Return at most ${MAX_SUGGESTIONS} suggestions`;

  const suggestInstrumentsTool: Anthropic.Tool = {
    name: "suggest_instruments",
    description: "Suggest the most relevant instruments for the researcher's question",
    input_schema: {
      type: "object" as const,
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              shortName: { type: "string" },
              title: { type: "string" },
              relevanceReason: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              sites: { type: "array", items: { type: "string" } },
            },
            required: ["shortName", "title", "relevanceReason", "confidence"],
          },
        },
        reasoning: { type: "string" },
      },
      required: ["suggestions", "reasoning"],
    },
  };

  let suggestionsRaw: StructureSuggestion[] = [];
  let reasoning = "";

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      tools: [suggestInstrumentsTool],
      tool_choice: { type: "tool", name: "suggest_instruments" },
      system: systemPrompt,
      messages: [
        ...conversationHistory.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: question },
      ],
    });

    const toolBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("Unexpected response type");
    const parsed = toolBlock.input as {
      suggestions: StructureSuggestion[];
      reasoning: string;
    };

    suggestionsRaw = parsed.suggestions ?? [];
    reasoning = parsed.reasoning ?? "";

    // Validate shortNames against known structures and enrich with tags
    const knownNames = new Set(
      filteredStructures.map((s) => s.shortName.toLowerCase())
    );
    suggestionsRaw = suggestionsRaw
      .filter((s) => knownNames.has(s.shortName.toLowerCase()))
      .map((s) => {
        const base = filteredStructures.find(
          (a) => a.shortName.toLowerCase() === s.shortName.toLowerCase()
        );
        const custom = tagMap[s.shortName.toLowerCase()];
        return {
          ...s,
          categories: custom?.customCategories.length
            ? custom.customCategories
            : base?.categories,
          dataTypes: custom?.customDataTypes.length
            ? custom.customDataTypes
            : (base?.dataTypes ?? (base?.dataType ? [base.dataType] : undefined)),
        };
      });
  } catch (err) {
    console.error("LLM suggest error:", err);
    return createErrorResponse(
      "Failed to get instrument suggestions",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }

  // Fetch full dataElements for each suggested structure (in parallel)
  const fullStructures = await Promise.all(
    suggestionsRaw.map(async (suggestion) => {
      const base = filteredStructures.find(
        (s) => s.shortName.toLowerCase() === suggestion.shortName.toLowerCase()
      );
      if (!base) return null;
      const dataElements = await fetchDataElements(base.shortName);
      return { ...base, dataElements };
    })
  );

  const validStructures = fullStructures.filter(
    (s): s is NonNullable<typeof s> => s !== null
  ) as DataStructure[];

  // Second LLM call: recommend specific elements per instrument
  const recommendElementsTool: Anthropic.Tool = {
    name: "recommend_elements",
    description: "For each suggested instrument, identify the most relevant data elements for the researcher's question",
    input_schema: {
      type: "object" as const,
      properties: {
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              shortName: { type: "string" },
              elements: {
                type: "array",
                description: "Top 3-5 most relevant elements for this instrument",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    reason: { type: "string", description: "Why this element is relevant to the question" },
                  },
                  required: ["name", "reason"],
                },
              },
            },
            required: ["shortName", "elements"],
          },
        },
      },
      required: ["recommendations"],
    },
  };

  try {
    const instrumentsWithElements = validStructures
      .filter((s) => s.dataElements && s.dataElements.length > 0)
      .map((s) => ({
        shortName: s.shortName,
        elements: (s.dataElements ?? []).map((el) => ({
          name: el.name,
          description: el.description,
          type: el.type,
        })),
      }));

    if (instrumentsWithElements.length > 0) {
      const elementsMessage = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        tools: [recommendElementsTool],
        tool_choice: { type: "tool", name: "recommend_elements" },
        messages: [
          {
            role: "user" as const,
            content: `Research question: "${question}"

For each instrument below, identify the 3-5 data elements most relevant to answering the research question. Only include elements that are genuinely useful for this specific question.

Instruments and their elements:
${JSON.stringify(instrumentsWithElements, null, 2)}`,
          },
        ],
      });

      const elementsToolBlock = elementsMessage.content.find((b) => b.type === "tool_use");
      if (elementsToolBlock && elementsToolBlock.type === "tool_use") {
        const elementsResult = elementsToolBlock.input as {
          recommendations: Array<{
            shortName: string;
            elements: Array<{ name: string; description: string; reason: string }>;
          }>;
        };

        // Merge element recommendations into suggestionsRaw
        const recMap = new Map(
          (elementsResult.recommendations ?? []).map((r) => [r.shortName.toLowerCase(), r.elements])
        );
        suggestionsRaw = suggestionsRaw.map((s) => ({
          ...s,
          recommendedElements: recMap.get(s.shortName.toLowerCase()),
        }));
      }
    }
  } catch (err) {
    // Element recommendations are best-effort; don't fail the whole request
    console.warn("Element recommendations failed:", err instanceof Error ? err.message : String(err));
  }

  // Build network graph
  const networkGraph = buildNetworkGraph(validStructures);

  const responseBody: SuggestResponse = {
    suggestions: suggestionsRaw,
    reasoning,
    networkGraph,
  };

  return NextResponse.json(responseBody, { headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return createOptionsResponse();
}

void createSuccessResponse; // imported for pattern consistency

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

  const { question, databaseStructures = [], conversationHistory = [] } = body;
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

  // Build compact summary for the LLM (omit dataElements to save tokens)
  const structureSummary = availableStructures.slice(0, 500).map((s) => {
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

Respond ONLY with valid JSON in this exact format:
{
  "suggestions": [
    {
      "shortName": "exact_shortName_from_list",
      "title": "instrument title",
      "relevanceReason": "2-3 sentence explanation of why this instrument is relevant",
      "confidence": "high" | "medium" | "low",
      "sites": ["site1", "site2"]
    }
  ],
  "reasoning": "1-2 paragraph overview of your selection strategy and how these instruments work together"
}

Rules:
- Only suggest shortNames that appear exactly in the instruments list above
- confidence = "high" if directly measures the construct; "medium" if partially relevant; "low" if tangentially related
- Include site information from the instruments list
- Return at most ${MAX_SUGGESTIONS} suggestions`;

  let suggestionsRaw: StructureSuggestion[] = [];
  let reasoning = "";

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        ...conversationHistory.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: question },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    // Parse JSON from response (handle code blocks)
    const raw = content.text.trim();
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
    const jsonStr = jsonMatch[1] ?? raw;
    const parsed = JSON.parse(jsonStr) as {
      suggestions: StructureSuggestion[];
      reasoning: string;
    };

    suggestionsRaw = parsed.suggestions ?? [];
    reasoning = parsed.reasoning ?? "";

    // Validate shortNames against known structures and enrich with tags
    const knownNames = new Set(
      availableStructures.map((s) => s.shortName.toLowerCase())
    );
    suggestionsRaw = suggestionsRaw
      .filter((s) => knownNames.has(s.shortName.toLowerCase()))
      .map((s) => {
        const base = availableStructures.find(
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
      const base = availableStructures.find(
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

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createErrorResponse, createOptionsResponse, CORS_HEADERS } from "@/lib/api-client";
import { generateHarmonizedDataset } from "@/lib/mockDataGenerator";
import type { HarmonizeRequest, HarmonizeResponse, ConstructGroup, DataElement } from "@/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return createErrorResponse("ANTHROPIC_API_KEY is not configured.", 503);
  }

  let body: HarmonizeRequest;
  try { body = await request.json() as HarmonizeRequest; }
  catch { return createErrorResponse("Invalid JSON request body", 400); }

  const { question, structures } = body;
  if (!question?.trim()) return createErrorResponse("question is required", 400);
  if (!structures || structures.length < 2)
    return createErrorResponse("At least two structures are required for harmonization", 400);

  // Build {shortName}_{elementName} → DataElement map for value generation
  const elementsByKey = new Map<string, DataElement>();
  for (const s of structures) {
    for (const el of s.dataElements ?? []) {
      elementsByKey.set(`${s.shortName}_${el.name}`, el);
    }
  }

  // Compact instrument summary for LLM (cap at 80 elements each)
  const instrumentSummary = structures.map((s) => ({
    shortName: s.shortName,
    title: s.title,
    sites: s.sites?.slice(0, 5),
    elements: (s.dataElements ?? []).slice(0, 80).map((el) => ({
      name: el.name,
      description: el.description,
      type: el.type,
      valueRange: el.valueRange,
    })),
    totalElements: s.dataElements?.length ?? 0,
  }));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const buildCrosswalkTool: Anthropic.Tool = {
    name: "build_crosswalk",
    description: "Identify shared constructs across instruments and map specific elements to each",
    input_schema: {
      type: "object" as const,
      properties: {
        constructs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              constructName: { type: "string" },
              domain: { type: "string" },
              mappings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    shortName: { type: "string" },
                    elementName: { type: "string" },
                    description: { type: "string" },
                    mappingConfidence: { type: "string", enum: ["direct", "partial", "proxy"] },
                  },
                  required: ["shortName", "elementName", "mappingConfidence"],
                },
              },
            },
            required: ["constructName", "domain", "mappings"],
          },
        },
        summary: { type: "string" },
        reasoning: { type: "string" },
      },
      required: ["constructs", "summary", "reasoning"],
    },
  };

  let constructs: ConstructGroup[] = [];
  let summary = "";
  let reasoning = "";

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: [buildCrosswalkTool],
      tool_choice: { type: "tool", name: "build_crosswalk" },
      messages: [{
        role: "user" as const,
        content: `Research question: "${question}"

Harmonize data elements across ${structures.length} instruments. For each construct:
- Only include an instrument mapping if it has an element that genuinely measures that construct
- Only include constructs where at least 2 different instruments have a relevant element
- Prefer direct and partial mappings over proxy

Instruments and elements:
${JSON.stringify(instrumentSummary, null, 2)}`,
      }],
    });

    const toolBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("No tool_use block in response");

    const parsed = toolBlock.input as { constructs: ConstructGroup[]; summary: string; reasoning: string };
    constructs = parsed.constructs ?? [];
    summary = parsed.summary ?? "";
    reasoning = parsed.reasoning ?? "";

    // Validate: only keep mappings where shortName and elementName actually exist in input
    const validShortNames = new Set(structures.map((s) => s.shortName.toLowerCase()));
    const elementSetByStructure = new Map<string, Set<string>>();
    for (const s of structures) {
      elementSetByStructure.set(
        s.shortName.toLowerCase(),
        new Set((s.dataElements ?? []).map((el) => el.name.toLowerCase()))
      );
    }

    constructs = constructs
      .map((c) => ({
        ...c,
        mappings: c.mappings.filter((m) => {
          const snLow = m.shortName.toLowerCase();
          return validShortNames.has(snLow) &&
            elementSetByStructure.get(snLow)?.has(m.elementName.toLowerCase());
        }),
      }))
      .filter((c) => new Set(c.mappings.map((m) => m.shortName)).size >= 2);

  } catch (err) {
    console.error("LLM harmonize error:", err);
    return createErrorResponse("Failed to build crosswalk", 500, err instanceof Error ? err.message : String(err));
  }

  // Prepend universal NDA linking fields as a hardcoded "linkage" domain.
  // These fields are required in every NDA structure and are the connective tissue
  // for cross-instrument harmonization (subject ID, age, date, sex).
  const LINKING_FIELDS: Array<{ field: string; constructName: string; description: string }> = [
    { field: "subjectkey",      constructName: "Subject Key",          description: "Universal subject identifier for linking records across datasets" },
    { field: "src_subject_id",  constructName: "Study Subject ID",     description: "Study-level subject identifier for record linkage within and across studies" },
    { field: "interview_age",   constructName: "Interview Age",        description: "Key demographic variable for aligning subjects across instruments" },
    { field: "interview_date",  constructName: "Interview Date",       description: "Temporal alignment variable for longitudinal harmonization" },
    { field: "sex",             constructName: "Sex",                  description: "Core demographic covariate for cross-instrument harmonization and stratified analyses" },
  ];

  const linkageConstructs: ConstructGroup[] = LINKING_FIELDS.map(({ field, constructName, description }) => ({
    constructName,
    domain: "linkage",
    mappings: structures.map((s) => ({
      shortName: s.shortName,
      elementName: field,
      description,
      mappingConfidence: "direct" as const,
    })),
  }));

  // Linkage fields go first so they anchor the top of the crosswalk table
  constructs = [...linkageConstructs, ...constructs];

  const harmonizedDataset = generateHarmonizedDataset(constructs, elementsByKey, 50);

  const responseBody: HarmonizeResponse = { constructs, summary, reasoning, harmonizedDataset };
  return NextResponse.json(responseBody, { headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return createOptionsResponse();
}

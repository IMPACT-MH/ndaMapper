import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createErrorResponse, createOptionsResponse, CORS_HEADERS } from "@/lib/api-client";
import type { ElementHarmonizeResponse, ElementHarmonizeSite, ConstructGroup, DataElement } from "@/types";

interface IncomingSuggestion {
    shortName: string;
    title: string;
    sites?: string[];
}

interface NdaStructureResponse {
    dataElements?: DataElement[];
}

async function fetchStructureElements(shortName: string): Promise<DataElement[]> {
    try {
        const res = await fetch(
            `https://nda.nih.gov/api/datadictionary/datastructure/${encodeURIComponent(shortName)}`,
            { signal: AbortSignal.timeout(12000) }
        );
        if (!res.ok) return [];
        const data = await res.json() as NdaStructureResponse;
        return data.dataElements ?? [];
    } catch {
        return [];
    }
}

const LINKING_FIELDS: Array<{ field: string; constructName: string; description: string }> = [
    { field: "subjectkey",     constructName: "Subject Key",      description: "Universal subject identifier for linking records across datasets" },
    { field: "src_subject_id", constructName: "Study Subject ID", description: "Study-level subject identifier for record linkage" },
    { field: "interview_age",  constructName: "Interview Age",    description: "Key demographic variable for aligning subjects across instruments" },
    { field: "interview_date", constructName: "Interview Date",   description: "Temporal alignment variable for longitudinal harmonization" },
    { field: "sex",            constructName: "Sex",              description: "Core demographic covariate for cross-instrument harmonization" },
];

export async function POST(request: NextRequest): Promise<NextResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
        return createErrorResponse("ANTHROPIC_API_KEY is not configured.", 503);
    }

    let question: string;
    let suggestions: IncomingSuggestion[];
    try {
        const body = await request.json() as { question?: string; suggestions?: IncomingSuggestion[] };
        question = (body.question ?? "").trim();
        suggestions = body.suggestions ?? [];
    } catch {
        return createErrorResponse("Invalid JSON request body", 400);
    }

    if (!question) return createErrorResponse("question is required", 400);

    // Filter to multi-site instruments only
    const multiSite = suggestions.filter((s) => (s.sites ?? []).length >= 2);

    if (multiSite.length < 2) {
        const resp: ElementHarmonizeResponse = {
            structures: multiSite.map((s) => ({ shortName: s.shortName, title: s.title, sites: s.sites ?? [] })),
            constructs: [],
            summary: multiSite.length === 0
                ? "No instruments with cross-site coverage found. Try asking about instruments first."
                : "Only one multi-site instrument found — need at least two for element harmonization.",
            reasoning: "",
        };
        return NextResponse.json(resp, { headers: CORS_HEADERS });
    }

    // Fetch element schemas from NDA in parallel (cap at 80 elements each for LLM)
    const elementResults = await Promise.all(
        multiSite.map((s) => fetchStructureElements(s.shortName))
    );

    const structuresWithElements = multiSite.map((s, i) => ({
        shortName: s.shortName,
        title: s.title,
        sites: s.sites ?? [],
        dataElements: elementResults[i].slice(0, 80),
        totalElements: elementResults[i].length,
    }));

    // Build element key map for validation
    const elementsByStructure = new Map<string, Set<string>>();
    for (const s of structuresWithElements) {
        elementsByStructure.set(
            s.shortName.toLowerCase(),
            new Set(s.dataElements.map((el) => el.name.toLowerCase()))
        );
    }

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
        const instrumentSummary = structuresWithElements.map((s) => ({
            shortName: s.shortName,
            title: s.title,
            sites: s.sites,
            elements: s.dataElements.map((el) => ({
                name: el.name,
                description: el.description,
                type: el.type,
                valueRange: el.valueRange,
            })),
            totalElements: s.totalElements,
        }));

        const message = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            tools: [buildCrosswalkTool],
            tool_choice: { type: "tool", name: "build_crosswalk" },
            messages: [{
                role: "user" as const,
                content: `Research question: "${question}"

Find shared elements across these ${structuresWithElements.length} instruments that can be harmonized.
Each instrument is collected at multiple sites as shown. Only include constructs where at least 2 instruments have a relevant element.

Instruments:
${JSON.stringify(instrumentSummary, null, 2)}`,
            }],
        });

        const toolBlock = message.content.find((b) => b.type === "tool_use");
        if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("No tool_use block");

        const parsed = toolBlock.input as { constructs: ConstructGroup[]; summary: string; reasoning: string };
        constructs = parsed.constructs ?? [];
        summary = parsed.summary ?? "";
        reasoning = parsed.reasoning ?? "";

        // Validate: only keep mappings where shortName and elementName actually exist
        const validShortNames = new Set(structuresWithElements.map((s) => s.shortName.toLowerCase()));
        constructs = constructs
            .map((c) => ({
                ...c,
                mappings: c.mappings.filter((m) => {
                    const snLow = m.shortName.toLowerCase();
                    return validShortNames.has(snLow) &&
                        elementsByStructure.get(snLow)?.has(m.elementName.toLowerCase());
                }),
            }))
            .filter((c) => new Set(c.mappings.map((m) => m.shortName)).size >= 2);

    } catch (err) {
        console.error("[element-harmonize] crosswalk error:", err);
        return createErrorResponse("Failed to build element crosswalk", 500, err instanceof Error ? err.message : String(err));
    }

    // Prepend linkage fields
    const linkageConstructs: ConstructGroup[] = LINKING_FIELDS.map(({ field, constructName, description }) => ({
        constructName,
        domain: "linkage",
        mappings: structuresWithElements.map((s) => ({
            shortName: s.shortName,
            elementName: field,
            description,
            mappingConfidence: "direct" as const,
        })),
    }));

    constructs = [...linkageConstructs, ...constructs];

    const structures: ElementHarmonizeSite[] = structuresWithElements.map((s) => ({
        shortName: s.shortName,
        title: s.title,
        sites: s.sites,
    }));

    const resp: ElementHarmonizeResponse = { structures, constructs, summary, reasoning };
    return NextResponse.json(resp, { headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
    return createOptionsResponse();
}

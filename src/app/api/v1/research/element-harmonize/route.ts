import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createErrorResponse, createOptionsResponse, CORS_HEADERS } from "@/lib/api-client";
import { wordOverlapScore } from "@/lib/rosettaSearch";
import type { ElementHarmonizeResponse, ElementHarmonizeSite, ConstructGroup, DataElement } from "@/types";

interface IncomingSuggestion {
    shortName: string;
    title: string;
    sites?: string[];
}

interface NdaStructureResponse {
    dataElements?: DataElement[];
}

interface ElementRef {
    shortName: string;
    elementName: string;
    description: string;
}

// Standard NDA administrative/linkage fields — handled separately as linkage constructs
const ADMIN_FIELDS = new Set([
    "subjectkey", "src_subject_id", "interview_age", "interview_date", "sex",
    "visit", "visit_number", "version_form", "interview_type", "site",
    "respondent", "comqother", "fneill", "translation_language",
    "data_file1", "data_file1_type", "data_file2", "data_file2_type",
]);

const LINKING_FIELDS: Array<{ field: string; constructName: string; description: string }> = [
    { field: "subjectkey",     constructName: "Subject Key",      description: "Universal subject identifier for linking records across datasets" },
    { field: "src_subject_id", constructName: "Study Subject ID", description: "Study-level subject identifier for record linkage" },
    { field: "interview_age",  constructName: "Interview Age",    description: "Key demographic variable for aligning subjects across instruments" },
    { field: "interview_date", constructName: "Interview Date",   description: "Temporal alignment variable for longitudinal harmonization" },
    { field: "sex",            constructName: "Sex",              description: "Core demographic covariate for cross-instrument harmonization" },
];

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

// --------------------------------------------------------------------------
// Union-Find for clustering matched element pairs
// --------------------------------------------------------------------------
function buildClusters(pairs: Array<{ a: ElementRef; b: ElementRef; score: number }>): Map<string, ElementRef[]> {
    const keyOf = (e: ElementRef) => `${e.shortName}::${e.elementName}`;
    const refMap = new Map<string, ElementRef>();
    const parent = new Map<string, string>();

    const find = (x: string): string => {
        if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
        return parent.get(x)!;
    };

    const union = (x: string, y: string) => {
        const rx = find(x), ry = find(y);
        if (rx !== ry) parent.set(rx, ry);
    };

    for (const { a, b } of pairs) {
        const ka = keyOf(a), kb = keyOf(b);
        if (!parent.has(ka)) { parent.set(ka, ka); refMap.set(ka, a); }
        if (!parent.has(kb)) { parent.set(kb, kb); refMap.set(kb, b); }
        union(ka, kb);
    }

    // Ensure all nodes point to their root
    for (const k of parent.keys()) find(k);

    // Group by root
    const clusters = new Map<string, ElementRef[]>();
    for (const [k, root] of parent) {
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(refMap.get(k)!);
    }

    return clusters;
}

// --------------------------------------------------------------------------
// Confidence from overlap score
// --------------------------------------------------------------------------
function confidenceFromScore(score: number): "direct" | "partial" | "proxy" {
    if (score >= 0.6) return "direct";
    if (score >= 0.35) return "partial";
    return "proxy";
}

// --------------------------------------------------------------------------
// Route
// --------------------------------------------------------------------------
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

    // Fetch element schemas from NDA in parallel
    const elementResults = await Promise.all(
        multiSite.map((s) => fetchStructureElements(s.shortName))
    );

    const structuresWithElements = multiSite.map((s, i) => ({
        shortName: s.shortName,
        title: s.title,
        sites: s.sites ?? [],
        dataElements: elementResults[i],
    }));

    for (const s of structuresWithElements) {
        console.log(`[element-harmonize] ${s.shortName}: ${s.dataElements.length} elements fetched`);
    }

    // --------------------------------------------------------------------------
    // Step 2: Collect all clinical elements (exclude admin/linkage fields)
    // --------------------------------------------------------------------------
    const allElements: ElementRef[] = structuresWithElements.flatMap((s) =>
        s.dataElements
            .filter((el) => !ADMIN_FIELDS.has(el.name.toLowerCase()) && (el.description ?? "").length > 5)
            .map((el) => ({
                shortName: s.shortName,
                elementName: el.name,
                description: el.description ?? "",
            }))
    );

    console.log(`[element-harmonize] ${allElements.length} clinical elements across ${structuresWithElements.length} instruments`);

    // --------------------------------------------------------------------------
    // Step 3: Cross-instrument semantic matching via wordOverlapScore
    // --------------------------------------------------------------------------
    const OVERLAP_THRESHOLD = 0.25;
    const pairs: Array<{ a: ElementRef; b: ElementRef; score: number }> = [];

    for (let i = 0; i < allElements.length; i++) {
        for (let j = i + 1; j < allElements.length; j++) {
            if (allElements[i].shortName === allElements[j].shortName) continue;
            const score = wordOverlapScore(allElements[i].description, allElements[j].description);
            if (score >= OVERLAP_THRESHOLD) {
                pairs.push({ a: allElements[i], b: allElements[j], score });
            }
        }
    }

    console.log(`[element-harmonize] ${pairs.length} cross-instrument pairs above threshold`);

    // --------------------------------------------------------------------------
    // Step 4: Union-Find clustering — keep only clusters spanning ≥2 instruments
    // --------------------------------------------------------------------------
    const rawClusters = buildClusters(pairs);

    interface ClusterItem {
        shortName: string;
        elementName: string;
        description: string;
        score: number;  // best overlap score for this element in its cluster
    }

    // Compute best score per element by looking at its pairs
    const bestScore = new Map<string, number>();
    for (const { a, b, score } of pairs) {
        const ka = `${a.shortName}::${a.elementName}`;
        const kb = `${b.shortName}::${b.elementName}`;
        bestScore.set(ka, Math.max(bestScore.get(ka) ?? 0, score));
        bestScore.set(kb, Math.max(bestScore.get(kb) ?? 0, score));
    }

    const multiInstrumentClusters: ClusterItem[][] = [];
    for (const members of rawClusters.values()) {
        const instruments = new Set(members.map((m) => m.shortName));
        if (instruments.size < 2) continue;
        multiInstrumentClusters.push(
            members.map((m) => ({
                ...m,
                score: bestScore.get(`${m.shortName}::${m.elementName}`) ?? 0,
            }))
        );
    }

    console.log(`[element-harmonize] ${multiInstrumentClusters.length} clusters spanning ≥2 instruments`);

    if (multiInstrumentClusters.length === 0) {
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
        const structures: ElementHarmonizeSite[] = structuresWithElements.map((s) => ({
            shortName: s.shortName,
            title: s.title,
            sites: s.sites,
        }));
        return NextResponse.json({
            structures,
            constructs: linkageConstructs,
            summary: "No semantically similar elements found across these instruments. They may measure distinct constructs with little lexical overlap.",
            reasoning: "",
        } satisfies ElementHarmonizeResponse, { headers: CORS_HEADERS });
    }

    // --------------------------------------------------------------------------
    // Step 5: LLM names each cluster — purely a labeling task
    // --------------------------------------------------------------------------
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const nameClustersTool: Anthropic.Tool = {
        name: "name_clusters",
        description: "Assign a construct name, domain, and mapping confidence to each pre-discovered element cluster",
        input_schema: {
            type: "object" as const,
            properties: {
                named: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            clusterIndex: { type: "number" },
                            constructName: { type: "string" },
                            domain: { type: "string" },
                            mappings: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        shortName: { type: "string" },
                                        elementName: { type: "string" },
                                        mappingConfidence: { type: "string", enum: ["direct", "partial", "proxy"] },
                                    },
                                    required: ["shortName", "elementName", "mappingConfidence"],
                                },
                            },
                        },
                        required: ["clusterIndex", "constructName", "domain", "mappings"],
                    },
                },
                summary: { type: "string" },
                reasoning: { type: "string" },
            },
            required: ["named", "summary", "reasoning"],
        },
    };

    // Build value range lookup keyed by "shortName::elementName"
    const elementValueRangeMap = new Map<string, string>();
    for (const s of structuresWithElements) {
        for (const el of s.dataElements) {
            if (el.valueRange) {
                elementValueRangeMap.set(`${s.shortName}::${el.name}`, String(el.valueRange));
            }
        }
    }

    const clusterSummary = multiInstrumentClusters.map((cluster, i) => ({
        clusterIndex: i,
        elements: cluster.map((m) => ({
            shortName: m.shortName,
            elementName: m.elementName,
            description: m.description,
            overlapScore: Math.round(m.score * 100) / 100,
        })),
    }));

    let constructs: ConstructGroup[] = [];
    let summary = "";
    let reasoning = "";

    try {
        const message = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            tools: [nameClustersTool],
            tool_choice: { type: "tool", name: "name_clusters" },
            messages: [{
                role: "user" as const,
                content: `Research question: "${question}"

The following element clusters were discovered by semantic similarity matching (wordOverlapScore) across instruments.
Each cluster contains elements from different instruments that describe similar concepts.

Your task: give each cluster a concise construct name and domain, and assign mapping confidence:
- "direct": elements clearly measure the same specific construct
- "partial": elements partially overlap (e.g., one is a subscale item, the other is a broader measure including that construct)
- "proxy": elements are loosely related (share vocabulary but measure different aspects)

You may split a cluster into two named constructs if it clearly contains two distinct concepts.
Include ALL elements from the provided cluster in your output — do not drop any.

Clusters:
${JSON.stringify(clusterSummary, null, 2)}`,
            }],
        });

        const toolBlock = message.content.find((b) => b.type === "tool_use");
        if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("No tool_use block");

        const parsed = toolBlock.input as {
            named: Array<{
                clusterIndex: number;
                constructName: string;
                domain: string;
                mappings: Array<{ shortName: string; elementName: string; mappingConfidence: string }>;
            }>;
            summary: string;
            reasoning: string;
        };

        summary = parsed.summary ?? "";
        reasoning = parsed.reasoning ?? "";

        const validShortNames = new Set(structuresWithElements.map((s) => s.shortName.toLowerCase()));

        for (const named of (parsed.named ?? [])) {
            const mappings = named.mappings
                .filter((m) => validShortNames.has(m.shortName.toLowerCase()))
                .map((m) => ({
                    shortName: m.shortName,
                    elementName: m.elementName,
                    description: clusterSummary[named.clusterIndex]?.elements
                        .find((e) => e.shortName === m.shortName && e.elementName === m.elementName)
                        ?.description,
                    valueRange: elementValueRangeMap.get(`${m.shortName}::${m.elementName}`),
                    mappingConfidence: (["direct", "partial", "proxy"].includes(m.mappingConfidence)
                        ? m.mappingConfidence
                        : confidenceFromScore(
                            bestScore.get(`${m.shortName}::${m.elementName}`) ?? 0
                        )) as "direct" | "partial" | "proxy",
                }));

            if (new Set(mappings.map((m) => m.shortName)).size >= 2) {
                constructs.push({
                    constructName: named.constructName,
                    domain: named.domain,
                    mappings,
                });
            }
        }

        console.log(`[element-harmonize] final constructs after LLM naming: ${constructs.length}`);

    } catch (err) {
        console.error("[element-harmonize] LLM naming error:", err);
        // Fall back: use score-based confidence without LLM names
        constructs = multiInstrumentClusters.map((cluster, i) => ({
            constructName: `Cluster ${i + 1}`,
            domain: "unknown",
            mappings: cluster.map((m) => ({
                shortName: m.shortName,
                elementName: m.elementName,
                description: m.description,
                valueRange: elementValueRangeMap.get(`${m.shortName}::${m.elementName}`),
                mappingConfidence: confidenceFromScore(m.score),
            })),
        }));
        summary = `Found ${constructs.length} element clusters across instruments.`;
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

    return NextResponse.json({ structures, constructs, summary, reasoning } satisfies ElementHarmonizeResponse, { headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
    return createOptionsResponse();
}

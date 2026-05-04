import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createErrorResponse, createOptionsResponse, CORS_HEADERS } from "@/lib/api-client";
import { wordOverlapScore, preprocessMatchText } from "@/lib/rosettaSearch";
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
    matchText: string;
    conceptLabel?: string;
}

// Standard NDA administrative/linkage fields — excluded from element relations entirely
// (present in every structure via ndar_subject01, not meaningful as cross-instrument constructs)
const ADMIN_FIELDS = new Set([
    "subjectkey", "src_subject_id", "interview_age", "interview_date", "sex",
    "visit", "visit_number", "version_form", "interview_type", "site",
    "respondent", "comqother", "fneill", "translation_language",
    "data_file1", "data_file1_type", "data_file2", "data_file2_type",
]);

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
function buildClusters(pairs: Array<{ a: ElementRef; b: ElementRef; score: number; matchSource?: "semantic" | "lexical" }>): Map<string, ElementRef[]> {
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
// LLM Concept Normalization
// --------------------------------------------------------------------------
async function normalizeConcepts(
    elements: ElementRef[],
    question: string,
    client: Anthropic,
    batchSize = 40,
): Promise<Map<string, string>> {
    const conceptMap = new Map<string, string>();
    for (let start = 0; start < elements.length; start += batchSize) {
        const batch = elements.slice(start, start + batchSize);
        const elementList = batch
            .map((e, i) => `${i}: [${e.shortName}] ${e.elementName} — ${e.matchText.slice(0, 300)}`)
            .join("\n");
        try {
            const msg = await client.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 1024,
                temperature: 0,
                messages: [{
                    role: "user",
                    content: `You are harmonizing NDA data elements for a research study.
Research question: "${question}"

Assign each element a SHORT canonical psychological/clinical construct label in snake_case.
Use the SAME label for elements that measure the same underlying concept, even if phrasing differs.
Rules:
- Use specific constructs: prefer "anhedonia" over "depression_symptom"
- Keep labels to ≤4 words: "depressed_mood", "sleep_onset_latency", "anhedonia"
- Imputed/computed versions of an item → same label as the source item
- If you cannot identify the construct, use "unknown"

Elements (index: [instrument] elementName — description):
${elementList}

Return ONLY valid JSON mapping each index (as string) to its label:
{"0": "anhedonia", "1": "depressed_mood", ...}`,
                }],
            });
            const text = msg.content[0];
            if (text.type !== "text") continue;
            const raw = text.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
            const parsed = JSON.parse(raw) as Record<string, string>;
            for (const [idxStr, label] of Object.entries(parsed)) {
                const idx = parseInt(idxStr, 10);
                if (!isNaN(idx) && idx >= 0 && idx < batch.length) {
                    const el = batch[idx];
                    conceptMap.set(`${el.shortName}::${el.elementName}`, label);
                }
            }
        } catch (err) {
            console.warn(`[element-harmonize] concept normalization batch ${start} failed:`, err instanceof Error ? err.message : String(err));
        }
    }
    return conceptMap;
}

// --------------------------------------------------------------------------
// Route
// --------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<Response> {
    if (!process.env.ANTHROPIC_API_KEY) {
        return createErrorResponse("ANTHROPIC_API_KEY is not configured.", 503);
    }

    let question: string;
    let suggestions: IncomingSuggestion[];
    let overlapThreshold: number;
    try {
        const body = await request.json() as { question?: string; suggestions?: IncomingSuggestion[]; overlapThreshold?: number };
        question = (body.question ?? "").trim();
        suggestions = body.suggestions ?? [];
        overlapThreshold = typeof body.overlapThreshold === "number" ? Math.max(0, Math.min(1, body.overlapThreshold)) : 0.25;
    } catch {
        return createErrorResponse("Invalid JSON request body", 400);
    }

    if (!question) return createErrorResponse("question is required", 400);
    if (suggestions.length < 2) {
        return NextResponse.json({
            structures: [],
            constructs: [],
            summary: "Select at least two instruments to find element relations.",
            reasoning: "",
        } satisfies ElementHarmonizeResponse, { headers: CORS_HEADERS });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const enqueue = (event: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            };

            try {
                // Step 1: Fetch element schemas from NDA in parallel, reporting each as it resolves
                enqueue({ type: "status", text: "Fetching element schemas from NDA…" });

                const elementResults = await Promise.all(
                    suggestions.map((s, i) =>
                        fetchStructureElements(s.shortName).then((els) => {
                            enqueue({ type: "progress", current: i + 1, total: suggestions.length, shortName: s.shortName });
                            console.log(`[element-harmonize] ${s.shortName}: ${els.length} elements fetched`);
                            return els;
                        })
                    )
                );

                const structuresWithElements = suggestions.map((s, i) => ({
                    shortName: s.shortName,
                    title: s.title,
                    sites: s.sites ?? [],
                    dataElements: elementResults[i],
                }));

                // Step 2: Collect clinical elements (exclude admin/linkage fields)
                const allElements: ElementRef[] = structuresWithElements.flatMap((s) =>
                    s.dataElements
                        .filter((el) => !ADMIN_FIELDS.has(el.name.toLowerCase()) && (el.description ?? "").length > 5)
                        .map((el) => ({
                            shortName: s.shortName,
                            elementName: el.name,
                            description: el.description ?? "",
                            matchText: preprocessMatchText(el.name, el.description ?? "", el.notes),
                        }))
                );

                console.log(`[element-harmonize] ${allElements.length} clinical elements across ${structuresWithElements.length} instruments`);

                // Step 3: LLM concept normalization — assign canonical construct labels
                enqueue({ type: "status", text: "Running concept normalization…" });

                const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                const conceptMap = await normalizeConcepts(allElements, question, client);
                for (const el of allElements) {
                    el.conceptLabel = conceptMap.get(`${el.shortName}::${el.elementName}`);
                }
                console.log(`[element-harmonize] concept labels assigned to ${conceptMap.size}/${allElements.length} elements`);

                // Step 4: Build pairs — semantic first, then lexical
                const OVERLAP_THRESHOLD = overlapThreshold;
                const pairs: Array<{ a: ElementRef; b: ElementRef; score: number; matchSource: "semantic" | "lexical" }> = [];
                const semanticPairKeys = new Set<string>();

                for (let i = 0; i < allElements.length; i++) {
                    for (let j = i + 1; j < allElements.length; j++) {
                        const a = allElements[i], b = allElements[j];
                        if (a.shortName === b.shortName) continue;
                        if (!a.conceptLabel || !b.conceptLabel) continue;
                        if (a.conceptLabel === "unknown" || b.conceptLabel === "unknown") continue;
                        if (a.conceptLabel !== b.conceptLabel) continue;
                        const key = `${a.shortName}::${a.elementName}|${b.shortName}::${b.elementName}`;
                        semanticPairKeys.add(key);
                        pairs.push({ a, b, score: 0.9, matchSource: "semantic" });
                    }
                }

                for (let i = 0; i < allElements.length; i++) {
                    for (let j = i + 1; j < allElements.length; j++) {
                        const a = allElements[i], b = allElements[j];
                        if (a.shortName === b.shortName) continue;
                        const key = `${a.shortName}::${a.elementName}|${b.shortName}::${b.elementName}`;
                        if (semanticPairKeys.has(key)) continue;

                        let score = wordOverlapScore(a.matchText, b.matchText);

                        // Recall-biased scoring for short descriptions (≤4 content words)
                        const tokenize = (s: string) => new Set(
                            s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2)
                        );
                        const tokA = tokenize(a.matchText), tokB = tokenize(b.matchText);
                        const minWords = Math.min(tokA.size, tokB.size);
                        if (minWords <= 4 && minWords > 0) {
                            const intersection = [...tokA].filter(w => tokB.has(w)).length;
                            score = intersection / minWords;
                        }

                        if (score >= OVERLAP_THRESHOLD) {
                            pairs.push({ a, b, score, matchSource: "lexical" });
                        }
                    }
                }

                console.log(`[element-harmonize] ${pairs.length} cross-instrument pairs (${semanticPairKeys.size} semantic + ${pairs.length - semanticPairKeys.size} lexical)`);

                // Step 4: Union-Find clustering — keep only clusters spanning ≥2 instruments
                const rawClusters = buildClusters(pairs);

                interface ClusterItem {
                    shortName: string;
                    elementName: string;
                    description: string;
                    score: number;
                    matchSource?: "semantic" | "lexical";
                }

                const bestScore = new Map<string, number>();
                const bestMatchSource = new Map<string, "semantic" | "lexical">();
                for (const { a, b, score, matchSource } of pairs) {
                    const ka = `${a.shortName}::${a.elementName}`;
                    const kb = `${b.shortName}::${b.elementName}`;
                    if (score > (bestScore.get(ka) ?? 0)) { bestScore.set(ka, score); bestMatchSource.set(ka, matchSource); }
                    if (score > (bestScore.get(kb) ?? 0)) { bestScore.set(kb, score); bestMatchSource.set(kb, matchSource); }
                }

                const multiInstrumentClusters: ClusterItem[][] = [];
                for (const members of rawClusters.values()) {
                    const instruments = new Set(members.map((m) => m.shortName));
                    if (instruments.size < 2) continue;
                    multiInstrumentClusters.push(
                        members.map((m) => ({
                            ...m,
                            score: bestScore.get(`${m.shortName}::${m.elementName}`) ?? 0,
                            matchSource: bestMatchSource.get(`${m.shortName}::${m.elementName}`),
                        }))
                    );
                }

                console.log(`[element-harmonize] ${multiInstrumentClusters.length} clusters spanning ≥2 instruments`);

                const structures: ElementHarmonizeSite[] = structuresWithElements.map((s) => ({
                    shortName: s.shortName,
                    title: s.title,
                    sites: s.sites,
                }));

                if (multiInstrumentClusters.length === 0) {
                    enqueue({
                        type: "result",
                        structures,
                        constructs: [],
                        summary: "No shared elements found across these instruments. Try lowering the threshold or describing your research question more specifically.",
                        reasoning: "",
                    });
                    controller.close();
                    return;
                }

                // Step 5: LLM names each cluster
                enqueue({ type: "status", text: "Naming constructs with Claude…" });

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

                const elementValueRangeMap = new Map<string, string>();
                for (const s of structuresWithElements) {
                    for (const el of s.dataElements) {
                        if (el.valueRange) {
                            elementValueRangeMap.set(`${s.shortName}::${el.name}`, String(el.valueRange));
                        }
                    }
                }

                const clusterSummary = multiInstrumentClusters.map((cluster, i) => {
                    const byInstrument = new Map<string, typeof cluster[0]>();
                    for (const m of cluster) {
                        const prev = byInstrument.get(m.shortName);
                        if (!prev || m.score > prev.score) byInstrument.set(m.shortName, m);
                    }
                    const representatives = [...byInstrument.values()]
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 8);
                    return {
                        clusterIndex: i,
                        elements: representatives.map((m) => ({
                            shortName: m.shortName,
                            elementName: m.elementName,
                            description: m.description,
                            overlapScore: Math.round(m.score * 100) / 100,
                        })),
                    };
                });

                let constructs: ConstructGroup[] = [];
                let summary = "";
                let reasoning = "";

                try {
                    const message = await client.messages.create({
                        model: "claude-sonnet-4-6",
                        max_tokens: 8192,
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
                                matchSource: bestMatchSource.get(`${m.shortName}::${m.elementName}`),
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
                    constructs = multiInstrumentClusters.map((cluster, i) => ({
                        constructName: `Cluster ${i + 1}`,
                        domain: "unknown",
                        mappings: cluster.map((m) => ({
                            shortName: m.shortName,
                            elementName: m.elementName,
                            description: m.description,
                            valueRange: elementValueRangeMap.get(`${m.shortName}::${m.elementName}`),
                            mappingConfidence: confidenceFromScore(m.score),
                            matchSource: bestMatchSource.get(`${m.shortName}::${m.elementName}`),
                        })),
                    }));
                    summary = `Found ${constructs.length} element clusters across instruments.`;
                }

                enqueue({ type: "result", structures, constructs, summary, reasoning });

            } catch (err) {
                console.error("[element-harmonize] stream error:", err);
                enqueue({ type: "error", message: err instanceof Error ? err.message : String(err) });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson",
            ...CORS_HEADERS,
        },
    });
}

export async function OPTIONS(): Promise<NextResponse> {
    return createOptionsResponse();
}

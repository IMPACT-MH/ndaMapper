import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
    createErrorResponse,
    createOptionsResponse,
    CORS_HEADERS,
} from "@/lib/api-client";

const NDA_SEARCH_URL = "https://nda.nih.gov/api/search/nda/dataelement/full?size=50&highlight=false&ddsize=50";
const NDA_ELEMENT_URL = "https://nda.nih.gov/api/datadictionary/dataelement";

interface NdaSearchResult {
    name?: string;
    description?: string;
    notes?: string;
    dataStructures?: (string | { shortName?: string })[];
    _score?: number;
}

interface NdaElementDetail {
    name?: string;
    description?: string;
    notes?: string;
    type?: string;
    valueRange?: string;
    dataStructures?: (string | { shortName?: string })[];
}

export interface RosettaResult {
    name: string;
    description: string;
    notes?: string;
    dataStructures: string[];
    score: number;
    matchedBy: "description" | "term" | "name-guess";
}

function extractStructureNames(
    ds: (string | { shortName?: string })[] | undefined
): string[] {
    if (!ds) return [];
    return ds
        .map((d) => (typeof d === "string" ? d : (d.shortName ?? "")))
        .filter(Boolean);
}

async function fetchStructureElements(shortName: string): Promise<NdaElementDetail[]> {
    try {
        const res = await fetch(
            `https://nda.nih.gov/api/datadictionary/datastructure/${encodeURIComponent(shortName)}`,
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return [];
        const data = await res.json() as { dataElements?: NdaElementDetail[] };
        return data.dataElements ?? [];
    } catch {
        return [];
    }
}

function wordOverlapScore(a: string, b: string): number {
    const tokenize = (s: string) =>
        new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
    const setA = tokenize(a);
    const setB = tokenize(b);
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    return intersection / Math.max(setA.size, setB.size, 1);
}

async function searchNDA(query: string): Promise<{ results: NdaSearchResult[]; matchedBy: "description" | "term" }> {
    try {
        const res = await fetch(NDA_SEARCH_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: query,
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return { results: [], matchedBy: "term" };
        const data = await res.json() as { datadict?: { results?: NdaSearchResult[] } };
        return {
            results: data?.datadict?.results ?? [],
            matchedBy: query.length > 40 ? "description" : "term",
        };
    } catch {
        return { results: [], matchedBy: "term" };
    }
}

async function fetchElementDetail(name: string): Promise<NdaElementDetail | null> {
    try {
        const res = await fetch(`${NDA_ELEMENT_URL}/${encodeURIComponent(name)}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        return await res.json() as NdaElementDetail;
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
        return createErrorResponse(
            "ANTHROPIC_API_KEY is not configured.",
            503
        );
    }

    let description: string;
    try {
        const body = await request.json() as { description?: string };
        description = (body.description ?? "").trim();
    } catch {
        return createErrorResponse("Invalid JSON request body", 400);
    }

    if (!description) {
        return createErrorResponse("description is required", 400);
    }

    // Step 1: LLM term extraction
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let searchTerms: string[] = [];
    let candidateNames: string[] = [];
    let structureShortNames: string[] = [];

    try {
        const msg = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            messages: [
                {
                    role: "user",
                    content: `You are an expert in the NIMH Data Archive (NDA) data dictionary and clinical psychology measurement.
Given a research variable description, identify what is being measured and return search targets.

Description: "${description}"

Return ONLY valid JSON (no markdown, no explanation):
{
  "searchTerms": ["2-4 concise NDA-style keyword phrases — prefer specific clinical terms over generic ones"],
  "candidateNames": ["up to 4 guesses at the actual NDA element name in snake_case, e.g. erq_1, bdi_01, interview_age"],
  "structureShortNames": ["up to 2 guesses at the NDA data structure shortName that would contain this element, e.g. emrq01, bdi01, phq901"]
}

Tip: if the description looks like a Likert-scale item from a known questionnaire (ERQ, BDI, PHQ-9, GAD-7, PCL, etc.), identify the questionnaire and guess the element name using its conventional NDA pattern (scale_itemNumber).`,
                },
            ],
        });

        const text = msg.content[0];
        if (text.type === "text") {
            const raw = text.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
            const parsed = JSON.parse(raw) as { searchTerms?: string[]; candidateNames?: string[]; structureShortNames?: string[] };
            searchTerms = Array.isArray(parsed.searchTerms) ? parsed.searchTerms.slice(0, 4) : [];
            candidateNames = Array.isArray(parsed.candidateNames) ? parsed.candidateNames.slice(0, 4) : [];
            structureShortNames = Array.isArray(parsed.structureShortNames) ? parsed.structureShortNames.slice(0, 2) : [];
            console.log("[rosetta] LLM extraction:", { searchTerms, candidateNames, structureShortNames });
        }
    } catch (err) {
        console.warn("LLM term extraction failed, falling back to direct search:", err instanceof Error ? err.message : String(err));
        // Proceed with just the raw description
    }

    // Step 2: Parallel NDA searches
    const queries: Array<{ query: string; matchedBy: "description" | "term" }> = [
        { query: description, matchedBy: "description" },
        ...searchTerms.map((t) => ({ query: t, matchedBy: "term" as const })),
    ];

    const [searchResponses, nameGuessDetails, structureElementGroups] = await Promise.all([
        Promise.all(queries.map(({ query, matchedBy }) =>
            searchNDA(query).then((r) => ({ ...r, requestedMatchedBy: matchedBy }))
        )),
        Promise.all(candidateNames.map((name) =>
            fetchElementDetail(name).then((detail) => ({ name, detail }))
        )),
        Promise.all(structureShortNames.map((sn) => fetchStructureElements(sn))),
    ]);

    // Step 3: Merge and de-duplicate by element name
    const scoreMap = new Map<string, { score: number; matchedBy: "description" | "term" | "name-guess" }>();
    const structureElementCache = new Map<string, NdaElementDetail>();

    for (const { results, requestedMatchedBy } of searchResponses) {
        for (const result of results) {
            if (!result.name) continue;
            const existing = scoreMap.get(result.name);
            const score = result._score ?? 0;
            if (!existing || score > existing.score) {
                scoreMap.set(result.name, { score, matchedBy: requestedMatchedBy });
            }
        }
    }

    // Add name-guess direct hits at the top (only when NDA confirms the element exists)
    for (const { detail } of nameGuessDetails) {
        if (detail?.name) {
            const existing = scoreMap.get(detail.name);
            const score = existing ? Math.max(existing.score, 999) : 999;
            scoreMap.set(detail.name, { score, matchedBy: "name-guess" });
        }
        // If detail is null the element doesn't exist in NDA — discard silently
    }

    // Structure-based discovery: score each element from guessed structures by word overlap
    for (const elements of structureElementGroups) {
        for (const el of elements) {
            if (!el.name) continue;
            const overlap = wordOverlapScore(description, el.description ?? "");
            if (overlap < 0.2) continue;
            const syntheticScore = 500 + overlap * 500;
            const existing = scoreMap.get(el.name);
            if (!existing || syntheticScore > existing.score) {
                scoreMap.set(el.name, { score: syntheticScore, matchedBy: "name-guess" });
            }
            // Cache the element detail so we don't re-fetch it later
            structureElementCache.set(el.name, el);
        }
    }

    // Collect unique names and all raw ES results for description lookup
    const allResults = new Map<string, NdaSearchResult>();
    for (const { results } of searchResponses) {
        for (const result of results) {
            if (result.name && !allResults.has(result.name)) {
                allResults.set(result.name, result);
            }
        }
    }
    // Add name-guess detail hits
    for (const { detail } of nameGuessDetails) {
        if (detail?.name && !allResults.has(detail.name)) {
            allResults.set(detail.name, detail as NdaSearchResult);
        }
    }

    // Sort by score and take top 15 candidates to enrich
    const ranked = Array.from(scoreMap.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 15);

    // Step 4: Fetch full element details for top results (those not already loaded)
    const detailCache = new Map<string, NdaElementDetail | null>();
    for (const { name, detail } of nameGuessDetails) {
        if (detail) detailCache.set(name, detail);
        if (detail?.name) detailCache.set(detail.name, detail);
    }
    // Pre-populate from structure fetches
    for (const [name, el] of structureElementCache) {
        detailCache.set(name, el);
    }

    await Promise.all(
        ranked
            .filter(([name]) => !detailCache.has(name))
            .map(([name]) =>
                fetchElementDetail(name).then((d) => detailCache.set(name, d))
            )
    );

    // Build final results
    const results: RosettaResult[] = ranked
        .map(([name, { score, matchedBy }]) => {
            const detail = detailCache.get(name);
            const esResult = allResults.get(name);
            const description = detail?.description ?? esResult?.description ?? "";
            const dataStructures = extractStructureNames(
                detail?.dataStructures ?? esResult?.dataStructures
            );
            return {
                name,
                description,
                notes: detail?.notes ?? esResult?.notes,
                dataStructures,
                score,
                matchedBy,
            };
        })
        .filter((r) => r.name)
        .slice(0, 10);

    return NextResponse.json(
        { searchTerms, candidateNames, results },
        { headers: CORS_HEADERS }
    );
}

export async function OPTIONS(): Promise<NextResponse> {
    return createOptionsResponse();
}

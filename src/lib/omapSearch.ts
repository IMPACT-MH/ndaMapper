import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { wordOverlapScore } from "./rosettaSearch";

// OHDSI Atlas demo WebAPI — publicly accessible, no auth required
// Must use POST: the GET endpoint ignores ?limit and returns all results (100s of KB per query)
const ATLAS_VOCAB_URL = "https://atlas-demo.ohdsi.org/WebAPI/vocabulary/search";

interface AtlasConceptRaw {
    CONCEPT_ID: number;
    CONCEPT_NAME: string;
    STANDARD_CONCEPT: string | null;
    STANDARD_CONCEPT_CAPTION: string | null;
    INVALID_REASON: string | null;
    INVALID_REASON_CAPTION: string | null;
    CONCEPT_CODE: string;
    DOMAIN_ID: string;
    VOCABULARY_ID: string;
    CONCEPT_CLASS_ID: string;
}

// Local fallback uses the same shape
type LocalConcept = AtlasConceptRaw;

export interface OmapResult {
    conceptId: number;
    conceptName: string;
    conceptCode: string;
    vocabularyId: string;
    domainId: string;
    conceptClassId: string;
    standardConcept: string | null;
    score: number;
    matchedBy: "description" | "term";
    descriptionOverlap: number;
}

export interface OmapSearchResponse {
    searchTerms: string[];
    results: OmapResult[];
}

function loadLocalConcepts(): LocalConcept[] {
    try {
        const filePath = path.join(process.cwd(), "public", "omap-concepts.json");
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as LocalConcept[];
    } catch {
        return [];
    }
}

function localSearch(query: string, concepts: LocalConcept[]): LocalConcept[] {
    const q = query.toLowerCase();
    return concepts
        .filter((c) =>
            c.CONCEPT_NAME.toLowerCase().includes(q) ||
            c.CONCEPT_CODE.toLowerCase().includes(q)
        )
        .slice(0, 20);
}

async function searchAtlas(query: string): Promise<AtlasConceptRaw[]> {
    try {
        // POST required — GET ignores ?limit and returns hundreds of results
        const res = await fetch(ATLAS_VOCAB_URL, {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                QUERY: query,
                DOMAIN_ID: [],
                VOCABULARY_ID: [],
                CONCEPT_CLASS_ID: [],
                pageSize: 20,
                skippedCount: 0,
                STANDARD_CONCEPT: "S",
            }),
        });
        if (!res.ok) {
            console.warn(`[omapSearch] Atlas API returned ${res.status} for query: "${query}"`);
            throw new Error(`Atlas API ${res.status}`);
        }
        const data = await res.json() as AtlasConceptRaw[];
        return Array.isArray(data)
            ? data.filter((c) => c.STANDARD_CONCEPT === "S" && c.INVALID_REASON === "V").slice(0, 20)
            : [];
    } catch (err) {
        console.warn(`[omapSearch] Atlas search failed, using local fallback:`, err instanceof Error ? err.message : String(err));
        return localSearch(query, loadLocalConcepts());
    }
}

export async function runOmapSearch(
    description: string,
    exclude: number[] = []
): Promise<OmapSearchResponse> {
    const excludeSet = new Set(exclude);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let searchTerms: string[] = [];

    try {
        const msg = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            temperature: 0,
            messages: [
                {
                    role: "user",
                    content: `You are an expert in OMOP CDM vocabularies and clinical terminology.
Given a research variable description, extract concise search terms for querying the OHDSI vocabulary (SNOMED, LOINC, RxNorm).

Description: "${description}"

Return ONLY valid JSON (no markdown, no explanation):
{
  "searchTerms": ["2-4 concise clinical keyword phrases"]
}

Tips:
- For psychiatric scales: use the scale abbreviation (e.g. "PHQ-9", "GAD-7", "BDI")
- For symptoms/disorders: prefer SNOMED terms (e.g. "depressive disorder", "anxiety disorder")
- For measurements: prefer LOINC-style terms (e.g. "body weight", "heart rate")
- For demographics: use standard names (e.g. "gender", "race", "age")
- Keep each term short (1-4 words); do NOT use the full raw description as a term`,
                },
            ],
        });

        const text = msg.content[0];
        if (text.type === "text") {
            const raw = text.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
            const parsed = JSON.parse(raw) as { searchTerms?: string[] };
            searchTerms = Array.isArray(parsed.searchTerms) ? parsed.searchTerms.slice(0, 4) : [];
        }
    } catch (err) {
        console.warn("[omapSearch] LLM term extraction failed:", err instanceof Error ? err.message : String(err));
    }

    // Only search the extracted terms (not the raw description — it's too long for vocab search)
    const queries = searchTerms.length > 0
        ? searchTerms
        : [description.replace(/[^a-zA-Z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join(" ")];
    const searchResults = await Promise.all(
        queries.map((q, i) =>
            searchAtlas(q).then((results) => ({
                results,
                matchedBy: "term" as const,
                queryIndex: i,
            }))
        )
    );

    // Deduplicate by conceptId, keep best rank-based score
    const conceptMap = new Map<number, { raw: AtlasConceptRaw; score: number; matchedBy: "description" | "term" }>();
    for (const { results, matchedBy } of searchResults) {
        results.forEach((c, idx) => {
            const score = results.length - idx;
            const existing = conceptMap.get(c.CONCEPT_ID);
            if (!existing || score > existing.score) {
                conceptMap.set(c.CONCEPT_ID, { raw: c, score, matchedBy });
            }
        });
    }

    const results: OmapResult[] = Array.from(conceptMap.values())
        .filter(({ raw }) => !excludeSet.has(raw.CONCEPT_ID))
        .map(({ raw, score, matchedBy }) => ({
            conceptId: raw.CONCEPT_ID,
            conceptName: raw.CONCEPT_NAME,
            conceptCode: raw.CONCEPT_CODE,
            vocabularyId: raw.VOCABULARY_ID,
            domainId: raw.DOMAIN_ID,
            conceptClassId: raw.CONCEPT_CLASS_ID,
            standardConcept: raw.STANDARD_CONCEPT,
            score,
            matchedBy,
            descriptionOverlap: wordOverlapScore(description, raw.CONCEPT_NAME),
        }))
        .sort((a, b) => {
            if (Math.abs(a.descriptionOverlap - b.descriptionOverlap) > 0.25)
                return b.descriptionOverlap - a.descriptionOverlap;
            return b.score - a.score;
        })
        .slice(0, 10);

    return { searchTerms, results };
}

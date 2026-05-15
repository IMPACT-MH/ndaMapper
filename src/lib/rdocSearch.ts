import Anthropic from "@anthropic-ai/sdk";
import { getRdocMatrix, type RdocConstruct } from "./rdocMatrix";
import { runRosettaSearch, wordOverlapScore, type RosettaResult } from "./rosettaSearch";

export interface RdocResult {
    construct: RdocConstruct;
    matchReason: string;
    ndaElements: RosettaResult[];
    score: number;
    matchedBy: "description";
    descriptionOverlap: number;
}

export interface RdocSearchResponse {
    searchTerms: string[];
    results: RdocResult[];
}

function buildCompactMatrixPrompt(constructs: RdocConstruct[]): string {
    return constructs
        .map((c) => {
            const unitSummary = c.units
                .map((u) => u.name)
                .slice(0, 4)
                .join(", ");
            return `${c.id} | ${c.domain} | ${c.construct} | ${unitSummary}`;
        })
        .join("\n");
}

export async function runRdocSearch(
    description: string,
    exclude: string[] = []
): Promise<RdocSearchResponse> {
    const excludeSet = new Set(exclude.map((s) => s.toLowerCase()));
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const matrix = await getRdocMatrix();
    if (matrix.constructs.length === 0) {
        return { searchTerms: [], results: [] };
    }

    const compactList = buildCompactMatrixPrompt(matrix.constructs);

    interface LlmMatch {
        constructId: string;
        reason: string;
        ndaSearchTerms: string[];
    }

    let llmMatches: LlmMatch[] = [];
    let allNdaSearchTerms: string[] = [];

    try {
        const msg = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            temperature: 0,
            messages: [
                {
                    role: "user",
                    content: `You are an expert in the NIMH Research Domain Criteria (RDoC) framework and clinical psychology measurement.

Given a research variable description, identify the top 3 RDoC constructs that best capture what is being measured.

Description: "${description}"

Available constructs (format: id | domain | construct | units):
${compactList}

Return ONLY valid JSON (no markdown, no explanation):
{
  "matches": [
    {
      "constructId": "exact-id-from-list",
      "reason": "one sentence explaining why this construct matches",
      "ndaSearchTerms": ["1-3 concise NDA search terms for this construct"]
    }
  ]
}

Rules:
- Return exactly 3 matches, ordered by relevance (best first)
- constructId must exactly match an id from the list above
- Keep each ndaSearchTerm short (1-4 words), clinical, and specific`,
                },
            ],
        });

        const text = msg.content[0];
        if (text.type === "text") {
            const raw = text.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
            const parsed = JSON.parse(raw) as { matches?: LlmMatch[] };
            if (Array.isArray(parsed.matches)) {
                llmMatches = parsed.matches.slice(0, 3);
                allNdaSearchTerms = llmMatches.flatMap((m) => m.ndaSearchTerms ?? []);
            }
        }
    } catch (err) {
        console.warn("[rdocSearch] LLM classification failed:", err instanceof Error ? err.message : String(err));
        return { searchTerms: [], results: [] };
    }

    // Resolve construct objects
    const constructById = new Map(matrix.constructs.map((c) => [c.id, c]));

    // For each matched construct, run a parallel NDA search
    const ndaSearchPromises = llmMatches.map(async (match, idx): Promise<RdocResult | null> => {
        const construct = constructById.get(match.constructId);
        if (!construct) return null;
        if (excludeSet.has(match.constructId)) return null;

        const terms = match.ndaSearchTerms ?? [];
        const primaryTerm = terms[0] ?? construct.construct;

        let ndaElements: RosettaResult[] = [];
        try {
            const ndaResp = await runRosettaSearch(primaryTerm, []);
            ndaElements = ndaResp.results.slice(0, 5);
        } catch {
            // NDA search failure is non-fatal
        }

        return {
            construct,
            matchReason: match.reason ?? "",
            ndaElements,
            score: llmMatches.length - idx,
            matchedBy: "description",
            descriptionOverlap: wordOverlapScore(description, construct.construct),
        };
    });

    const settled = await Promise.all(ndaSearchPromises);
    const results = settled.filter((r): r is RdocResult => r !== null);

    return { searchTerms: allNdaSearchTerms, results };
}

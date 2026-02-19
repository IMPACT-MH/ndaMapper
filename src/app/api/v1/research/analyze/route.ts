import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { loadMissionContext, loadSitesContext } from "@/lib/researchContext";
import { CORS_HEADERS } from "@/lib/api-client";
import type { AnalyzeRequest, MockDataset } from "@/types";

function buildDatasetSummary(datasets: MockDataset[]): string {
  return datasets
    .map((ds) => {
      const fields = ds.schema.slice(0, 20).map((e) => e.name);
      const sampleRow = ds.rows[0] ?? {};
      const sampleValues = Object.fromEntries(
        fields.slice(0, 8).map((f) => [f, sampleRow[f]])
      );
      return `### ${ds.structure.shortName} (${ds.rows.length} rows)
Fields: ${fields.join(", ")}${ds.schema.length > 20 ? ` ... (${ds.schema.length - 20} more)` : ""}
Sample row: ${JSON.stringify(sampleValues)}`;
    })
    .join("\n\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new NextResponse(
      "ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.",
      { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "text/plain" } }
    );
  }

  let body: AnalyzeRequest;
  try {
    body = await request.json() as AnalyzeRequest;
  } catch {
    return new NextResponse("Invalid JSON request body", {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "text/plain" },
    });
  }

  const { question, selectedStructures, mockDatasets, conversationHistory = [] } = body;
  if (!question?.trim()) {
    return new NextResponse("question is required", {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "text/plain" },
    });
  }

  // Collect all sites from selected structures
  const allSites = new Set<string>();
  for (const s of selectedStructures) {
    for (const site of s.submittedByProjects ?? []) {
      allSites.add(site);
    }
  }

  const [missionContext, sitesContext] = await Promise.all([
    loadMissionContext(),
    loadSitesContext([...allSites].slice(0, 5)),
  ]);

  const siteContextStr =
    Object.keys(sitesContext).length > 0
      ? "\n## Site Context\n" +
        Object.entries(sitesContext)
          .map(([site, ctx]) => `### ${site}\n${ctx}`)
          .join("\n\n")
      : "";

  const datasetSummary = buildDatasetSummary(mockDatasets);
  const instrumentList = selectedStructures
    .map((s) => `- **${s.shortName}**: ${s.title}`)
    .join("\n");

  const systemPrompt = `You are a biostatistics and mental health research consultant helping researchers plan analyses using the IMPACT-MH database.

${missionContext}${siteContextStr}

## IMPORTANT: Data Context
You are analyzing SYNTHETIC mock data generated from NDA schema definitions. This data is for research planning and proof-of-concept purposes only. Real findings will require access to actual participant data.

## Selected Instruments
${instrumentList}

## Mock Dataset Summary
${datasetSummary}

## Your Role
1. Interpret the researcher's question in the context of the selected instruments and mock data
2. Describe what patterns you observe in the synthetic data (while clearly noting it's mock data)
3. Suggest what real findings might look like and what statistical approaches would be appropriate
4. Note any limitations or considerations for the analysis plan
5. After your main response, end with a <charts> block containing JSON chart configurations

## Chart Format
End your response with exactly this format (do not include it mid-response):
<charts>[
  {
    "id": "unique-id",
    "type": "bar" | "histogram" | "scatter",
    "title": "Chart title",
    "xField": "field_name",
    "yField": "field_name",
    "groupByField": "optional_group_field"
  }
]</charts>

Suggest 1-3 charts that would be most informative given the question and available fields.`;

  // Build conversation messages
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: question },
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Stream the response
  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(readableStream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

/**
 * /api/v1/research/query — Phase 2 stub
 *
 * TODO (Phase 2): Connect to MongoDB and execute real queries.
 *
 * When MONGODB_URI is present in the environment:
 *   1. Import pipelineValidator and validatePipeline()
 *   2. Connect to MongoDB using MONGODB_URI + MONGODB_DB_NAME
 *   3. Validate the aggregation pipeline
 *   4. Execute against the real database
 *   5. Return { mongoAvailable: true, dataset: [...] }
 *
 * Until then, returns { mongoAvailable: false, dataset: [] } so
 * the ResearchAssistant component can show the Phase2Banner.
 *
 * Environment variables (add to .env.local when ready):
 *   MONGODB_URI=mongodb+srv://...
 *   MONGODB_DB_NAME=impact_mh
 */

import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS } from "@/lib/api-client";

interface QueryRequest {
  question: string;
  structureShortNames: string[];
  filters?: Record<string, unknown>;
  limit?: number;
}

interface QueryResponse {
  mongoAvailable: boolean;
  dataset: Record<string, unknown>[];
  message?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  void request; // Phase 2: read and use request body

  const mongoAvailable = Boolean(process.env.MONGODB_URI);

  if (!mongoAvailable) {
    const response: QueryResponse = {
      mongoAvailable: false,
      dataset: [],
      message:
        "MongoDB is not configured. Set MONGODB_URI in your environment to enable real data queries.",
    };
    return NextResponse.json(response, { headers: CORS_HEADERS });
  }

  // TODO (Phase 2): Implement real MongoDB query
  // const body = await request.json() as QueryRequest;
  // const { question, structureShortNames, filters, limit = 1000 } = body;
  // const validationResult = await validatePipeline({ question, structureShortNames, filters, limit });
  // if (!validationResult.valid) { ... return error }
  // const client = new MongoClient(process.env.MONGODB_URI);
  // ... execute pipeline and return real data

  const response: QueryResponse = {
    mongoAvailable: true,
    dataset: [],
    message: "MongoDB is configured but query execution is not yet implemented (Phase 2).",
  };
  return NextResponse.json(response, { headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

// Keep TypeScript happy with unused import
type _QueryRequest = QueryRequest;

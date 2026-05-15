import { NextRequest, NextResponse } from "next/server";
import {
    createErrorResponse,
    createOptionsResponse,
    CORS_HEADERS,
} from "@/lib/api-client";
import { runOmapSearch } from "@/lib/omapSearch";

export type { OmapResult } from "@/lib/omapSearch";

export async function POST(request: NextRequest): Promise<NextResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
        return createErrorResponse("ANTHROPIC_API_KEY is not configured.", 503);
    }

    let description: string;
    let exclude: number[];
    try {
        const body = await request.json() as { description?: string; exclude?: number[] };
        description = (body.description ?? "").trim();
        exclude = body.exclude ?? [];
    } catch {
        return createErrorResponse("Invalid JSON request body", 400);
    }

    if (!description) {
        return createErrorResponse("description is required", 400);
    }

    const result = await runOmapSearch(description, exclude);
    return NextResponse.json(result, { headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
    return createOptionsResponse();
}

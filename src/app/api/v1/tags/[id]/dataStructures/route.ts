import { NextRequest, NextResponse } from "next/server";
import {
  makeHttpsRequest,
  buildApiUrl,
  createErrorResponse,
  createSuccessResponse,
  createOptionsResponse,
} from "@/lib/api-client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const response = await makeHttpsRequest(
      buildApiUrl(`/tags/${id}/dataStructures`),
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return createErrorResponse(
        `API returned ${response.status}`,
        response.status,
        errorText
      );
    }

    const data = await response.json();
    return createSuccessResponse(data);
  } catch (error) {
    console.error("Error fetching tag data structures:", error);
    return createErrorResponse(
      "Failed to fetch tag data structures",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return createOptionsResponse();
}

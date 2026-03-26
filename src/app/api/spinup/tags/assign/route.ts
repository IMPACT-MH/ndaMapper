import { NextRequest, NextResponse } from "next/server";
import {
  makeHttpsRequest,
  buildApiUrl,
  createErrorResponse,
  createSuccessResponse,
  createOptionsResponse,
} from "@/lib/api-client";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const response = await makeHttpsRequest(buildApiUrl("/tags/assign"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout: 15000,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error:", { status: response.status, body, errorText });
      return createErrorResponse(
        `API returned ${response.status}`,
        response.status,
        errorText
      );
    }

    const data = await response.json().catch(() => ({}));
    return createSuccessResponse(data);
  } catch (error) {
    console.error("Error assigning tag:", error);
    return createErrorResponse(
      "Failed to assign tag",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return createOptionsResponse();
}

import { NextResponse } from "next/server";
import {
  makeHttpsRequest,
  buildApiUrl,
  createErrorResponse,
  createSuccessResponse,
  createOptionsResponse,
} from "@/lib/api-client";
import { cache, cacheTimestamp, CACHE_DURATION, setCache } from "./cache";

export async function GET(): Promise<NextResponse> {
  try {
    const now = Date.now();
    if (cache && now - cacheTimestamp < CACHE_DURATION) {
      return createSuccessResponse(cache, {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Cache": "HIT",
      });
    }

    const response = await makeHttpsRequest(buildApiUrl("/data-structures"), {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    setCache(data);

    return createSuccessResponse(data, {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "X-Cache": "MISS",
    });
  } catch (error) {
    console.error("Error fetching data structures:", error);
    return createErrorResponse(
      "Failed to fetch data structures",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return createOptionsResponse();
}

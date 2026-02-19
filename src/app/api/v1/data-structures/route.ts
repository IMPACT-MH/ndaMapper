import { NextResponse } from "next/server";
import {
  makeHttpsRequest,
  buildApiUrl,
  createErrorResponse,
  createSuccessResponse,
  createOptionsResponse,
} from "@/lib/api-client";

// Simple in-memory cache
let cache: unknown = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
    cache = data;
    cacheTimestamp = now;

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

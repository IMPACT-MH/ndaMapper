import { NextResponse } from "next/server";
import {
  createErrorResponse,
  createSuccessResponse,
  createOptionsResponse,
} from "@/lib/api-client";
import { NDA_DATA_STRUCTURES } from "@/const";
import { cache, cacheTimestamp, CACHE_DURATION, setCache } from "./cache";

// Server-side cached proxy for NDA's public bulk data dictionary.
// Fetching this directly from the browser (one request per open tab) was
// triggering 429s from nda.nih.gov; routing every client through this single
// cached endpoint keeps real upstream request volume low.
export async function GET(): Promise<NextResponse> {
  try {
    const now = Date.now();
    if (cache && now - cacheTimestamp < CACHE_DURATION) {
      return createSuccessResponse(cache, {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
        "X-Cache": "HIT",
      });
    }

    const response = await fetch(NDA_DATA_STRUCTURES, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    setCache(data);

    return createSuccessResponse(data, {
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
      "X-Cache": "MISS",
    });
  } catch (error) {
    console.error("Error fetching NDA data structures:", error);
    return createErrorResponse(
      "Failed to fetch NDA data structures",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return createOptionsResponse();
}

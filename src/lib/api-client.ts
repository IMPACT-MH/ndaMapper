import "server-only";
import https from "https";
import { NextResponse } from "next/server";

import type { HttpsRequestOptions, HttpsResponse } from "@/types";

const API_BASE_URL = "https://nda.impact-mh.org/api/v1";

// Default CORS headers
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Makes an HTTPS request with proper SSL handling
 */
export function makeHttpsRequest(
  url: string,
  options: HttpsRequestOptions = {}
): Promise<HttpsResponse> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
      rejectUnauthorized: false, // Allow self-signed certificates
    };

    const req = https.request(requestOptions, (res) => {
      let data = "";

      res.on("data", (chunk: Buffer) => {
        data += chunk;
      });

      res.on("end", () => {
        const response: HttpsResponse = {
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers as Record<string, string | string[] | undefined>,
          json: async () => JSON.parse(data) as unknown,
          text: async () => data,
        };
        resolve(response);
      });
    });

    req.on("error", (error: Error) => {
      reject(error);
    });

    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
    }

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Builds a full API URL from a path
 */
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  message: string,
  status = 500,
  details: string | null = null
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(details && { details }),
    },
    {
      status,
      headers: CORS_HEADERS,
    }
  );
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse(
  data: unknown,
  additionalHeaders: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(data, {
    headers: {
      ...CORS_HEADERS,
      ...additionalHeaders,
    },
  });
}

/**
 * Creates a standardized OPTIONS response
 */
export function createOptionsResponse(): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: CORS_HEADERS,
  });
}

export { API_BASE_URL, CORS_HEADERS };

import { NextResponse } from "next/server";
import https from "https";

// Simple in-memory cache to speed up repeated requests
let cache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to make HTTPS request with proper SSL handling
function makeHttpsRequest(url, options = {}) {
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

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                const response = {
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    json: async () => JSON.parse(data),
                    text: async () => data,
                };
                resolve(response);
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        // Set timeout
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

export async function GET() {
    try {
        // Check cache first
        const now = Date.now();
        if (cache && now - cacheTimestamp < CACHE_DURATION) {
            return NextResponse.json(cache, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods":
                        "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers":
                        "Content-Type, Authorization",
                    "Cache-Control":
                        "public, s-maxage=300, stale-while-revalidate=600",
                    "X-Cache": "HIT",
                },
            });
        }

        const response = await makeHttpsRequest(
            "https://nda.impact-mh.org/api/v1/data-structures",
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 30000, // 30 second timeout
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Update cache
        cache = data;
        cacheTimestamp = now;

        return NextResponse.json(data, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Cache-Control":
                    "public, s-maxage=300, stale-while-revalidate=600",
                "X-Cache": "MISS",
            },
        });
    } catch (error) {
        console.error("Error fetching from spinup API:", error);
        return NextResponse.json(
            {
                error: "Failed to fetch data from spinup API",
                details: error.message || String(error),
            },
            { status: 500 }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}

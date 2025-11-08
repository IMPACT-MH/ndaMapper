import { NextResponse } from "next/server";
import https from "https";

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

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const response = await makeHttpsRequest(
            `https://spinup-002b0f.spinup.yale.edu/api/tags/${id}/dataStructures`,
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 30000, // 30 second timeout
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                {
                    error: `API returned ${response.status}`,
                    details: errorText,
                },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json(data, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    } catch (error) {
        console.error(
            "Error fetching tag data structures from spinup API:",
            error
        );
        return NextResponse.json(
            {
                error: "Failed to fetch tag data structures from spinup API",
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

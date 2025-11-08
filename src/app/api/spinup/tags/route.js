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

export async function GET() {
    try {
        const response = await makeHttpsRequest(
            "https://spinup-002b0f.spinup.yale.edu/api/tags",
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 30000, // 30 second timeout
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Spinup API error (${response.status}):`, errorText);
            return NextResponse.json(
                {
                    error: `API returned ${response.status}`,
                    details: errorText,
                },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log(
            "Tags fetched successfully, count:",
            Array.isArray(data) ? data.length : "not an array"
        );

        return NextResponse.json(data, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    } catch (error) {
        console.error("Error fetching tags from spinup API:", error);
        // Check if it's a timeout error
        if (error.message && error.message.includes("timeout")) {
            return NextResponse.json(
                { error: "Request timeout - API took too long to respond" },
                { status: 504 }
            );
        }
        if (error.message && error.message.includes("ECONNREFUSED")) {
            return NextResponse.json(
                {
                    error: "Network error - Could not reach the API. The server cannot access https://spinup-002b0f.spinup.yale.edu/api/tags. This may require VPN or network configuration.",
                },
                { status: 503 }
            );
        }
        return NextResponse.json(
            {
                error: "Failed to fetch tags from spinup API",
                details: error.message || String(error),
            },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const response = await makeHttpsRequest(
            "https://spinup-002b0f.spinup.yale.edu/api/tags",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
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
        console.error("Error creating tag in spinup API:", error);
        return NextResponse.json(
            { error: "Failed to create tag in spinup API" },
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

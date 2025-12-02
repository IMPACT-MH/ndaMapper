import https from "https";

const API_BASE_URL = "https://nda.impact-mh.org/api/v1";

// Default CORS headers
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Makes an HTTPS request with proper SSL handling
 * @param {string} url - Full URL to request
 * @param {Object} options - Request options (method, headers, body, timeout)
 * @returns {Promise<Object>} Response object with ok, status, json(), text() methods
 */
export function makeHttpsRequest(url, options = {}) {
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

/**
 * Builds a full API URL from a path
 * @param {string} path - API path (e.g., "/tags", "/data-structures", "/tags/123")
 * @returns {string} Full URL
 */
export function buildApiUrl(path) {
    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Creates a standardized error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {string} details - Additional error details
 * @returns {NextResponse} Next.js response
 */
export function createErrorResponse(message, status = 500, details = null) {
    const { NextResponse } = require("next/server");
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
 * @param {Object} data - Response data
 * @param {Object} additionalHeaders - Additional headers to include
 * @returns {NextResponse} Next.js response
 */
export function createSuccessResponse(data, additionalHeaders = {}) {
    const { NextResponse } = require("next/server");
    return NextResponse.json(data, {
        headers: {
            ...CORS_HEADERS,
            ...additionalHeaders,
        },
    });
}

/**
 * Creates a standardized OPTIONS response
 * @returns {NextResponse} Next.js response
 */
export function createOptionsResponse() {
    const { NextResponse } = require("next/server");
    return new NextResponse(null, {
        status: 200,
        headers: CORS_HEADERS,
    });
}

export { API_BASE_URL, CORS_HEADERS };


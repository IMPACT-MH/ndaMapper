import {
    makeHttpsRequest,
    buildApiUrl,
    createErrorResponse,
    createSuccessResponse,
    createOptionsResponse,
} from "@/lib/api-client";

export async function GET() {
    try {
        const response = await makeHttpsRequest(buildApiUrl("/tags"), {
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 30000, // 30 second timeout
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API error (${response.status}):`, errorText);
            return createErrorResponse(
                `API returned ${response.status}`,
                response.status,
                errorText
            );
        }

        const data = await response.json();
        console.log(
            "Tags fetched successfully, count:",
            Array.isArray(data) ? data.length : "not an array"
        );

        return createSuccessResponse(data);
    } catch (error) {
        console.error("Error fetching tags:", error);
        // Check if it's a timeout error
        if (error.message && error.message.includes("timeout")) {
            return createErrorResponse(
                "Request timeout - API took too long to respond",
                504
            );
        }
        if (error.message && error.message.includes("ECONNREFUSED")) {
            return createErrorResponse(
                "Network error - Could not reach the API. This may require VPN or network configuration.",
                503
            );
        }
        return createErrorResponse(
            "Failed to fetch tags",
            500,
            error.message || String(error)
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const response = await makeHttpsRequest(buildApiUrl("/tags"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            timeout: 30000,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return createSuccessResponse(data);
    } catch (error) {
        console.error("Error creating tag:", error);
        return createErrorResponse(
            "Failed to create tag",
            500,
            error.message || String(error)
        );
    }
}

export async function OPTIONS() {
    return createOptionsResponse();
}


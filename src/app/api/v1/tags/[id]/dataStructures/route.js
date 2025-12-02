import {
    makeHttpsRequest,
    buildApiUrl,
    createErrorResponse,
    createSuccessResponse,
    createOptionsResponse,
} from "@/lib/api-client";

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        const response = await makeHttpsRequest(
            buildApiUrl(`/tags/${id}/dataStructures`),
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 30000, // 30 second timeout
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return createErrorResponse(
                `API returned ${response.status}`,
                response.status,
                errorText
            );
        }

        const data = await response.json();
        return createSuccessResponse(data);
    } catch (error) {
        console.error("Error fetching tag data structures:", error);
        return createErrorResponse(
            "Failed to fetch tag data structures",
            500,
            error.message || String(error)
        );
    }
}

export async function OPTIONS() {
    return createOptionsResponse();
}


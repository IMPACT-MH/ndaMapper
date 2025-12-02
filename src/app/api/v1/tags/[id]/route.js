import {
    makeHttpsRequest,
    buildApiUrl,
    createErrorResponse,
    createSuccessResponse,
    createOptionsResponse,
} from "@/lib/api-client";

export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const response = await makeHttpsRequest(buildApiUrl(`/tags/${id}`), {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 15000, // 15 second timeout
        });

        if (!response.ok) {
            const errorText = await response.text();
            return createErrorResponse(
                `API returned ${response.status}`,
                response.status,
                errorText
            );
        }

        const data = await response.json().catch(() => ({}));
        return createSuccessResponse(data);
    } catch (error) {
        console.error("Error deleting tag:", error);
        return createErrorResponse(
            "Failed to delete tag",
            500,
            error.message || String(error)
        );
    }
}

export async function PUT(request, { params }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const response = await makeHttpsRequest(buildApiUrl(`/tags/${id}`), {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            timeout: 30000, // 30 second timeout
        });

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
        console.error("Error updating tag:", error);
        return createErrorResponse(
            "Failed to update tag",
            500,
            error.message || String(error)
        );
    }
}

export async function OPTIONS() {
    return createOptionsResponse();
}


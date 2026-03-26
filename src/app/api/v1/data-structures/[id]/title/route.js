import {
    makeHttpsRequest,
    buildApiUrl,
    createErrorResponse,
    createSuccessResponse,
    createOptionsResponse,
} from "@/lib/api-client";
import { clearCache } from "../../cache";

export async function PUT(request, { params }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const response = await makeHttpsRequest(
            buildApiUrl(`/data-structures/${id}/title`),
            {
                method: "PUT",
                body: JSON.stringify(body),
                headers: { "Content-Type": "application/json" },
            }
        );
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Backend error (${response.status}) for PUT /data-structures/${id}/title:`, errorText);
            return createErrorResponse(
                "Failed to update data structure title",
                response.status,
                errorText
            );
        }
        const data = await response.json();
        clearCache();
        return createSuccessResponse(data);
    } catch (error) {
        return createErrorResponse(
            "Failed to update data structure title",
            500,
            error.message
        );
    }
}

export async function OPTIONS() {
    return createOptionsResponse();
}

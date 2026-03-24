import {
    makeHttpsRequest,
    buildApiUrl,
    createErrorResponse,
    createSuccessResponse,
    createOptionsResponse,
} from "@/lib/api-client";
import { clearCache } from "../route.js";

export async function PATCH(request, { params }) {
    try {
        const { id } = params;
        const body = await request.json();
        const response = await makeHttpsRequest(
            buildApiUrl(`/data-structures/${id}`),
            {
                method: "PATCH",
                body: JSON.stringify(body),
                headers: { "Content-Type": "application/json" },
            }
        );
        if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        clearCache();
        return createSuccessResponse(data);
    } catch (error) {
        return createErrorResponse(
            "Failed to update data structure",
            500,
            error.message
        );
    }
}

export async function OPTIONS() {
    return createOptionsResponse();
}

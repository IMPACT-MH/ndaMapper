/**
 * Centralized API utility for consistent error handling
 * @param {string} endpoint - API endpoint (relative to apiBaseUrl)
 * @param {object} options - Fetch options
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<any>} Parsed JSON response
 */
export const apiCall = async (
    endpoint,
    options = {},
    apiBaseUrl = "/api/spinup"
) => {
    try {
        const response = await fetch(`${apiBaseUrl}${endpoint}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        if (!response.ok) {
            let errorData;
            try {
                const text = await response.text();
                if (text) {
                    try {
                        errorData = JSON.parse(text);
                    } catch (parseErr) {
                        // If it's not JSON, use the text as the error message
                        errorData = { error: text, details: text };
                    }
                } else {
                    errorData = {};
                }
            } catch (err) {
                // If we can't read the response, create a basic error object
                errorData = {};
            }

            // Build a user-friendly error message
            const errorMessage = 
                errorData.error || 
                errorData.message || 
                errorData.details ||
                `API error: ${response.status} ${response.statusText}`;

            // For 400 errors, provide more context
            if (response.status === 400) {
                const enhancedError = new Error(errorMessage);
                enhancedError.status = 400;
                enhancedError.details = errorData.details || errorData;
                throw enhancedError;
            }

            // For other errors, throw with status
            const enhancedError = new Error(errorMessage);
            enhancedError.status = response.status;
            enhancedError.details = errorData.details || errorData;
            throw enhancedError;
        }

        // Handle empty responses
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            return null;
        }

        const text = await response.text();
        if (!text.trim()) {
            return null;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (err) {
            console.error(`Failed to parse JSON from ${endpoint}:`, err);
            throw new Error("Invalid JSON response from server");
        }

        return data;
    } catch (err) {
        console.error(`API call failed [${endpoint}]:`, err);
        throw err;
    }
};

/**
 * Fetch tags with proper error handling
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<Array>} Array of tags
 */
export const fetchTags = async (apiBaseUrl = "/api/spinup") => {
    const data = await apiCall("/tags", {}, apiBaseUrl);
    if (!Array.isArray(data)) {
        console.warn("Expected array for tags, got:", typeof data);
        return [];
    }
    return data;
};

/**
 * Create a tag with validation
 * @param {string} name - Tag name
 * @param {string} tagType - Tag type ("Category" or "Data Type")
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<object>} Created tag
 */
export const createTag = async (name, tagType, apiBaseUrl = "/api/spinup") => {
    // Validate: only check that it's not empty after trimming whitespace
    const trimmedName = name ? name.trim() : "";
    if (!trimmedName) {
        throw new Error("Tag name cannot be empty");
    }
    // Check length on original name (spaces allowed)
    if (name.length > 100) {
        throw new Error("Tag name too long (max 100 characters)");
    }
    if (name.includes(":")) {
        throw new Error("Tag name cannot contain colons");
    }

    // Preserve original name with spaces (only trimmed for validation)
    const newTag = await apiCall(
        "/tags",
        {
            method: "POST",
            body: JSON.stringify({
                name: name, // Keep original with spaces
                tagType: tagType,
            }),
        },
        apiBaseUrl
    );

    if (!newTag || !newTag.id) {
        throw new Error("Invalid tag data received from server");
    }

    return newTag;
};

/**
 * Update a tag
 * @param {string} tagId - Tag ID
 * @param {string} newName - New tag name
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<object>} Updated tag
 */
export const updateTag = async (tagId, newName, apiBaseUrl = "/api/spinup") => {
    if (!newName || !newName.trim()) {
        throw new Error("Tag name cannot be empty");
    }
    if (newName.length > 100) {
        throw new Error("Tag name too long (max 100 characters)");
    }
    if (newName.includes(":")) {
        throw new Error("Tag name cannot contain colons");
    }

    // Validate: only check that it's not empty after trimming whitespace
    const trimmedName = newName ? newName.trim() : "";
    if (!trimmedName) {
        throw new Error("Tag name cannot be empty");
    }

    // Preserve original name with spaces (only trimmed for validation)
    return await apiCall(
        `/tags/${tagId}`,
        {
            method: "PUT",
            body: JSON.stringify({ name: newName }), // Keep original with spaces
        },
        apiBaseUrl
    );
};

/**
 * Delete a tag
 * @param {string} tagId - Tag ID
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<void>}
 */
export const deleteTag = async (tagId, apiBaseUrl = "/api/spinup") => {
    await apiCall(`/tags/${tagId}`, { method: "DELETE" }, apiBaseUrl);
};

/**
 * Assign a tag to a data structure
 * @param {string} tagId - Tag ID
 * @param {string} structureShortName - Structure short name
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<void>}
 */
export const assignTag = async (
    tagId,
    structureShortName,
    apiBaseUrl = "/api/spinup"
) => {
    await apiCall(
        "/tags/assign",
        {
            method: "POST",
            body: JSON.stringify({
                tagId: tagId,
                dataStructureShortName: structureShortName,
            }),
        },
        apiBaseUrl
    );
};

/**
 * Log an audit trail entry
 * @param {object} auditData - Audit data
 * @param {string} auditData.action - Action type (create, update, delete, assign, remove)
 * @param {string} auditData.tagId - Tag ID
 * @param {string} auditData.tagName - Tag name
 * @param {string} auditData.tagType - Tag type (Category, Data Type, etc.)
 * @param {string} auditData.structureShortName - Structure short name (if applicable)
 * @param {string} auditData.oldValue - Old value (for updates)
 * @param {string} auditData.newValue - New value (for updates)
 * @param {string} auditData.userId - User ID (optional)
 * @param {object} auditData.metadata - Additional metadata (optional)
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<void>}
 */
export const logAuditEvent = async (
    auditData,
    apiBaseUrl = "/api/spinup"
) => {
    try {
        await apiCall(
            "/audit",
            {
                method: "POST",
                body: JSON.stringify(auditData),
            },
            apiBaseUrl
        );
    } catch (err) {
        // Don't throw - audit logging should not break the main flow
        console.error("Failed to log audit event:", err);
    }
};

/**
 * Fetch audit trail logs
 * @param {object} filters - Filter options
 * @param {string} filters.tagId - Filter by tag ID
 * @param {string} filters.structureShortName - Filter by structure short name
 * @param {string} filters.action - Filter by action type
 * @param {number} filters.limit - Limit number of results
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<Array>} Array of audit log entries
 */
export const fetchAuditLogs = async (
    filters = {},
    apiBaseUrl = "/api/spinup"
) => {
    const params = new URLSearchParams();
    if (filters.tagId) params.append("tagId", filters.tagId);
    if (filters.structureShortName)
        params.append("structureShortName", filters.structureShortName);
    if (filters.action) params.append("action", filters.action);
    if (filters.limit) params.append("limit", filters.limit.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/audit?${queryString}` : "/audit";

    return await apiCall(endpoint, { method: "GET" }, apiBaseUrl);
};

/**
 * Fetch data structures for a tag
 * @param {string} tagId - Tag ID
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<Array>} Array of data structures
 */
export const fetchTagDataStructures = async (
    tagId,
    apiBaseUrl = "/api/spinup"
) => {
    const data = await apiCall(`/tags/${tagId}/dataStructures`, {}, apiBaseUrl);
    return Array.isArray(data?.dataStructures) ? data.dataStructures : [];
};

/**
 * Centralized API utility for consistent error handling
 * @param {string} endpoint - API endpoint (relative to apiBaseUrl)
 * @param {object} options - Fetch options
 * @param {string} apiBaseUrl - Base URL for API
 * @returns {Promise<any>} Parsed JSON response
 */
export const apiCall = async (endpoint, options = {}, apiBaseUrl = "/api/spinup") => {
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
                errorData = await response.json();
            } catch (err) {
                // If response isn't JSON, use status text
                throw new Error(
                    `API error: ${response.status} ${response.statusText}`
                );
            }
            throw new Error(
                errorData.error ||
                    `API error: ${response.status} ${response.statusText}`
            );
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
    if (!name || !name.trim()) {
        throw new Error("Tag name cannot be empty");
    }
    if (name.length > 100) {
        throw new Error("Tag name too long (max 100 characters)");
    }
    if (name.includes(":")) {
        throw new Error("Tag name cannot contain colons");
    }

    const newTag = await apiCall(
        "/tags",
        {
            method: "POST",
            body: JSON.stringify({
                name: name.trim(),
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

    return await apiCall(
        `/tags/${tagId}`,
        {
            method: "PUT",
            body: JSON.stringify({ name: newName.trim() }),
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


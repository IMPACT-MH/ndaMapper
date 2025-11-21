import { useState, useCallback, useMemo } from "react";
import {
    fetchTags,
    createTag as apiCreateTag,
    updateTag as apiUpdateTag,
    deleteTag as apiDeleteTag,
} from "@/utils/api";

/**
 * Custom hook for managing tags (categories or data types)
 * Eliminates code duplication between category and data type tag management
 */
export const useTagManagement = (tagType, apiBaseUrl = "/api/spinup") => {
    const [available, setAvailable] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [newName, setNewName] = useState("");
    const [showCreateInput, setShowCreateInput] = useState(false);
    const [editing, setEditing] = useState({ id: null, name: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Filter tags by type
    const filterTagsByType = useCallback((tags) => {
        if (tagType === "Data Type") {
            return tags.filter(
                (tag) =>
                    tag.tagType === "Data Type" &&
                    tag.tagType !== "Removed Category" &&
                    tag.tagType !== "Removed Data Type" &&
                    !tag.name.startsWith("REMOVED_CATEGORY:") &&
                    !tag.name.startsWith("REMOVED_DATATYPE:")
            );
        } else {
            // Category tags (tagType === "Category" or empty/null/undefined)
            return tags.filter(
                (tag) =>
                    (!tag.tagType || tag.tagType !== "Data Type") &&
                    tag.tagType !== "Removed Category" &&
                    tag.tagType !== "Removed Data Type" &&
                    !tag.name.startsWith("REMOVED_CATEGORY:") &&
                    !tag.name.startsWith("REMOVED_DATATYPE:")
            );
        }
    }, [tagType]);

    // Fetch tags from API
    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const allTags = await fetchTags(apiBaseUrl);
            const filtered = filterTagsByType(allTags);
            setAvailable(filtered);
        } catch (err) {
            console.error(`Error fetching ${tagType} tags:`, err);
            setError(`Failed to load ${tagType.toLowerCase()} tags`);
        } finally {
            setLoading(false);
        }
    }, [tagType, apiBaseUrl, filterTagsByType]);

    // Create a new tag
    const create = useCallback(
        async (name = null) => {
            const tagName = name || newName;
            if (!tagName || !tagName.trim()) {
                throw new Error("Tag name cannot be empty");
            }

            try {
                setLoading(true);
                setError(null);
                const newTag = await apiCreateTag(tagName.trim(), tagType, apiBaseUrl);

                setAvailable((prev) => [...prev, newTag]);
                setSelected((prev) => new Set([...prev, newTag.id]));
                setNewName("");
                setShowCreateInput(false);

                return newTag;
            } catch (err) {
                console.error(`Error creating ${tagType} tag:`, err);
                setError(err.message);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [newName, tagType, apiBaseUrl]
    );

    // Update an existing tag
    const update = useCallback(
        async (tagId, updatedName) => {
            if (!updatedName || !updatedName.trim()) {
                throw new Error("Tag name cannot be empty");
            }

            try {
                setLoading(true);
                setError(null);
                const updatedTag = await apiUpdateTag(tagId, updatedName, apiBaseUrl);

                setAvailable((prev) =>
                    prev.map((tag) => (tag.id === tagId ? updatedTag : tag))
                );
                setEditing({ id: null, name: "" });

                return updatedTag;
            } catch (err) {
                console.error(`Error updating ${tagType} tag:`, err);
                setError(err.message);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [tagType, apiBaseUrl]
    );

    // Delete a tag
    const remove = useCallback(
        async (tagId) => {
            try {
                setLoading(true);
                setError(null);
                await apiDeleteTag(tagId, apiBaseUrl);

                setAvailable((prev) => prev.filter((tag) => tag.id !== tagId));
                setSelected((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(tagId);
                    return newSet;
                });
            } catch (err) {
                console.error(`Error deleting ${tagType} tag:`, err);
                setError(err.message);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [tagType, apiBaseUrl]
    );

    // Toggle selection
    const toggleSelection = useCallback((tagId) => {
        setSelected((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(tagId)) {
                newSet.delete(tagId);
            } else {
                newSet.add(tagId);
            }
            return newSet;
        });
    }, []);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelected(new Set());
    }, []);

    // Start editing
    const startEditing = useCallback((tagId, tagName) => {
        setEditing({ id: tagId, name: tagName });
    }, []);

    // Cancel editing
    const cancelEditing = useCallback(() => {
        setEditing({ id: null, name: "" });
    }, []);

    return {
        // State
        available,
        selected,
        newName,
        showCreateInput,
        editing,
        loading,
        error,

        // Setters
        setNewName,
        setShowCreateInput,
        setSelected,
        setError,

        // Actions
        fetch,
        create,
        update,
        remove,
        toggleSelection,
        clearSelection,
        startEditing,
        cancelEditing,
    };
};


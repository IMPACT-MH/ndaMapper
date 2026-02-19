// components/CategoryTagManagement.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Search } from "lucide-react";
import type { DataStructure, CustomTag } from "@/types";

interface DatabaseStructureEntry {
  dataStructureId: string | number;
  shortName?: string;
}

interface TagWithCount extends CustomTag {
  dataStructures?: unknown[];
}

interface CategoryTagManagementProps {
  structure: DataStructure | null;
  structureId?: string;
  structureTags?: CustomTag[];
  onTagsUpdate?: (tags: CustomTag[]) => void;
  apiBaseUrl?: string;
  dataStructuresMap?: Record<string, DatabaseStructureEntry>;
  isLoadingStructures?: boolean;
}

const CategoryTagManagement = ({
  structure,
  structureId,
  structureTags: initialTags = [],
  onTagsUpdate,
  apiBaseUrl = "https://nda.impact-mh.org/api/v1/",
  dataStructuresMap = {},
  isLoadingStructures = false,
}: CategoryTagManagementProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<TagWithCount[]>([]);
  const [structureTags, setStructureTags] = useState<CustomTag[]>(initialTags);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clickedNdaCategory, setClickedNdaCategory] = useState<string | null>(null);

  useEffect(() => {
    setStructureTags(initialTags);
  }, [initialTags]);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/tags`);
      if (!response.ok) throw new Error("Failed to fetch tags");
      const data = (await response.json()) as TagWithCount[];
      setAvailableTags(data);
    } catch (err) {
      console.error("Error fetching tags:", err);
      setError("Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (isModalOpen) {
      fetchTags();
      setSelectedTags(new Set(structureTags.map((t) => t.id)));
      setError(null);
    }
  }, [isModalOpen, structureTags, fetchTags]);

  const createTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const response = await fetch(`${apiBaseUrl}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to create tag");
      }

      const newTag = (await response.json()) as CustomTag;
      setAvailableTags((prev) => [...prev, newTag]);
      setSelectedTags((prev) => new Set([...prev, newTag.id]));
      setNewTagName("");

      return newTag;
    } catch (err) {
      console.error("Error creating tag:", err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const assignTag = async (tagId: string) => {
    try {
      if (isLoadingStructures) {
        throw new Error(
          "Loading data structures, please try again in a moment..."
        );
      }

      const existingStructure =
        structure ? dataStructuresMap[structure.shortName] : undefined;

      if (!existingStructure) {
        console.error("Available structures:", Object.keys(dataStructuresMap));
        throw new Error(
          `Data structure "${structure?.shortName}" not found in backend. Available: ${Object.keys(dataStructuresMap).join(", ")}`
        );
      }

      const response = await fetch(`${apiBaseUrl}/tags/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId,
          dataStructureId: existingStructure.dataStructureId,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to assign tag");
      }

      return true;
    } catch (err) {
      console.error("Error assigning tag:", err);
      throw err;
    }
  };

  const removeTag = async (tagId: string) => {
    try {
      const existingStructure =
        structure ? dataStructuresMap[structure.shortName] : undefined;

      if (!existingStructure) {
        throw new Error(`Data structure "${structure?.shortName}" not found`);
      }

      const response = await fetch(`${apiBaseUrl}/tags/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId,
          dataStructureId: existingStructure.dataStructureId,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to remove tag");
      }

      const updated = structureTags.filter((t) => t.id !== tagId);
      setStructureTags(updated);
      onTagsUpdate?.(updated);

      return true;
    } catch (err) {
      console.error("Error removing tag:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    setError(null);

    try {
      const currentTagIds = new Set(structureTags.map((t) => t.id));
      const toAdd = Array.from(selectedTags).filter(
        (id) => !currentTagIds.has(id)
      );
      const toRemove = Array.from(currentTagIds).filter(
        (id) => !selectedTags.has(id)
      );

      if (toAdd.length === 0 && toRemove.length === 0) {
        setIsModalOpen(false);
        setSelectedTags(new Set());
        setClickedNdaCategory(null);
        setLoading(false);
        return;
      }

      for (const tagId of toRemove) {
        await removeTag(tagId);
      }

      for (const tagId of toAdd) {
        await assignTag(tagId);
      }

      const newStructureTags = availableTags.filter((tag) =>
        selectedTags.has(tag.id)
      );
      setStructureTags(newStructureTags);
      onTagsUpdate?.(newStructureTags);

      setIsModalOpen(false);
      setSelectedTags(new Set());
      setClickedNdaCategory(null);
    } catch (err) {
      setError(
        "Failed to save changes: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteTag = async (tagId: string) => {
    if (!confirm("Are you sure you want to permanently delete this tag?")) {
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/tags/${tagId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorData.error || "Failed to delete tag");
      }

      setAvailableTags((prev) => prev.filter((t) => t.id !== tagId));
      setSelectedTags((prev) => {
        const newSet = new Set(prev);
        newSet.delete(tagId);
        return newSet;
      });
    } catch (err) {
      console.error("Error deleting tag:", err);
      alert(
        `Failed to delete tag: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  // Suppress unused variable warning — deleteTag is available for future use
  void deleteTag;

  const filteredAvailableTags = availableTags.filter(
    (tag) =>
      !searchTerm || tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Tags Display */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Display Custom Tags (from your API) */}
        {structureTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
          >
            {tag.name}
            <span className="ml-1 text-xs text-orange-500">★</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Remove "${tag.name}" tag?`)) {
                  removeTag(tag.id);
                }
              }}
              className="ml-1 hover:text-blue-900 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
              aria-label={`Remove ${tag.name} tag`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {/* Display NDA Categories — hide if custom tags exist */}
        {structure?.categories?.map((category) => {
          const hasCustomTags = structureTags && structureTags.length > 0;
          if (hasCustomTags) return null;

          return (
            <span
              key={category}
              onClick={(e) => {
                e.stopPropagation();
                setClickedNdaCategory(category);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs cursor-pointer hover:bg-blue-200 transition-colors"
              title="Click to add custom category tags"
            >
              {category}
            </span>
          );
        })}

        {/* Purple badge if categories replaced with custom tags */}
        {structureTags &&
          structureTags.length > 0 &&
          (structure?.categories?.length ?? 0) > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs cursor-pointer hover:bg-purple-200 transition-colors"
              title="Custom category tags (click to modify)"
            >
              {structure!.categories![0]}
              <span className="text-xs text-orange-500">★</span>
            </span>
          )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setClickedNdaCategory(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-gray-400 text-gray-600 rounded text-xs hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Tag
        </button>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
              setClickedNdaCategory(null);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b">
              <div>
                <h2 className="text-xl font-semibold">Manage Custom Tags</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {structure?.title || structure?.shortName}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setClickedNdaCategory(null);
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search custom tags..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Selected Tags Preview */}
              {selectedTags.size > 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <h3 className="text-sm font-semibold text-blue-700 mb-2">
                    Selected ({selectedTags.size})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(selectedTags).map((tagId) => {
                      const tag = availableTags.find((t) => t.id === tagId);
                      return tag ? (
                        <div
                          key={tag.id}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                        >
                          <span>{tag.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTags((prev) => {
                                const newSet = new Set(prev);
                                newSet.delete(tag.id);
                                return newSet;
                              });
                            }}
                            className="ml-1 hover:bg-blue-200 rounded-full w-4 h-4 flex items-center justify-center text-blue-600 hover:text-blue-800 font-bold"
                            title="Remove from selection"
                          >
                            ×
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Available Tags */}
              {loading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                </div>
              ) : (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Available Custom Tags
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {filteredAvailableTags.length > 0 ? (
                        filteredAvailableTags.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => {
                              setSelectedTags((prev) => {
                                const newSet = new Set(prev);
                                if (newSet.has(tag.id)) {
                                  newSet.delete(tag.id);
                                } else {
                                  newSet.add(tag.id);
                                }
                                return newSet;
                              });
                            }}
                            className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm transition-all ${
                              selectedTags.has(tag.id)
                                ? "bg-blue-500 text-white"
                                : "bg-white text-gray-700 border border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                            }`}
                          >
                            {tag.name}
                            {tag.dataStructures && (
                              <span className="ml-2 text-xs opacity-70">
                                ({tag.dataStructures.length})
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="text-gray-500 text-sm">No tags found</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Create New Tag */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Create New Custom Tag
                </h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name..."
                    className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        createTag();
                      }
                    }}
                  />
                  <button
                    onClick={createTag}
                    disabled={!newTagName.trim() || loading}
                    className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4 inline mr-2" />
                    Create & Add to Selection
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedTags(new Set());
                  setClickedNdaCategory(null);
                  setError(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors text-sm font-medium"
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CategoryTagManagement;

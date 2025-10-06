// components/CategoryTagManagement.js
"use client";

import { useState, useEffect, useRef } from "react";
import { X, Plus, Search, Tags } from "lucide-react";

const CategoryTagManagement = ({ 
  structure, // This will be the NDA structure object
  structureId, // The actual ID for your database
  structureTags: initialTags = [],
  onTagsUpdate,
  apiBaseUrl="https://spinup-002b0f.spinup.yale.edu/api/"
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState([]);
  const [structureTags, setStructureTags] = useState(initialTags);
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

      useEffect(() => {
    setStructureTags(initialTags);
  }, [initialTags]);

    useEffect(() => {
    if (isModalOpen) {
      fetchTags();
      // Initialize selected tags with current structure tags
      setSelectedTags(new Set(structureTags.map(t => t.id)));
      setError(null);
    }
  }, [isModalOpen, structureTags]); // Added structureTags to dependencies


  const fetchTags = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${apiBaseUrl}/tags`);
        if (!response.ok) throw new Error("Failed to fetch tags");
        const data = await response.json();
        setAvailableTags(data);
      } catch (err) {
        console.error("Error fetching tags:", err);
        setError("Failed to load tags");
      } finally {
        setLoading(false);
      }
    };

  const createTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const response = await fetch(`${apiBaseUrl}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newTagName.trim(),
          description: newTagDescription.trim() || `Category: ${newTagName.trim()}`
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create tag");
      }
      
      const newTag = await response.json();
      
      // Update available tags
      setAvailableTags(prev => [...prev, newTag]);
      
      // Add to selected
      setSelectedTags(prev => new Set([...prev, newTag.id]));
      
      // Clear inputs
      setNewTagName("");
      setNewTagDescription("");
      
      return newTag;
    } catch (err) {
      console.error("Error creating tag:", err);
      setError(err.message);
      throw err;
    }
  };

  const assignTag = async (tagId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/tags/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId: tagId,
          dataStructureId: structureId || structure.id || structure.shortName
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to assign tag");
      }
      
      return true;
    } catch (err) {
      console.error("Error assigning tag:", err);
      throw err;
    }
  };

  const removeTag = async (tagId) => {
    try {
      const response = await fetch(`${apiBaseUrl}/tags/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId: tagId,
          dataStructureId: structureId || structure.id || structure.shortName
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to remove tag");
      }
      
      // Update local state
      setStructureTags(prev => prev.filter(t => t.id !== tagId));
      
      // Notify parent
      if (onTagsUpdate) {
        onTagsUpdate(structureTags.filter(t => t.id !== tagId));
      }
      
      return true;
    } catch (err) {
      console.error("Error removing tag:", err);
      setError(err.message);
    }
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get current tag IDs
      const currentTagIds = new Set(structureTags.map(t => t.id));
      
      // Find tags to add and remove
      const toAdd = Array.from(selectedTags).filter(id => !currentTagIds.has(id));
      const toRemove = Array.from(currentTagIds).filter(id => !selectedTags.has(id));
      
      // Process removals
      for (const tagId of toRemove) {
        await removeTag(tagId);
      }
      
      // Process additions
      for (const tagId of toAdd) {
        await assignTag(tagId);
      }
      
      // Update structure tags
      const newStructureTags = availableTags.filter(tag => selectedTags.has(tag.id));
      setStructureTags(newStructureTags);
      
      // Notify parent
      if (onTagsUpdate) {
        onTagsUpdate(newStructureTags);
      }
      
      // Close modal
      setIsModalOpen(false);
      setSelectedTags(new Set());
    } catch (err) {
      setError("Failed to save changes: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteTag = async (tagId) => {
  if (!confirm('Are you sure you want to permanently delete this tag?')) {
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/tags/${tagId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to delete tag");
    }

    // Remove from available tags
    setAvailableTags(prev => prev.filter(t => t.id !== tagId));
    
    // Remove from selected tags Set
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      newSet.delete(tagId);
      return newSet;
    });
    
  } catch (err) {
    console.error("Error deleting tag:", err);
    alert(`Failed to delete tag: ${err.message}`);
  }
};

  // Filter available tags based on search
  const filteredAvailableTags = availableTags.filter(tag => 
    !searchTerm || tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Tags Display */}
      <div className="flex flex-wrap gap-2 items-center">
        {structureTags.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
          >
            {tag.name}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Remove "${tag.name}" tag?`)) {
                  removeTag(tag.id);
                }
              }}
              className="ml-1 hover:text-blue-900"
              aria-label={`Remove ${tag.name} tag`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-gray-400 text-gray-600 rounded text-xs hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Category
        </button>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b">
              <div>
                <h2 className="text-xl font-semibold">Manage Categories</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {structure?.title || structure?.shortName}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
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
                    placeholder="Search categories..."
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
                    {Array.from(selectedTags).map(tagId => {
                      const tag = availableTags.find(t => t.id === tagId);
                      return tag ? (
                        <div
                          key={tag.id}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                        >
                          <span>{tag.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTag(tag.id);
                            }}
                            className="ml-1 hover:bg-blue-200 rounded-full w-4 h-4 flex items-center justify-center text-blue-600 hover:text-blue-800 font-bold"
                            title="Delete tag"
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
                    Available Categories
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {filteredAvailableTags.length > 0 ? (
                        filteredAvailableTags.map(tag => (
                          <button
                            key={tag.id}
                            onClick={() => {
                              setSelectedTags(prev => {
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
                                ? 'bg-blue-500 text-white'
                                : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-400 hover:bg-blue-50'
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
                        <p className="text-gray-500 text-sm">No categories found</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Create New Tag */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Create New Category
                </h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Category name..."
                    className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                  />
                  <input
                    type="text"
                    value={newTagDescription}
                    onChange={(e) => setNewTagDescription(e.target.value)}
                    placeholder="Description (optional)..."
                    className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                  />
                  <button
                    onClick={createTag}
                    disabled={!newTagName.trim() || loading}
                    className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors text-sm font-medium"
                  >
                    Create & Add to List
                  </button>
                </div>
              </div>

              {/* Error Display */}
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
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CategoryTagManagement;
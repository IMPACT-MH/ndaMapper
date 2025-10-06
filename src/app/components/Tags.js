"use client";

import { useState, useEffect } from "react";

const Tags = ({ structure }) => {
  const [tags, setTags] = useState([]); // all available tags from backend
  const [structureTags, setStructureTags] = useState([]); // tags assigned to this structure
  const [newTagName, setNewTagName] = useState(""); // input for creating new tag
  const [tagInput, setTagInput] = useState(""); // current input value for autocomplete
  const [filteredTags, setFilteredTags] = useState([]); // suggestions
  const [message, setMessage] = useState("");

  const API_BASE = "https://impact-mh-portal-domain.com/api"; // replace with your API base

  // Fetch all tags from backend
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await fetch(`${API_BASE}/tags`);
        if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`);
        const data = await res.json();
        setTags(data);
      } catch (err) {
        console.error("Error fetching tags:", err);
      }
    };
    fetchTags();
  }, []);

  // Filter tags for autocomplete suggestions
  useEffect(() => {
    if (!tagInput.trim()) {
      setFilteredTags([]);
      return;
    }
    const lowerInput = tagInput.toLowerCase();
    setFilteredTags(tags.filter(tag => tag.name.toLowerCase().includes(lowerInput)));
  }, [tagInput, tags]);

  // Assign a tag to the structure
  const handleAssignTag = async (tagId) => {
    if (!structure?.id) return;
    if (structureTags.some(t => t.id === tagId)) return; // prevent duplicates
    try {
      const res = await fetch(`${API_BASE}/tags/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataStructureId: structure.id, tagId }),
      });
      if (!res.ok) throw new Error("Failed to assign tag");
      const assignedTag = tags.find(t => t.id === tagId);
      setStructureTags([...structureTags, assignedTag]);
      setMessage(`Tag "${assignedTag.name}" assigned!`);
      setTagInput("");
    } catch (err) {
      console.error(err);
      setMessage("Error assigning tag");
    }
  };

  // Create a new tag and assign it
  const handleCreateTag = async () => {
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;
    try {
      const res = await fetch(`${API_BASE}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!res.ok) throw new Error("Failed to create tag");
      const createdTag = await res.json();
      setTags([...tags, createdTag]);
      handleAssignTag(createdTag.id); // assign immediately
      setMessage(`Tag "${createdTag.name}" created and assigned!`);
      setNewTagName("");
    } catch (err) {
      console.error(err);
      setMessage("Error creating tag");
    }
  };

  // Remove a tag from the structure
  const handleRemoveTag = async (tagId) => {
    try {
      const res = await fetch(`${API_BASE}/tags/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataStructureId: structure.id, tagId }),
      });
      if (!res.ok) throw new Error("Failed to remove tag");
      setStructureTags(structureTags.filter(t => t.id !== tagId));
      setMessage("Tag removed");
    } catch (err) {
      console.error(err);
      setMessage("Error removing tag");
    }
  };

  return (
    <div className="mt-4 p-4 border rounded bg-gray-50">
      <h3 className="font-bold mb-2">Tags for {structure?.shortName}</h3>

      {/* Assigned Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {structureTags.map(tag => (
          <div key={tag.id} className="px-2 py-1 bg-blue-100 text-blue-700 rounded flex items-center space-x-1">
            <span>{tag.name}</span>
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="text-red-500 hover:text-red-700 font-bold"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Autocomplete Input */}
      <input
        type="text"
        placeholder="Type to search tags..."
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        className="border rounded px-2 py-1 w-full mb-1"
      />

      {filteredTags.length > 0 && (
        <div className="border rounded bg-white max-h-40 overflow-y-auto mb-2">
          {filteredTags.map(tag => (
            <div
              key={tag.id}
              className="p-2 cursor-pointer hover:bg-gray-100"
              onClick={() => handleAssignTag(tag.id)}
            >
              {tag.name}
            </div>
          ))}
        </div>
      )}

      {/* Create New Tag */}
      <div className="flex space-x-2 mt-2">
        <input
          type="text"
          placeholder="Or create a new tag..."
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          className="border rounded px-2 py-1 flex-1"
        />
        <button
          onClick={handleCreateTag}
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
        >
          Create & Assign
        </button>
      </div>

      {/* Feedback Message */}
      {message && <p className="mt-2 text-green-600">{message}</p>}
    </div>
  );
};

export default Tags;

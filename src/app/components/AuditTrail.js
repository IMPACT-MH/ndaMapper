"use client";

import { useState, useEffect } from "react";
import { Clock, Tag, Database, User, X, Filter } from "lucide-react";
import { fetchTags as apiFetchTags, fetchTagDataStructures } from "@/utils/api";

const AuditTrail = ({ tagId, structureShortName, tagTypeFilter, apiBaseUrl = "/api/spinup" }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState("all"); // all, create, update, delete, assign, remove

    useEffect(() => {
        loadLogs();
    }, [tagId, structureShortName, filter, tagTypeFilter, apiBaseUrl]);

    const loadLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch all tags from the API
            const allTags = await apiFetchTags(apiBaseUrl);
            
            if (!Array.isArray(allTags)) {
                throw new Error("Invalid response from tags API");
            }
            
            // Separate removed tags for deletion audit entries
            const removedTags = allTags.filter(tag => 
                tag.tagType === "Removed Category" || 
                tag.tagType === "Removed Data Type" ||
                tag.name.startsWith("REMOVED_CATEGORY:") ||
                tag.name.startsWith("REMOVED_DATATYPE:")
            );
            
            // Filter active tags
            let filteredTags = allTags.filter(tag => 
                tag.tagType !== "Removed Category" && 
                tag.tagType !== "Removed Data Type" &&
                !tag.name.startsWith("REMOVED_CATEGORY:") &&
                !tag.name.startsWith("REMOVED_DATATYPE:")
            );
            
            // Filter by tag type if specified (Category or Data Type)
            if (tagTypeFilter === "Category") {
                filteredTags = filteredTags.filter(tag => 
                    !tag.tagType || tag.tagType === "Category" || tag.tagType === ""
                );
            } else if (tagTypeFilter === "Data Type") {
                filteredTags = filteredTags.filter(tag => 
                    tag.tagType === "Data Type"
                );
            }
            
            if (tagId) {
                filteredTags = filteredTags.filter(tag => tag.id === tagId);
            }
            
            // Build audit log entries from tags
            const auditLogs = [];
            
            // Process active tags - limit to first 50 to avoid too many API calls
            // If filtering by structure, we can process more since we'll skip most
            const limit = structureShortName ? 100 : 50;
            const tagsToProcess = filteredTags.slice(0, limit);
            
            for (const tag of tagsToProcess) {
                // Get data structures for this tag
                let dataStructures = [];
                try {
                    dataStructures = await fetchTagDataStructures(tag.id, apiBaseUrl);
                } catch (err) {
                    console.warn(`Failed to fetch data structures for tag ${tag.id}:`, err);
                    // If filtering by structure and we can't fetch, skip this tag
                    if (structureShortName) {
                        continue;
                    }
                    // Otherwise, continue with empty data structures
                    dataStructures = [];
                }
                
                // Filter by structure if specified
                if (structureShortName) {
                    const hasStructure = dataStructures.some(
                        ds => ds.shortName === structureShortName
                    );
                    if (!hasStructure) continue;
                }
                
                // Create audit log entry for tag creation
                const createdAt = tag.createdAt || tag.created_at || new Date().toISOString();
                auditLogs.push({
                    id: `create-${tag.id}`,
                    timestamp: createdAt,
                    action: "create",
                    tagId: tag.id,
                    tagName: tag.name,
                    tagType: tag.tagType || "Category",
                    structureShortName: structureShortName || null,
                    newValue: tag.name,
                    description: tag.description || null,
                });
                
                // Create audit log entries for tag assignments
                if (dataStructures.length > 0) {
                    for (const ds of dataStructures) {
                        if (structureShortName && ds.shortName !== structureShortName) continue;
                        
                        auditLogs.push({
                            id: `assign-${tag.id}-${ds.shortName}`,
                            timestamp: createdAt, // Use tag creation time as assignment time
                            action: "assign",
                            tagId: tag.id,
                            tagName: tag.name,
                            tagType: tag.tagType || "Category",
                            structureShortName: ds.shortName,
                        });
                    }
                }
                
                // Check description for update information
                if (tag.description) {
                    // Try to parse audit info from description
                    const updateMatch = tag.description.match(/Updated from "([^"]+)" to "([^"]+)"/);
                    if (updateMatch) {
                        auditLogs.push({
                            id: `update-${tag.id}`,
                            timestamp: tag.updatedAt || tag.updated_at || createdAt,
                            action: "update",
                            tagId: tag.id,
                            tagName: tag.name,
                            tagType: tag.tagType || "Category",
                            oldValue: updateMatch[1],
                            newValue: updateMatch[2],
                        });
                    }
                }
            }
            
            // Process removed tags for deletion audit entries - limit to first 20
            if (filter === "all" || filter === "delete") {
                // Filter removed tags by type if specified
                let filteredRemovedTags = removedTags;
                if (tagTypeFilter === "Category") {
                    filteredRemovedTags = removedTags.filter(tag => 
                        tag.tagType === "Removed Category" || tag.name.startsWith("REMOVED_CATEGORY:")
                    );
                } else if (tagTypeFilter === "Data Type") {
                    filteredRemovedTags = removedTags.filter(tag => 
                        tag.tagType === "Removed Data Type" || tag.name.startsWith("REMOVED_DATATYPE:")
                    );
                }
                
                const removedTagsToProcess = filteredRemovedTags.slice(0, 20);
                
                for (const removedTag of removedTagsToProcess) {
                    // Parse removed tag name to extract original tag info
                    let originalTagName = removedTag.name;
                    let removedStructureShortName = null;
                    
                    if (removedTag.name.startsWith("REMOVED_CATEGORY:")) {
                        const parts = removedTag.name.split(":");
                        if (parts.length >= 3) {
                            removedStructureShortName = parts[1];
                            originalTagName = parts.slice(2).join(":");
                        }
                    } else if (removedTag.name.startsWith("REMOVED_DATATYPE:")) {
                        const parts = removedTag.name.split(":");
                        if (parts.length >= 2) {
                            removedStructureShortName = parts[1];
                            originalTagName = "Original Data Type";
                        }
                    }
                    
                    // Filter by structure if specified
                    if (structureShortName && removedStructureShortName !== structureShortName) {
                        continue;
                    }
                    
                    // Create deletion audit entry (don't fetch data structures for removed tags to avoid errors)
                    const createdAt = removedTag.createdAt || removedTag.created_at || new Date().toISOString();
                    auditLogs.push({
                        id: `delete-${removedTag.id}`,
                        timestamp: createdAt,
                        action: "delete",
                        tagId: removedTag.id,
                        tagName: originalTagName,
                        tagType: removedTag.tagType === "Removed Category" ? "Category" : "Data Type",
                        structureShortName: removedStructureShortName || structureShortName,
                        oldValue: originalTagName,
                        description: removedTag.description || null,
                    });
                }
            }
            
            // Filter by action type if specified
            let finalLogs = auditLogs;
            if (filter !== "all") {
                finalLogs = auditLogs.filter(log => log.action === filter);
            }
            
            // Sort by timestamp (newest first), then by action priority when timestamps are equal
            // Priority: create (1) < update (2) < assign (3) < remove (4) < delete (5)
            const actionPriority = {
                create: 1,
                update: 2,
                assign: 3,
                remove: 4,
                delete: 5,
            };
            
            finalLogs.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                
                // First sort by timestamp (newest first)
                if (timeB !== timeA) {
                    return timeB - timeA;
                }
                
                // If timestamps are equal, sort by action priority (create before assign)
                const priorityA = actionPriority[a.action] || 99;
                const priorityB = actionPriority[b.action] || 99;
                return priorityA - priorityB;
            });
            
            // Limit to 100 most recent
            setLogs(finalLogs.slice(0, 100));
        } catch (err) {
            console.error("Error loading audit logs:", err);
            setError("Failed to load audit trail");
        } finally {
            setLoading(false);
        }
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const getActionColor = (action) => {
        switch (action) {
            case "create":
                return "bg-green-100 text-green-800";
            case "update":
                return "bg-blue-100 text-blue-800";
            case "delete":
                return "bg-red-100 text-red-800";
            case "assign":
                return "bg-purple-100 text-purple-800";
            case "remove":
                return "bg-orange-100 text-orange-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    };

    const getActionIcon = (action) => {
        switch (action) {
            case "create":
                return "➕";
            case "update":
                return "✏️";
            case "delete":
                return "🗑️";
            case "assign":
                return "📌";
            case "remove":
                return "📤";
            default:
                return "📋";
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-lg p-6 max-h-[600px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Audit Trail
                </h3>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-3 py-1 border rounded-lg text-sm"
                    >
                        <option value="all">All Actions</option>
                        <option value="create">Created</option>
                        <option value="update">Updated</option>
                        <option value="delete">Deleted</option>
                        <option value="assign">Assigned</option>
                        <option value="remove">Removed</option>
                    </select>
                </div>
            </div>

            {loading && (
                <div className="text-center py-8 text-gray-500">
                    Loading audit trail...
                </div>
            )}

            {error && (
                <div className="text-center py-8 text-red-500">{error}</div>
            )}

            {!loading && !error && logs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    No audit trail entries found
                </div>
            )}

            {!loading && !error && logs.length > 0 && (
                <div className="space-y-3">
                    {logs.map((log) => (
                        <div
                            key={log.id}
                            className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xl">
                                            {getActionIcon(log.action)}
                                        </span>
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(
                                                log.action
                                            )}`}
                                        >
                                            {log.action.toUpperCase()}
                                        </span>
                                        <span className="text-sm text-gray-600">
                                            {formatTimestamp(log.timestamp)}
                                        </span>
                                    </div>

                                    <div className="ml-8 space-y-1">
                                        {log.tagName && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <Tag className="w-4 h-4 text-gray-400" />
                                                <span className="font-medium">
                                                    {log.tagName}
                                                </span>
                                                {log.tagType && (
                                                    <span className="text-xs text-gray-500">
                                                        ({log.tagType})
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {log.structureShortName && (
                                            <div className="flex items-center gap-2 text-sm">
                                                <Database className="w-4 h-4 text-gray-400" />
                                                <span className="text-gray-700">
                                                    {log.structureShortName}
                                                </span>
                                            </div>
                                        )}

                                        {log.oldValue && log.newValue && (
                                            <div className="text-sm text-gray-600">
                                                <span className="line-through text-red-500">
                                                    {log.oldValue}
                                                </span>
                                                {" → "}
                                                <span className="text-green-600 font-medium">
                                                    {log.newValue}
                                                </span>
                                            </div>
                                        )}

                                        {log.userId && (
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <User className="w-3 h-3" />
                                                {log.userId}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AuditTrail;


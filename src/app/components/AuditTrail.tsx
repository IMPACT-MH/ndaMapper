"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Tag, Database, User, Filter } from "lucide-react";
import { fetchTags as apiFetchTags, fetchTagDataStructures } from "@/utils/api";
import type { CustomTag, DataStructure } from "@/types";

interface LocalAuditLog {
  id: string;
  timestamp: string;
  action: string;
  tagId: string;
  tagName?: string;
  tagType?: string;
  structureShortName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  userId?: string;
  description?: string | null;
}

interface AuditTrailProps {
  tagId?: string;
  structureShortName?: string;
  tagTypeFilter?: string;
  apiBaseUrl?: string;
}

const AuditTrail = ({
  tagId,
  structureShortName,
  tagTypeFilter,
  apiBaseUrl = "/api/v1",
}: AuditTrailProps) => {
  const [logs, setLogs] = useState<LocalAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allTags = await apiFetchTags(apiBaseUrl);

      if (!Array.isArray(allTags)) {
        throw new Error("Invalid response from tags API");
      }

      const removedTags = allTags.filter(
        (tag) =>
          tag.tagType === "Removed Category" ||
          tag.tagType === "Removed Data Type" ||
          tag.name.startsWith("REMOVED_CATEGORY:") ||
          tag.name.startsWith("REMOVED_DATATYPE:")
      );

      let filteredTags = allTags.filter(
        (tag) =>
          tag.tagType !== "Removed Category" &&
          tag.tagType !== "Removed Data Type" &&
          !tag.name.startsWith("REMOVED_CATEGORY:") &&
          !tag.name.startsWith("REMOVED_DATATYPE:")
      );

      if (tagTypeFilter === "Category") {
        filteredTags = filteredTags.filter(
          (tag) => !tag.tagType || tag.tagType === "Category" || (tag.tagType as string) === ""
        );
      } else if (tagTypeFilter === "Data Type") {
        filteredTags = filteredTags.filter((tag) => tag.tagType === "Data Type");
      }

      if (tagId) {
        filteredTags = filteredTags.filter((tag) => tag.id === tagId);
      }

      const auditLogs: LocalAuditLog[] = [];

      const limit = structureShortName ? 100 : 50;
      const tagsToProcess = filteredTags.slice(0, limit);

      for (const tag of tagsToProcess) {
        let dataStructures: DataStructure[] = [];
        try {
          dataStructures = await fetchTagDataStructures(tag.id, apiBaseUrl);
        } catch (err) {
          console.warn(`Failed to fetch data structures for tag ${tag.id}:`, err);
          if (structureShortName) {
            continue;
          }
          dataStructures = [];
        }

        if (structureShortName) {
          const hasStructure = dataStructures.some(
            (ds) => ds.shortName === structureShortName
          );
          if (!hasStructure) continue;
        }

        const tagWithDates = tag as CustomTag & {
          createdAt?: string;
          created_at?: string;
          updatedAt?: string;
          updated_at?: string;
          description?: string;
        };

        const createdAt =
          tagWithDates.createdAt ||
          tagWithDates.created_at ||
          new Date().toISOString();

        auditLogs.push({
          id: `create-${tag.id}`,
          timestamp: createdAt,
          action: "create",
          tagId: tag.id,
          tagName: tag.name,
          tagType: tag.tagType || "Category",
          structureShortName: structureShortName ?? null,
          newValue: tag.name,
          description: tagWithDates.description ?? null,
        });

        if (dataStructures.length > 0) {
          for (const ds of dataStructures) {
            if (structureShortName && ds.shortName !== structureShortName)
              continue;

            auditLogs.push({
              id: `assign-${tag.id}-${ds.shortName}`,
              timestamp: createdAt,
              action: "assign",
              tagId: tag.id,
              tagName: tag.name,
              tagType: tag.tagType || "Category",
              structureShortName: ds.shortName,
            });
          }
        }

        if (tagWithDates.description) {
          const updateMatch = tagWithDates.description.match(
            /Updated from "([^"]+)" to "([^"]+)"/
          );
          if (updateMatch) {
            auditLogs.push({
              id: `update-${tag.id}`,
              timestamp:
                tagWithDates.updatedAt ||
                tagWithDates.updated_at ||
                createdAt,
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

      if (filter === "all" || filter === "delete") {
        let filteredRemovedTags = removedTags;
        if (tagTypeFilter === "Category") {
          filteredRemovedTags = removedTags.filter(
            (tag) =>
              tag.tagType === "Removed Category" ||
              tag.name.startsWith("REMOVED_CATEGORY:")
          );
        } else if (tagTypeFilter === "Data Type") {
          filteredRemovedTags = removedTags.filter(
            (tag) =>
              tag.tagType === "Removed Data Type" ||
              tag.name.startsWith("REMOVED_DATATYPE:")
          );
        }

        const removedTagsToProcess = filteredRemovedTags.slice(0, 20);

        for (const removedTag of removedTagsToProcess) {
          let originalTagName = removedTag.name;
          let removedStructureShortName: string | null = null;

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

          if (
            structureShortName &&
            removedStructureShortName !== structureShortName
          ) {
            continue;
          }

          const removedTagWithDates = removedTag as CustomTag & {
            createdAt?: string;
            created_at?: string;
            description?: string;
          };

          const createdAt =
            removedTagWithDates.createdAt ||
            removedTagWithDates.created_at ||
            new Date().toISOString();

          auditLogs.push({
            id: `delete-${removedTag.id}`,
            timestamp: createdAt,
            action: "delete",
            tagId: removedTag.id,
            tagName: originalTagName,
            tagType:
              removedTag.tagType === "Removed Category"
                ? "Category"
                : "Data Type",
            structureShortName:
              removedStructureShortName ?? structureShortName ?? null,
            oldValue: originalTagName,
            description: removedTagWithDates.description ?? null,
          });
        }
      }

      let finalLogs = auditLogs;
      if (filter !== "all") {
        finalLogs = auditLogs.filter((log) => log.action === filter);
      }

      const actionPriority: Record<string, number> = {
        create: 1,
        update: 2,
        assign: 3,
        remove: 4,
        delete: 5,
      };

      finalLogs.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();

        if (timeB !== timeA) return timeB - timeA;

        const priorityA = actionPriority[a.action] ?? 99;
        const priorityB = actionPriority[b.action] ?? 99;
        return priorityA - priorityB;
      });

      setLogs(finalLogs.slice(0, 100));
    } catch (err) {
      console.error("Error loading audit logs:", err);
      setError("Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  }, [tagId, structureShortName, filter, tagTypeFilter, apiBaseUrl]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getActionColor = (action: string) => {
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

  const getActionIcon = (action: string) => {
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
                    <span className="text-xl">{getActionIcon(log.action)}</span>
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
                        <span className="font-medium">{log.tagName}</span>
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

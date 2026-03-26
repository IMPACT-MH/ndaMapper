import { ApiError } from "@/types";
import type { CustomTag, AuditEntry, AuditAction, DataStructure } from "@/types";

/**
 * Centralized API utility for consistent error handling
 */
export const apiCall = async (
  endpoint: string,
  options: RequestInit = {},
  apiBaseUrl = "/api/v1"
): Promise<unknown> => {
  try {
    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      let errorData: Record<string, unknown> = {};
      try {
        const text = await response.text();
        if (text) {
          try {
            errorData = JSON.parse(text) as Record<string, unknown>;
          } catch {
            errorData = { error: text, details: text };
          }
        }
      } catch {
        // If we can't read the response, use empty error object
      }

      const errorMessage =
        (errorData.error as string | undefined) ||
        (errorData.message as string | undefined) ||
        (errorData.details as string | undefined) ||
        `API error: ${response.status} ${response.statusText}`;

      throw new ApiError(
        errorMessage,
        response.status,
        errorData.details ?? errorData
      );
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return null;
    }

    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      console.error(`Failed to parse JSON from ${endpoint}:`, err);
      throw new Error("Invalid JSON response from server");
    }
  } catch (err) {
    console.error(`API call failed [${endpoint}]:`, err);
    throw err;
  }
};

/**
 * Fetch tags with proper error handling
 */
export const fetchTags = async (apiBaseUrl = "/api/v1"): Promise<CustomTag[]> => {
  const data = await apiCall("/tags", {}, apiBaseUrl);
  if (!Array.isArray(data)) {
    console.warn("Expected array for tags, got:", typeof data);
    return [];
  }
  return data as CustomTag[];
};

/**
 * Create a tag with validation
 */
export const createTag = async (
  name: string,
  tagType: string,
  apiBaseUrl = "/api/v1"
): Promise<CustomTag> => {
  const trimmedName = name ? name.trim() : "";
  if (!trimmedName) {
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
      body: JSON.stringify({ name, tagType }),
    },
    apiBaseUrl
  );

  const tag = newTag as CustomTag | null;
  if (!tag || !tag.id) {
    throw new Error("Invalid tag data received from server");
  }

  return tag;
};

/**
 * Update a tag
 */
export const updateTag = async (
  tagId: string,
  newName: string,
  apiBaseUrl = "/api/v1"
): Promise<CustomTag> => {
  if (!newName || !newName.trim()) {
    throw new Error("Tag name cannot be empty");
  }
  if (newName.length > 100) {
    throw new Error("Tag name too long (max 100 characters)");
  }
  if (newName.includes(":")) {
    throw new Error("Tag name cannot contain colons");
  }

  const trimmedName = newName ? newName.trim() : "";
  if (!trimmedName) {
    throw new Error("Tag name cannot be empty");
  }

  const updated = await apiCall(
    `/tags/${tagId}`,
    {
      method: "PUT",
      body: JSON.stringify({ name: newName }),
    },
    apiBaseUrl
  );

  return updated as CustomTag;
};

/**
 * Delete a tag
 */
export const deleteTag = async (
  tagId: string,
  apiBaseUrl = "/api/v1"
): Promise<void> => {
  await apiCall(`/tags/${tagId}`, { method: "DELETE" }, apiBaseUrl);
};

/**
 * Assign a tag to a data structure
 */
export const assignTag = async (
  tagId: string,
  structureShortName: string,
  apiBaseUrl = "/api/v1"
): Promise<void> => {
  await apiCall(
    "/tags/assign",
    {
      method: "POST",
      body: JSON.stringify({ tagId, dataStructureShortName: structureShortName }),
    },
    apiBaseUrl
  );
};

/**
 * Log an audit trail entry
 */
export interface AuditEventData {
  action: AuditAction;
  tagId: string;
  tagName: string;
  tagType: string;
  structureShortName?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export const logAuditEvent = async (
  auditData: AuditEventData,
  apiBaseUrl = "/api/v1"
): Promise<void> => {
  try {
    await apiCall("/audit", { method: "POST", body: JSON.stringify(auditData) }, apiBaseUrl);
  } catch (err) {
    // Don't throw — audit logging should not break the main flow
    console.error("Failed to log audit event:", err);
  }
};

/**
 * Fetch audit trail logs
 */
export interface AuditFilters {
  tagId?: string;
  structureShortName?: string;
  action?: string;
  limit?: number;
}

export const fetchAuditLogs = async (
  filters: AuditFilters = {},
  apiBaseUrl = "/api/v1"
): Promise<AuditEntry[]> => {
  const params = new URLSearchParams();
  if (filters.tagId) params.append("tagId", filters.tagId);
  if (filters.structureShortName)
    params.append("structureShortName", filters.structureShortName);
  if (filters.action) params.append("action", filters.action);
  if (filters.limit) params.append("limit", filters.limit.toString());

  const queryString = params.toString();
  const endpoint = queryString ? `/audit?${queryString}` : "/audit";

  const data = await apiCall(endpoint, { method: "GET" }, apiBaseUrl);
  return (data ?? []) as AuditEntry[];
};

/**
 * Fetch data structures for a tag
 */
export const fetchTagDataStructures = async (
  tagId: string,
  apiBaseUrl = "/api/v1"
): Promise<DataStructure[]> => {
  const data = await apiCall(`/tags/${tagId}/dataStructures`, {}, apiBaseUrl);
  const typed = data as { dataStructures?: DataStructure[] } | null;
  return Array.isArray(typed?.dataStructures) ? typed!.dataStructures : [];
};

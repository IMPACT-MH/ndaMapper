import { NextResponse } from "next/server";

// In-memory storage for audit logs (in production, use a database)
// Note: This is stored in memory and will be lost on server restart
// For production, use a proper database (PostgreSQL, MongoDB, etc.)
let auditLogs = [];

// Load from file system or database in production
// For now, we'll use in-memory storage

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tagId = searchParams.get("tagId");
        const structureShortName = searchParams.get("structureShortName");
        const action = searchParams.get("action");
        const limit = parseInt(searchParams.get("limit") || "100");

        let filteredLogs = [...auditLogs];

        // Filter by tagId if provided
        if (tagId) {
            filteredLogs = filteredLogs.filter(
                (log) => log.tagId === tagId || log.relatedTagId === tagId
            );
        }

        // Filter by structureShortName if provided
        if (structureShortName) {
            filteredLogs = filteredLogs.filter(
                (log) => log.structureShortName === structureShortName
            );
        }

        // Filter by action if provided
        if (action) {
            filteredLogs = filteredLogs.filter((log) => log.action === action);
        }

        // Sort by timestamp (newest first)
        filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Limit results
        filteredLogs = filteredLogs.slice(0, limit);

        return NextResponse.json({ logs: filteredLogs });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        return NextResponse.json(
            { error: "Failed to fetch audit logs" },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const {
            action,
            tagId,
            tagName,
            tagType,
            structureShortName,
            oldValue,
            newValue,
            userId,
            metadata,
        } = body;

        // Validate required fields
        if (!action || !tagId) {
            return NextResponse.json(
                { error: "action and tagId are required" },
                { status: 400 }
            );
        }

        const auditEntry = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            action, // 'create', 'update', 'delete', 'assign', 'remove'
            tagId,
            tagName: tagName || null,
            tagType: tagType || null,
            structureShortName: structureShortName || null,
            oldValue: oldValue || null,
            newValue: newValue || null,
            userId: userId || "anonymous",
            metadata: metadata || {},
        };

        auditLogs.push(auditEntry);

        // In production, persist to database here
        // For now, logs are stored in memory

        return NextResponse.json({ success: true, entry: auditEntry });
    } catch (error) {
        console.error("Error creating audit entry:", error);
        return NextResponse.json(
            { error: "Failed to create audit entry" },
            { status: 500 }
        );
    }
}


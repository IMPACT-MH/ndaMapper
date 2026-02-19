import { NextRequest, NextResponse } from "next/server";
import type { AuditEntry } from "@/types";

// In-memory storage for audit logs (in production, use a database)
let auditLogs: AuditEntry[] = [];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("tagId");
    const structureShortName = searchParams.get("structureShortName");
    const action = searchParams.get("action");
    const limit = parseInt(searchParams.get("limit") ?? "100");

    let filteredLogs = [...auditLogs];

    if (tagId) {
      filteredLogs = filteredLogs.filter((log) => log.tagId === tagId);
    }

    if (structureShortName) {
      filteredLogs = filteredLogs.filter(
        (log) => log.structureShortName === structureShortName
      );
    }

    if (action) {
      filteredLogs = filteredLogs.filter((log) => log.action === action);
    }

    filteredLogs.sort(
      (a, b) =>
        new Date(b.timestamp ?? "").getTime() -
        new Date(a.timestamp ?? "").getTime()
    );

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<AuditEntry>;
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

    if (!action || !tagId) {
      return NextResponse.json(
        { error: "action and tagId are required" },
        { status: 400 }
      );
    }

    const auditEntry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action,
      tagId,
      tagName: tagName ?? "",
      tagType: tagType ?? "",
      structureShortName: structureShortName ?? undefined,
      oldValue: oldValue ?? undefined,
      newValue: newValue ?? undefined,
      userId: userId ?? "anonymous",
      metadata: metadata ?? {},
    };

    auditLogs.push(auditEntry);

    return NextResponse.json({ success: true, entry: auditEntry });
  } catch (error) {
    console.error("Error creating audit entry:", error);
    return NextResponse.json(
      { error: "Failed to create audit entry" },
      { status: 500 }
    );
  }
}

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ScatterChart,
    Scatter,
} from "recharts";
import type {
    StructureSuggestion,
    ConversationMessage,
    ChartConfig,
    NetworkGraph,
    MockDataset,
    DataElement,
    DataStructure,
    SuggestResponse,
    HarmonizationResult,
    HarmonizeResponse,
    ConstructGroup,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
    | "idle"
    | "suggesting"
    | "selecting"
    | "generating"
    | "analyzing"
    | "harmonizing"
    | "complete"
    | "error";

type ChatMsg =
    | { id: string; type: "user"; text: string }
    | {
          id: string;
          type: "suggestions";
          suggestions: StructureSuggestion[];
          reasoning: string;
          networkGraph: NetworkGraph;
      }
    | { id: string; type: "mock-ready"; datasets: MockDataset[] }
    | { id: string; type: "analysis"; text: string; charts: ChartConfig[] }
    | { id: string; type: "hint"; text: string }
    | { id: string; type: "harmonize"; result: HarmonizationResult };

interface MergedDataset {
    id: string;
    name: string;
    sourceNames: string[];
    rows: Record<string, unknown>[];
    schema: DataElement[];
}

interface Props {
    databaseStructures: string[];
    databaseSites: string[];
    databaseFilterEnabled: boolean;
    databaseConnectionError: string | null;
    isVisible: boolean;
}

// ---------------------------------------------------------------------------
// NetworkDiagram — pure SVG spring-layout
// ---------------------------------------------------------------------------

interface SVGNode {
    id: string;
    label: string;
    type: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

const NODE_COLORS: Record<string, string> = {
    instrument: "#7c3aed",
    datatype: "#f97316",
    site: "#10b981",
    category: "#f59e0b",
};

function NetworkDiagram({ graph }: { graph: NetworkGraph }) {
    const [positions, setPositions] = useState<SVGNode[]>([]);
    const animRef = useRef<number | null>(null);
    const WIDTH = 600;
    const HEIGHT = 400;

    useEffect(() => {
        if (graph.nodes.length === 0) {
            setPositions([]);
            return;
        }

        const nodes: SVGNode[] = graph.nodes.map((n, i) => {
            const angle = (2 * Math.PI * i) / graph.nodes.length;
            const r = Math.min(WIDTH, HEIGHT) * 0.35;
            return {
                ...n,
                x: WIDTH / 2 + r * Math.cos(angle),
                y: HEIGHT / 2 + r * Math.sin(angle),
                vx: 0,
                vy: 0,
            };
        });

        const edgeMap = new Map<string, string[]>();
        for (const edge of graph.edges) {
            if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, []);
            if (!edgeMap.has(edge.target)) edgeMap.set(edge.target, []);
            edgeMap.get(edge.source)!.push(edge.target);
            edgeMap.get(edge.target)!.push(edge.source);
        }
        void edgeMap;

        let step = 0;
        const MAX_STEPS = 150;

        function simulate() {
            if (step >= MAX_STEPS) {
                setPositions([...nodes]);
                return;
            }
            step++;

            const alpha = 1 - step / MAX_STEPS;

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = (800 / (dist * dist)) * alpha;
                    nodes[i].vx -= (dx / dist) * force;
                    nodes[i].vy -= (dy / dist) * force;
                    nodes[j].vx += (dx / dist) * force;
                    nodes[j].vy += (dy / dist) * force;
                }
            }

            for (const edge of graph.edges) {
                const src = nodes.find((n) => n.id === edge.source);
                const tgt = nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) continue;
                const dx = tgt.x - src.x;
                const dy = tgt.y - src.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const ideal = 120;
                const force = ((dist - ideal) / dist) * 0.3 * alpha;
                src.vx += dx * force;
                src.vy += dy * force;
                tgt.vx -= dx * force;
                tgt.vy -= dy * force;
            }

            for (const node of nodes) {
                node.vx += (WIDTH / 2 - node.x) * 0.01 * alpha;
                node.vy += (HEIGHT / 2 - node.y) * 0.01 * alpha;
                node.vx *= 0.8;
                node.vy *= 0.8;
                node.x = Math.max(40, Math.min(WIDTH - 40, node.x + node.vx));
                node.y = Math.max(20, Math.min(HEIGHT - 20, node.y + node.vy));
            }

            setPositions([...nodes]);
            animRef.current = requestAnimationFrame(simulate);
        }

        if (animRef.current) cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(simulate);

        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, [graph]);

    if (graph.nodes.length === 0) {
        return (
            <div className="text-gray-400 text-sm text-center py-8">
                No network data available
            </div>
        );
    }

    const posMap = new Map(positions.map((n) => [n.id, n]));

    return (
        <div className="overflow-auto">
            <svg
                width={WIDTH}
                height={HEIGHT}
                className="border rounded bg-gray-50 mx-auto block"
            >
                {graph.edges.map((edge, i) => {
                    const src = posMap.get(edge.source);
                    const tgt = posMap.get(edge.target);
                    if (!src || !tgt) return null;
                    return (
                        <line
                            key={i}
                            x1={src.x}
                            y1={src.y}
                            x2={tgt.x}
                            y2={tgt.y}
                            stroke="#cbd5e1"
                            strokeWidth={
                                edge.weight ? Math.min(edge.weight, 4) : 1
                            }
                            strokeOpacity={0.7}
                        />
                    );
                })}
                {positions.map((node) => {
                    const color = NODE_COLORS[node.type] ?? "#6b7280";
                    const radius = node.type === "instrument" ? 14 : 9;
                    return (
                        <g key={node.id}>
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r={radius}
                                fill={color}
                                fillOpacity={0.85}
                                stroke="white"
                                strokeWidth={2}
                            />
                            <text
                                x={node.x}
                                y={node.y + radius + 10}
                                textAnchor="middle"
                                fontSize={9}
                                fill="#374151"
                                fontWeight={
                                    node.type === "instrument"
                                        ? "bold"
                                        : "normal"
                                }
                            >
                                {node.label.length > 14
                                    ? node.label.slice(0, 13) + "…"
                                    : node.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-600">
                {Object.entries(NODE_COLORS).map(([type, color]) => (
                    <span key={type} className="flex items-center gap-1">
                        <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ background: color }}
                        />
                        {type}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ChartPanel
// ---------------------------------------------------------------------------

function ChartPanel({
    charts,
    datasets,
}: {
    charts: ChartConfig[];
    datasets: MockDataset[];
}) {
    if (charts.length === 0) return null;

    const allRows = datasets.flatMap((ds) => ds.rows);

    return (
        <div className="space-y-6">
            {charts.map((chart) => {
                const data = allRows.slice(0, 200);

                if (chart.type === "bar" && chart.xField && chart.yField) {
                    const counts = new Map<string, number>();
                    for (const row of data) {
                        const key = String(row[chart.xField] ?? "unknown");
                        counts.set(key, (counts.get(key) ?? 0) + 1);
                    }
                    const barData = [...counts.entries()]
                        .slice(0, 15)
                        .map(([name, value]) => ({ name, value }));
                    return (
                        <div key={chart.id}>
                            <h4 className="font-medium text-gray-700 text-sm mb-2">
                                {chart.title}
                            </h4>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={barData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#7c3aed" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    );
                }

                if (chart.type === "histogram" && chart.xField) {
                    const values = data
                        .map((r) => Number(r[chart.xField!]))
                        .filter((v) => !isNaN(v) && v > -700);
                    if (values.length === 0) return null;
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const buckets = 12;
                    const bucketSize = (max - min) / buckets || 1;
                    const hist = Array.from({ length: buckets }, (_, i) => ({
                        range: `${(min + i * bucketSize).toFixed(0)}`,
                        count: 0,
                    }));
                    for (const v of values) {
                        const idx = Math.min(
                            Math.floor((v - min) / bucketSize),
                            buckets - 1,
                        );
                        hist[idx].count++;
                    }
                    return (
                        <div key={chart.id}>
                            <h4 className="font-medium text-gray-700 text-sm mb-2">
                                {chart.title}
                            </h4>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={hist}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="range"
                                        tick={{ fontSize: 10 }}
                                    />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#0ea5e9" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    );
                }

                if (chart.type === "scatter" && chart.xField && chart.yField) {
                    const scatterData = data
                        .map((r) => ({
                            x: Number(r[chart.xField!]),
                            y: Number(r[chart.yField!]),
                        }))
                        .filter(
                            (p) =>
                                !isNaN(p.x) &&
                                !isNaN(p.y) &&
                                p.x > -700 &&
                                p.y > -700,
                        )
                        .slice(0, 100);
                    return (
                        <div key={chart.id}>
                            <h4 className="font-medium text-gray-700 text-sm mb-2">
                                {chart.title}
                            </h4>
                            <ResponsiveContainer width="100%" height={220}>
                                <ScatterChart>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="x"
                                        name={chart.xField}
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis
                                        dataKey="y"
                                        name={chart.yField}
                                        tick={{ fontSize: 11 }}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: "3 3" }}
                                    />
                                    <Scatter
                                        data={scatterData}
                                        fill="#7c3aed"
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// ExportControls
// ---------------------------------------------------------------------------

function ExportControls({ datasets }: { datasets: MockDataset[] }) {
    const handleCSVDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        for (const ds of datasets) {
            if (ds.rows.length === 0) continue;
            const headers = Object.keys(ds.rows[0]);
            const csvLines = [
                headers.join(","),
                ...ds.rows.map((row) =>
                    headers
                        .map((h) => {
                            const val = String(row[h] ?? "");
                            return val.includes(",") ? `"${val}"` : val;
                        })
                        .join(","),
                ),
            ];
            const blob = new Blob([csvLines.join("\n")], {
                type: "text/csv;charset=utf-8;",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `mock_${ds.structure.shortName}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    if (datasets.length === 0) return null;

    return (
        <button
            onClick={handleCSVDownload}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors whitespace-nowrap"
        >
            <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
            </svg>
            Export CSV{datasets.length > 1 ? `s (${datasets.length})` : ""}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Phase2Banner
// ---------------------------------------------------------------------------

function Phase2Banner() {
    return (
        <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-3">
                <div className="text-purple-500 mt-0.5 shrink-0">
                    <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                </div>
                <div>
                    <p className="font-medium text-purple-800 text-xs mb-0.5">
                        Connect your database to analyze real data
                    </p>
                    <p className="text-purple-700 text-xs">
                        Currently showing synthetic mock data. Set{" "}
                        <code className="bg-purple-100 px-1 rounded font-mono">
                            MONGODB_URI
                        </code>{" "}
                        and{" "}
                        <code className="bg-purple-100 px-1 rounded font-mono">
                            MONGODB_DB_NAME
                        </code>{" "}
                        in{" "}
                        <code className="bg-purple-100 px-1 rounded font-mono">
                            .env.local
                        </code>{" "}
                        to use real data.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Chat message renderers
// ---------------------------------------------------------------------------

function EmptyState({
    databaseFilterEnabled,
    count,
}: {
    databaseFilterEnabled: boolean;
    count: number;
}) {
    return (
        <div className="flex flex-col items-center justify-center text-center pt-6 pb-2">
            <svg
                className="w-12 h-12 mb-4 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
            </svg>
            <p className="text-sm font-medium text-gray-500 mb-1">
                Start a research conversation
            </p>
            <p className="text-xs text-gray-400">
                {databaseFilterEnabled
                    ? `Searching within ${count} IMPACT-MH instruments`
                    : "Searching all NDA instruments"}
            </p>
        </div>
    );
}

function UserBubble({ text }: { text: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[75%] bg-purple-100 text-purple-900 rounded-2xl rounded-br-none px-4 py-2 text-sm">
                {text}
            </div>
        </div>
    );
}

interface SuggestionsMessageProps {
    msg: Extract<ChatMsg, { type: "suggestions" }>;
    selectedShortNames: Set<string>;
    toggleStructure: (shortName: string) => void;
    phase: Phase;
    isLatest: boolean;
    onGenerate: () => void;
    isGenerating: boolean;
    onLoadMore: () => void;
    isLoadingMore: boolean;
    confidenceColor: Record<string, string>;
}

function SuggestionsMessage({
    msg,
    selectedShortNames,
    toggleStructure,
    phase,
    isLatest,
    onGenerate,
    isGenerating,
    onLoadMore,
    isLoadingMore,
    confidenceColor,
}: SuggestionsMessageProps) {
    return (
        <div className="space-y-3">
            {msg.reasoning && (
                <div className="max-w-[90%] bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-gray-600 italic">
                    {msg.reasoning}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                {msg.suggestions.map((s) => (
                    <label
                        key={s.shortName}
                        className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedShortNames.has(s.shortName)
                                ? "border-purple-400 bg-purple-50"
                                : "border-gray-200 hover:border-gray-300"
                        } ${!isLatest || phase !== "selecting" ? "opacity-60 cursor-default" : ""}`}
                    >
                        <input
                            type="checkbox"
                            checked={selectedShortNames.has(s.shortName)}
                            onChange={() => toggleStructure(s.shortName)}
                            className="mt-0.5 accent-purple-600"
                            disabled={!isLatest || phase !== "selecting"}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-semibold text-purple-700">
                                    {s.shortName}
                                </span>
                                <span
                                    className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidenceColor[s.confidence] ?? confidenceColor.low}`}
                                >
                                    {s.confidence}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {s.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                {s.relevanceReason}
                            </p>
                            {s.sites && s.sites.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {s.sites.slice(0, 3).map((site) => (
                                        <span
                                            key={site}
                                            className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200"
                                        >
                                            {site}
                                        </span>
                                    ))}
                                    {s.sites.length > 3 && (
                                        <span className="text-xs text-gray-400">
                                            +{s.sites.length - 3} more
                                        </span>
                                    )}
                                </div>
                            )}
                            {s.dataTypes && s.dataTypes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {s.dataTypes.slice(0, 3).map((dt) => (
                                        <span
                                            key={dt}
                                            className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700"
                                        >
                                            {dt}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {s.categories && s.categories.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {s.categories.slice(0, 3).map((c) => (
                                        <span
                                            key={c}
                                            className="px-1.5 py-0.5 text-xs rounded bg-violet-100 text-violet-700"
                                        >
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {s.recommendedElements && s.recommendedElements.length > 0 && (
                                <details className="mt-2 group">
                                    <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600 list-none flex items-center gap-1">
                                        <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                                        {s.recommendedElements.length} relevant element{s.recommendedElements.length !== 1 ? "s" : ""}
                                    </summary>
                                    <ul className="mt-1.5 space-y-1.5 pl-1">
                                        {s.recommendedElements.map((el) => (
                                            <li key={el.name} className="text-xs">
                                                <span className="font-mono text-purple-700">{el.name}</span>
                                                <span className="text-gray-400 ml-1">— {el.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    </label>
                ))}
            </div>

            {isLatest && phase === "selecting" && (
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={onGenerate}
                        disabled={isGenerating || selectedShortNames.size === 0}
                        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Generate Mock Dataset
                        {selectedShortNames.size > 0
                            ? ` (${selectedShortNames.size} instrument${selectedShortNames.size > 1 ? "s" : ""})`
                            : ""}
                    </button>
                    <button
                        onClick={onLoadMore}
                        disabled={isLoadingMore || isGenerating}
                        className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoadingMore ? "Loading…" : "Load more suggestions"}
                    </button>
                </div>
            )}

            {msg.networkGraph.nodes.length > 0 && (
                <div>
                    <p className="text-xs text-gray-500 mb-2 font-medium">
                        Instrument Relationship Network
                    </p>
                    <NetworkDiagram graph={msg.networkGraph} />
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// MergedDatasetRow
// ---------------------------------------------------------------------------

function MergedDatasetRow({
    merged,
    isDragTarget,
    isDuplicate,
    onDragOver,
    onDragLeave,
    onDrop,
    onRename,
    onRemove,
}: {
    merged: MergedDataset;
    isDragTarget: boolean;
    isDuplicate: boolean;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: () => void;
    onRename: (name: string) => void;
    onRemove: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(merged.name);
    const [expanded, setExpanded] = useState(false);

    const headers = merged.schema.map((e) => e.name).slice(0, 10);
    const previewRows = merged.rows.slice(0, 8);

    const handleExportCSV = (e: React.MouseEvent) => {
        e.stopPropagation();
        const allHeaders = merged.schema.map((el) => el.name);
        const csvLines = [
            allHeaders.join(","),
            ...merged.rows.map((row) =>
                allHeaders
                    .map((h) => {
                        const val = String(row[h] ?? "");
                        return val.includes(",") ? `"${val}"` : val;
                    })
                    .join(","),
            ),
        ];
        const blob = new Blob([csvLines.join("\n")], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${merged.name}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div
            className={`rounded border transition-all ${
                isDuplicate
                    ? "ring-2 ring-amber-300 border-amber-200 bg-amber-50"
                    : isDragTarget
                      ? "ring-2 ring-purple-400 border-purple-300 bg-purple-50"
                      : "border-indigo-200 bg-indigo-50"
            }`}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver();
            }}
            onDragLeave={onDragLeave}
            onDrop={(e) => {
                e.preventDefault();
                onDrop();
            }}
        >
            <div className="flex items-center gap-2 px-3 py-2 text-sm">
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-indigo-300 text-xs shrink-0"
                >
                    {expanded ? "▼" : "▶"}
                </button>
                <span className="text-indigo-400 select-none shrink-0">⊕</span>
                {editing ? (
                    <input
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        onBlur={() => {
                            onRename(val);
                            setEditing(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                onRename(val);
                                setEditing(false);
                            }
                        }}
                        className="font-mono text-xs border border-indigo-300 rounded px-1 py-0.5 focus:outline-none w-40"
                        autoFocus
                    />
                ) : (
                    <button
                        onClick={() => setEditing(true)}
                        className="font-mono text-xs text-indigo-700 hover:underline"
                        title="Click to rename"
                    >
                        {merged.name}
                    </button>
                )}
                <span className="text-xs text-indigo-400 truncate">
                    {merged.rows.length} rows · {merged.sourceNames.join(" + ")}
                </span>
                {isDuplicate && (
                    <span className="ml-auto text-xs text-amber-600 font-normal whitespace-nowrap">
                        Already included
                    </span>
                )}
                {isDragTarget && !isDuplicate && (
                    <span className="ml-auto text-xs text-purple-600 font-normal whitespace-nowrap">
                        Drop to add ↗
                    </span>
                )}
                <button
                    onClick={handleExportCSV}
                    className="text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
                    title="Export CSV"
                >
                    <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                    </svg>
                </button>
                <button
                    onClick={onRemove}
                    className="text-gray-300 hover:text-red-400 text-sm leading-none shrink-0"
                >
                    ✕
                </button>
            </div>
            {expanded && (
                <div className="px-3 pb-3 overflow-x-auto text-xs border-t border-indigo-100">
                    <table className="min-w-full divide-y divide-indigo-100 mt-2">
                        <thead className="bg-indigo-50/50">
                            <tr>
                                {headers.map((h) => (
                                    <th
                                        key={h}
                                        className="px-2 py-1 text-left font-medium text-indigo-400 whitespace-nowrap"
                                    >
                                        {h}
                                    </th>
                                ))}
                                {merged.schema.length > 10 && (
                                    <th className="px-2 py-1 text-indigo-300">
                                        …
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-indigo-50">
                            {previewRows.map((row, i) => (
                                <tr key={i}>
                                    {headers.map((h) => (
                                        <td
                                            key={h}
                                            className="px-2 py-1 text-gray-700 whitespace-nowrap"
                                        >
                                            {String(row[h] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// MockReadyMessage
// ---------------------------------------------------------------------------

interface MockReadyMessageProps {
    datasets: MockDataset[];
    mergedDatasets: MergedDataset[];
    onMerge: (a: MockDataset, b: MockDataset) => void;
    onAddToMerge: (source: MockDataset, mergedId: string) => void;
    onRenameMerged: (id: string, name: string) => void;
    onRemoveMerged: (id: string) => void;
    onRemoveDataset?: (shortName: string) => void;
    onHarmonize?: () => void;
}

function MockReadyMessage({
    datasets,
    mergedDatasets,
    onMerge,
    onAddToMerge,
    onRenameMerged,
    onRemoveMerged,
    onRemoveDataset,
    onHarmonize,
}: MockReadyMessageProps) {
    const [expanded, setExpanded] = useState(false);
    const [dragging, setDragging] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const [dropTargetMergedId, setDropTargetMergedId] = useState<string | null>(
        null,
    );

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700 flex-1 text-left"
                >
                    <span className="text-gray-400">
                        {expanded ? "▼" : "▶"}
                    </span>
                    Mock data ready — {datasets.length} instrument
                    {datasets.length !== 1 ? "s" : ""}
                    <span className="text-gray-400 font-normal">
                        {datasets.map((d) => d.structure.shortName).join(" · ")}
                    </span>
                </button>
                <div className="flex items-center gap-2">
                    {onHarmonize && datasets.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onHarmonize(); }}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors whitespace-nowrap"
                        >
                            Harmonize Elements
                        </button>
                    )}
                    <ExportControls datasets={datasets} />
                </div>
            </div>
            {expanded && (
                <div className="p-4 space-y-2">
                    {datasets.map((ds) => {
                        const isTarget =
                            dropTarget === ds.structure.shortName &&
                            dragging !== ds.structure.shortName;
                        const headers = Object.keys(ds.rows[0] ?? {}).slice(
                            0,
                            10,
                        );
                        const previewRows = ds.rows.slice(0, 8);
                        return (
                            <div
                                key={ds.structure.shortName}
                                draggable
                                onDragStart={(e) => {
                                    setDragging(ds.structure.shortName);
                                    e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                    setDragging(null);
                                    setDropTarget(null);
                                    setDropTargetMergedId(null);
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDropTarget(ds.structure.shortName);
                                }}
                                onDragLeave={() => setDropTarget(null)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (
                                        dragging &&
                                        dragging !== ds.structure.shortName
                                    ) {
                                        const src = datasets.find(
                                            (d) =>
                                                d.structure.shortName ===
                                                dragging,
                                        );
                                        if (src) onMerge(src, ds);
                                    }
                                    setDragging(null);
                                    setDropTarget(null);
                                }}
                                className={`rounded border transition-all ${isTarget ? "ring-2 ring-purple-400 border-purple-300 bg-purple-50" : "border-gray-200"}`}
                            >
                                <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700">
                                    <span className="text-gray-300 cursor-grab text-base select-none">
                                        ⠿
                                    </span>
                                    <span className="font-mono text-purple-700">
                                        {ds.structure.shortName}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        ({ds.rows.length} rows ·{" "}
                                        {ds.schema.length} fields)
                                    </span>
                                    <div className="ml-auto flex items-center gap-1">
                                        {isTarget && (
                                            <span className="text-xs text-purple-600 font-normal">
                                                Drop to merge ↗
                                            </span>
                                        )}
                                        {datasets.length > 1 &&
                                            onRemoveDataset && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRemoveDataset(
                                                            ds.structure
                                                                .shortName,
                                                        );
                                                    }}
                                                    className="text-xs text-gray-400 hover:text-red-500 px-1 transition-colors"
                                                    title="Remove dataset"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                    </div>
                                </div>
                                <div className="px-3 pb-3 overflow-x-auto text-xs border-t">
                                    <table className="min-w-full divide-y divide-gray-200 mt-2">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                {headers.map((h) => (
                                                    <th
                                                        key={h}
                                                        className="px-2 py-1 text-left font-medium text-gray-500 whitespace-nowrap"
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                                {Object.keys(ds.rows[0] ?? {})
                                                    .length > 10 && (
                                                    <th className="px-2 py-1 text-gray-400">
                                                        …
                                                    </th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-100">
                                            {previewRows.map((row, i) => (
                                                <tr key={i}>
                                                    {headers.map((h) => (
                                                        <td
                                                            key={h}
                                                            className="px-2 py-1 text-gray-700 whitespace-nowrap"
                                                        >
                                                            {String(
                                                                row[h] ?? "",
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}

                    {mergedDatasets.length > 0 && (
                        <div className="mt-3 space-y-2">
                            <p className="text-xs text-gray-500 font-medium">
                                Merged datasets
                            </p>
                            {mergedDatasets.map((m) => (
                                <MergedDatasetRow
                                    key={m.id}
                                    merged={m}
                                    isDragTarget={
                                        dropTargetMergedId === m.id &&
                                        !!dragging
                                    }
                                    isDuplicate={
                                        !!dragging &&
                                        m.sourceNames.includes(dragging)
                                    }
                                    onDragOver={() =>
                                        setDropTargetMergedId(m.id)
                                    }
                                    onDragLeave={() =>
                                        setDropTargetMergedId(null)
                                    }
                                    onDrop={() => {
                                        if (dragging) {
                                            const src = datasets.find(
                                                (d) =>
                                                    d.structure.shortName ===
                                                    dragging,
                                            );
                                            if (
                                                src &&
                                                !m.sourceNames.includes(
                                                    dragging,
                                                )
                                            )
                                                onAddToMerge(src, m.id);
                                        }
                                        setDropTargetMergedId(null);
                                    }}
                                    onRename={(name) =>
                                        onRenameMerged(m.id, name)
                                    }
                                    onRemove={() => onRemoveMerged(m.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface AnalysisMessageProps {
    msg: Extract<ChatMsg, { type: "analysis" }>;
    phase: Phase;
    datasets: MockDataset[];
}

function AnalysisMessage({ msg, phase, datasets }: AnalysisMessageProps) {
    return (
        <div className="space-y-3">
            <div className="max-w-[90%] bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-gray-700">
                {msg.text === "" ? (
                    phase === "analyzing" ? (
                        <span className="text-gray-400 italic">Streaming…</span>
                    ) : (
                        <span className="text-red-400 text-xs italic">
                            Analysis failed — see error below
                        </span>
                    )
                ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">
                        {msg.text}
                    </p>
                )}
            </div>
            {msg.charts.length > 0 && (
                <div className="max-w-[90%]">
                    <ChartPanel charts={msg.charts} datasets={datasets} />
                </div>
            )}
        </div>
    );
}

function LoadingBubble({
    phase,
    suggestHistory,
}: {
    phase: Phase;
    suggestHistory: Array<{ role: "user" | "assistant"; content: string }>;
}) {
    return (
        <div className="flex items-center gap-2 text-sm text-purple-600 py-2 pl-1">
            <svg
                className="animate-spin w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
            >
                <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                />
                <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
            </svg>
            {phase === "suggesting" &&
                (suggestHistory.length > 0
                    ? "Refining suggestions…"
                    : "Analyzing your research question…")}
            {phase === "generating" && "Generating synthetic dataset…"}
            {phase === "harmonizing" && "Building element crosswalk…"}
        </div>
    );
}

function ErrorBubble({
    msg,
    onDismiss,
}: {
    msg: string;
    onDismiss: () => void;
}) {
    return (
        <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-800">
            <strong>Error:</strong> {msg}
            <button onClick={onDismiss} className="ml-3 underline text-red-600">
                Dismiss
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// HarmonizeMessage
// ---------------------------------------------------------------------------

const CONF_COLORS = {
    direct:  { dot: "bg-green-500",  text: "text-green-700" },
    partial: { dot: "bg-amber-400",  text: "text-amber-700" },
    proxy:   { dot: "bg-orange-400", text: "text-orange-700" },
} as const;

function HarmonizeMessage({ result }: { result: HarmonizationResult }) {
    const instruments = Array.from(
        new Set(result.constructs.flatMap((c) => c.mappings.map((m) => m.shortName)))
    );

    // Group by domain
    const domainOrder: string[] = [];
    const byDomain = new Map<string, ConstructGroup[]>();
    for (const c of result.constructs) {
        if (!byDomain.has(c.domain)) { byDomain.set(c.domain, []); domainOrder.push(c.domain); }
        byDomain.get(c.domain)!.push(c);
    }

    const downloadCSV = (filename: string, csvContent: string) => {
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    };

    const handleCrosswalkCSV = () => {
        const headers = ["construct", "domain", ...instruments];
        const rows = result.constructs.map((c) => {
            const cells = [c.constructName, c.domain, ...instruments.map((inst) => {
                const m = c.mappings.find((x) => x.shortName === inst);
                return m ? `${m.elementName} (${m.mappingConfidence})` : "";
            })];
            return cells.map((v) => v.includes(",") ? `"${v}"` : v).join(",");
        });
        downloadCSV("crosswalk.csv", [headers.join(","), ...rows].join("\n"));
    };

    const handleHarmonizedCSV = () => {
        const ds = result.harmonizedDataset;
        if (!ds.rows.length) return;
        const hdrs = Object.keys(ds.rows[0]);
        const lines = [
            hdrs.join(","),
            ...ds.rows.map((row) => hdrs.map((h) => {
                const v = String(row[h] ?? "");
                return v.includes(",") ? `"${v}"` : v;
            }).join(",")),
        ];
        downloadCSV("harmonized_dataset.csv", lines.join("\n"));
    };

    return (
        <div className="border border-teal-200 rounded-lg overflow-hidden">
            <div className="bg-teal-50 px-4 py-3 flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-teal-900">
                        Element Harmonization — {result.constructs.length} construct{result.constructs.length !== 1 ? "s" : ""} across {instruments.length} instrument{instruments.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-teal-700 mt-0.5">{result.summary}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button onClick={handleCrosswalkCSV}
                        className="px-2.5 py-1 text-xs border border-teal-300 text-teal-700 rounded hover:bg-teal-100 transition-colors whitespace-nowrap">
                        Crosswalk CSV
                    </button>
                    <button onClick={handleHarmonizedCSV}
                        className="px-2.5 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors whitespace-nowrap">
                        Harmonized Dataset
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200 w-44">Construct</th>
                            {instruments.map((inst) => (
                                <th key={inst} className="px-3 py-2 text-left font-mono text-purple-700 font-semibold border-b border-gray-200 whitespace-nowrap">
                                    {inst}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {domainOrder.map((domain) => (
                            <React.Fragment key={domain}>
                                <tr className="bg-gray-100">
                                    <td colSpan={instruments.length + 1}
                                        className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                                        {domain}
                                    </td>
                                </tr>
                                {(byDomain.get(domain) ?? []).map((construct) => (
                                    <tr key={construct.constructName} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{construct.constructName}</td>
                                        {instruments.map((inst) => {
                                            const m = construct.mappings.find((x) => x.shortName === inst);
                                            if (!m) return <td key={inst} className="px-3 py-2 text-gray-300 text-center">—</td>;
                                            const conf = CONF_COLORS[m.mappingConfidence] ?? CONF_COLORS.proxy;
                                            return (
                                                <td key={inst} className="px-3 py-2" title={m.description ?? ""}>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf.dot}`} title={m.mappingConfidence} />
                                                        <code className={`font-mono ${conf.text}`}>{m.elementName}</code>
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    {(["direct", "partial", "proxy"] as const).map((c) => (
                        <span key={c} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${CONF_COLORS[c].dot}`} />
                            {c}
                        </span>
                    ))}
                </div>
                <details className="text-xs text-gray-500 ml-auto">
                    <summary className="cursor-pointer hover:text-gray-700 list-none">▶ Reasoning</summary>
                    <p className="mt-1 text-gray-600 leading-relaxed max-w-2xl">{result.reasoning}</p>
                </details>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main ResearchAssistant Component
// ---------------------------------------------------------------------------

export default function ResearchAssistant({
    databaseStructures,
    databaseSites: _databaseSites,
    databaseFilterEnabled,
    databaseConnectionError,
    isVisible: _isVisible,
}: Props) {
    void _databaseSites;
    void _isVisible;

    // Chat state
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [inputText, setInputText] = useState("");
    const [rScript, setRScript] = useState("");
    const [rScriptOpen, setRScriptOpen] = useState(false);
    const [scriptLang, setScriptLang] = useState<"r" | "python" | null>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Phase & error
    const [phase, setPhase] = useState<Phase>("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Selection / data state
    const [selectedShortNames, setSelectedShortNames] = useState<Set<string>>(
        new Set(),
    );
    const [selectedStructures, setSelectedStructures] = useState<
        DataStructure[]
    >([]);
    const [mockDatasets, setMockDatasets] = useState<MockDataset[]>([]);
    const [mergedDatasets, setMergedDatasets] = useState<MergedDataset[]>([]);

    // Analysis streaming (used for auto-scroll dep)
    const [analysisText, setAnalysisText] = useState("");

    // Load-more suggestions state
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Conversation history for multi-turn
    const [conversationHistory, setConversationHistory] = useState<
        ConversationMessage[]
    >([]);
    const [suggestHistory, setSuggestHistory] = useState<
        Array<{ role: "user" | "assistant"; content: string }>
    >([]);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages, analysisText]);

    // ---------------------------------------------------------------------------
    // handleMerge
    // ---------------------------------------------------------------------------

    const handleMerge = useCallback((a: MockDataset, b: MockDataset) => {
        const defaultName =
            `df_${a.structure.shortName}_${b.structure.shortName}`
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, "_");
        const schemaMap = new Map<string, DataElement>();
        for (const e of [...a.schema, ...b.schema]) {
            if (!schemaMap.has(e.name)) schemaMap.set(e.name, e);
        }
        const mergedSchema = [...schemaMap.values()];
        const allKeys = mergedSchema.map((e) => e.name);
        const padRow = (row: Record<string, unknown>) =>
            Object.fromEntries(allKeys.map((k) => [k, row[k] ?? null]));
        setMergedDatasets((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                name: defaultName,
                sourceNames: [a.structure.shortName, b.structure.shortName],
                rows: [...a.rows.map(padRow), ...b.rows.map(padRow)],
                schema: mergedSchema,
            },
        ]);
    }, []);

    // ---------------------------------------------------------------------------
    // handleAddToMerge
    // ---------------------------------------------------------------------------

    const handleAddToMerge = useCallback(
        (source: MockDataset, mergedId: string) => {
            setMergedDatasets((prev) =>
                prev.map((m) => {
                    if (m.id !== mergedId) return m;
                    if (m.sourceNames.includes(source.structure.shortName))
                        return m; // duplicate guard
                    const schemaMap = new Map<string, DataElement>();
                    for (const e of [...m.schema, ...source.schema]) {
                        if (!schemaMap.has(e.name)) schemaMap.set(e.name, e);
                    }
                    const mergedSchema = [...schemaMap.values()];
                    const allKeys = mergedSchema.map((e) => e.name);
                    const padRow = (row: Record<string, unknown>) =>
                        Object.fromEntries(
                            allKeys.map((k) => [k, row[k] ?? null]),
                        );
                    return {
                        ...m,
                        sourceNames: [
                            ...m.sourceNames,
                            source.structure.shortName,
                        ],
                        rows: [
                            ...m.rows.map(padRow),
                            ...source.rows.map(padRow),
                        ],
                        schema: mergedSchema,
                    };
                }),
            );
        },
        [],
    );

    // ---------------------------------------------------------------------------
    // handleSuggest
    // ---------------------------------------------------------------------------

    const handleSuggest = async (q: string, isRefinement: boolean) => {
        if (!q.trim()) return;

        const historyToSend = isRefinement ? suggestHistory : [];

        setPhase("suggesting");
        setErrorMsg(null);

        if (!isRefinement) {
            setChatMessages([
                { id: crypto.randomUUID(), type: "user", text: q },
            ]);
            setSelectedShortNames(new Set());
            setSelectedStructures([]);
            setMockDatasets([]);
            setMergedDatasets([]);
            setAnalysisText("");
            setConversationHistory([]);
            setSuggestHistory([]);
        } else {
            setChatMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), type: "user", text: q },
            ]);
        }

        try {
            const res = await fetch("/api/v1/research/suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: q,
                    databaseStructures: databaseFilterEnabled
                        ? databaseStructures
                        : [],
                    conversationHistory: historyToSend,
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `HTTP ${res.status}`);
            }

            const data = (await res.json()) as SuggestResponse;

            setChatMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    type: "suggestions",
                    suggestions: data.suggestions,
                    reasoning: data.reasoning,
                    networkGraph: data.networkGraph,
                },
            ]);

            setPhase("selecting");

            const assistantContent = JSON.stringify({
                suggestions: data.suggestions,
                reasoning: data.reasoning,
            });
            setSuggestHistory([
                ...historyToSend,
                { role: "user" as const, content: q },
                { role: "assistant" as const, content: assistantContent },
            ]);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setPhase("error");
        }
    };

    // ---------------------------------------------------------------------------
    // toggleStructure
    // ---------------------------------------------------------------------------

    const toggleStructure = (shortName: string) => {
        setSelectedShortNames((prev) => {
            const next = new Set(prev);
            if (next.has(shortName)) {
                next.delete(shortName);
            } else {
                next.add(shortName);
            }
            return next;
        });
    };

    // ---------------------------------------------------------------------------
    // handleLoadMore
    // ---------------------------------------------------------------------------

    const handleLoadMore = useCallback(async () => {
        const latestSugMsg = [...chatMessages]
            .reverse()
            .find(
                (m): m is Extract<ChatMsg, { type: "suggestions" }> =>
                    m.type === "suggestions",
            );
        if (!latestSugMsg) return;

        const excludeShortNames = latestSugMsg.suggestions.map(
            (s) => s.shortName,
        );

        // Find the user message that preceded the latest suggestions
        const latestSugIdx = chatMessages.findIndex(
            (m) => m.id === latestSugMsg.id,
        );
        const lastUserMsg =
            chatMessages
                .slice(0, latestSugIdx)
                .filter(
                    (m): m is Extract<ChatMsg, { type: "user" }> =>
                        m.type === "user",
                )
                .at(-1)?.text ?? "";

        setIsLoadingMore(true);
        setErrorMsg(null);

        try {
            const res = await fetch("/api/v1/research/suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question:
                        lastUserMsg || "Show me more relevant instruments",
                    databaseStructures: databaseFilterEnabled
                        ? databaseStructures
                        : [],
                    conversationHistory: suggestHistory,
                    excludeShortNames,
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `HTTP ${res.status}`);
            }

            const data = (await res.json()) as SuggestResponse;
            const newSugs = data.suggestions;

            setChatMessages((prev) =>
                prev.map((m) =>
                    m.id === latestSugMsg.id && m.type === "suggestions"
                        ? { ...m, suggestions: [...m.suggestions, ...newSugs] }
                        : m,
                ),
            );
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoadingMore(false);
        }
    }, [
        chatMessages,
        databaseFilterEnabled,
        databaseStructures,
        suggestHistory,
    ]);

    // ---------------------------------------------------------------------------
    // handleGenerateMock
    // ---------------------------------------------------------------------------

    const handleGenerateMock = useCallback(async () => {
        if (selectedShortNames.size === 0) return;
        setPhase("generating");
        setErrorMsg(null);

        try {
            const res = await fetch("/api/v1/research/mock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    selectedStructures: [...selectedShortNames],
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `HTTP ${res.status}`);
            }

            const datasets = (await res.json()) as MockDataset[];
            setMockDatasets(datasets);
            setSelectedStructures(datasets.map((d) => d.structure));

            setChatMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), type: "mock-ready", datasets },
                {
                    id: crypto.randomUUID(),
                    type: "hint",
                    text: `${datasets.length} dataset${datasets.length > 1 ? "s" : ""} ready. Expand the cards below to explore or drag datasets together to merge them. Type a research question or paste a script to analyze.`,
                },
            ]);

            setPhase("complete");
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setPhase("error");
        }
    }, [selectedShortNames]);

    // ---------------------------------------------------------------------------
    // handleAnalyze
    // ---------------------------------------------------------------------------

    const handleAnalyze = useCallback(
        async (q: string, script?: string) => {
            if (!q.trim() || mockDatasets.length === 0) return;

            const mergedContext =
                mergedDatasets.length > 0
                    ? `\n\nMerged datasets available for analysis:\n` +
                      mergedDatasets
                          .map(
                              (m) =>
                                  `- ${m.name}: ${m.rows.length} rows (merged from ${m.sourceNames.join(" + ")})`,
                          )
                          .join("\n")
                    : "";

            const fullQuestion = script?.trim()
                ? `${q}${mergedContext}\n\nR/Python script to adapt:\n\`\`\`${scriptLang ?? "r"}\n${script}\n\`\`\``
                : `${q}${mergedContext}`;

            setPhase("analyzing");
            setAnalysisText("");

            const analysisId = crypto.randomUUID();
            setChatMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    type: "user",
                    text:
                        q +
                        (script
                            ? ` [+ ${scriptLang === "python" ? "Python" : "R"} script]`
                            : ""),
                },
                { id: analysisId, type: "analysis", text: "", charts: [] },
            ]);

            try {
                const res = await fetch("/api/v1/research/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        question: fullQuestion,
                        selectedStructures,
                        mockDatasets,
                        conversationHistory,
                    }),
                });

                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(text || `HTTP ${res.status}`);
                }

                const reader = res.body?.getReader();
                if (!reader) throw new Error("No response stream");

                const decoder = new TextDecoder();
                let fullText = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    fullText += chunk;
                    setAnalysisText(fullText);
                    setChatMessages((prev) =>
                        prev.map((m) =>
                            m.id === analysisId && m.type === "analysis"
                                ? { ...m, text: fullText }
                                : m,
                        ),
                    );
                }

                const chartsMatch = fullText.match(
                    /<charts>([\s\S]*?)<\/charts>/,
                );
                const cleanText = fullText
                    .replace(/<charts>[\s\S]*?<\/charts>/, "")
                    .trim();
                setAnalysisText(cleanText);

                let parsedCharts: ChartConfig[] = [];
                if (chartsMatch) {
                    try {
                        parsedCharts = JSON.parse(
                            chartsMatch[1],
                        ) as ChartConfig[];
                    } catch {
                        // Charts block malformed — ignore
                    }
                }

                setChatMessages((prev) =>
                    prev.map((m) =>
                        m.id === analysisId && m.type === "analysis"
                            ? { ...m, text: cleanText, charts: parsedCharts }
                            : m,
                    ),
                );

                setConversationHistory((prev) => [
                    ...prev,
                    { role: "user", content: q, timestamp: Date.now() },
                    {
                        role: "assistant",
                        content: cleanText,
                        timestamp: Date.now(),
                    },
                ]);

                setPhase("complete");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setErrorMsg(msg);
                setPhase("error");
                setChatMessages((prev) =>
                    prev.map((m) =>
                        m.id === analysisId && m.type === "analysis"
                            ? { ...m, text: `[Analysis failed: ${msg}]` }
                            : m,
                    ),
                );
            }
        },
        [
            mockDatasets,
            selectedStructures,
            conversationHistory,
            mergedDatasets,
            scriptLang,
        ],
    );

    // ---------------------------------------------------------------------------
    // handleHarmonize
    // ---------------------------------------------------------------------------

    const handleHarmonize = useCallback(async () => {
        if (mockDatasets.length < 2) return;
        setPhase("harmonizing");
        setErrorMsg(null);

        const lastQ = [...chatMessages].reverse().find((m) => m.type === "user")?.text ?? "";
        const structuresWithElements = mockDatasets.map((ds) => ({
            shortName: ds.structure.shortName,
            title: ds.structure.title,
            dataElements: ds.schema,
            sites: ds.structure.submittedByProjects,
        }));

        try {
            const res = await fetch("/api/v1/research/harmonize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: lastQ, structures: structuresWithElements }),
            });
            if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
            const data = (await res.json()) as HarmonizeResponse;

            setChatMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), type: "harmonize" as const, result: { ...data } },
            ]);
            setPhase("complete");
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setPhase("error");
        }
    }, [mockDatasets, chatMessages]);

    // ---------------------------------------------------------------------------
    // Unified submit
    // ---------------------------------------------------------------------------

    const handleSubmit = () => {
        const text = inputText.trim();
        if (!text || isLoading) return;
        setInputText("");
        const script = rScriptOpen ? rScript : undefined;

        if (phase === "idle" || phase === "error") {
            void handleSuggest(text, false);
        } else if (phase === "selecting") {
            void handleSuggest(text, true);
        } else if (phase === "complete") {
            void handleAnalyze(text, script);
        }
    };

    // ---------------------------------------------------------------------------
    // Derived values
    // ---------------------------------------------------------------------------

    const availableVars = [
        ...mockDatasets.map(
            (ds) =>
                `df_${ds.structure.shortName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        ),
        ...mergedDatasets.map((m) => m.name),
    ];

    const confidenceColor: Record<string, string> = {
        high: "bg-green-100 text-green-800",
        medium: "bg-yellow-100 text-yellow-800",
        low: "bg-gray-100 text-gray-700",
    };

    const isLoading =
        phase === "suggesting" ||
        phase === "generating" ||
        phase === "analyzing" ||
        phase === "harmonizing";

    const latestSuggestionsIdx = chatMessages.reduce(
        (acc, m, i) => (m.type === "suggestions" ? i : acc),
        -1,
    );

    const hasAnalysis = conversationHistory.length > 0;

    const inputPlaceholder = isLoading
        ? "Please wait…"
        : phase === "idle" || phase === "error"
          ? "Describe your research question…"
          : phase === "selecting"
            ? "Refine the suggestions, or select instruments and click Generate…"
            : phase === "complete"
              ? hasAnalysis
                  ? "Ask a follow-up question…"
                  : "Ask Claude to analyze the mock data…"
              : "Describe your research question…";

    const contextLine =
        phase === "idle" || phase === "error" || phase === "suggesting"
            ? `Searching ${databaseFilterEnabled ? databaseStructures.length + " IMPACT-MH" : "all NDA"} instruments · Enter to submit`
            : phase === "selecting"
              ? `${selectedShortNames.size} selected · Refine or generate mock data`
              : phase === "complete" || phase === "analyzing"
                ? "Enter to send · Paste an R/Python script above to include in analysis"
                : "";

    const showScriptPanel = phase === "complete" || phase === "analyzing";

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <div
            className="flex flex-col"
            style={{ height: phase === "idle" ? "auto" : "calc(100vh - 8rem)" }}
        >
            {/* Static header */}
            <div className="shrink-0 pb-3 space-y-2">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-0.5">
                        Research Assistant
                    </h1>
                    <p className="text-gray-500 text-sm">
                        Explore IMPACT-MH instruments, generate mock datasets,
                        and plan your analysis — powered by Claude.
                    </p>
                </div>
                {databaseConnectionError && (
                    <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-800">
                        Database connection unavailable. Suggestions will use
                        all NDA structures.
                    </div>
                )}
                <Phase2Banner />
            </div>

            {/* Scrollable chat thread */}
            <div
                className={`${phase !== "idle" ? "flex-1 overflow-y-auto" : ""} space-y-4 py-2 min-h-0 pr-1`}
            >
                {chatMessages.length === 0 && (
                    <EmptyState
                        databaseFilterEnabled={databaseFilterEnabled}
                        count={databaseStructures.length}
                    />
                )}

                {chatMessages.map((msg, i) => {
                    if (msg.type === "user") {
                        return <UserBubble key={msg.id} text={msg.text} />;
                    }
                    if (msg.type === "hint") {
                        return (
                            <div
                                key={msg.id}
                                className="text-xs text-gray-400 italic pl-1"
                            >
                                {msg.text}
                            </div>
                        );
                    }
                    if (msg.type === "suggestions") {
                        return (
                            <SuggestionsMessage
                                key={msg.id}
                                msg={msg}
                                selectedShortNames={selectedShortNames}
                                toggleStructure={toggleStructure}
                                phase={phase}
                                isLatest={i === latestSuggestionsIdx}
                                onGenerate={() => void handleGenerateMock()}
                                isGenerating={phase === "generating"}
                                onLoadMore={() => void handleLoadMore()}
                                isLoadingMore={isLoadingMore}
                                confidenceColor={confidenceColor}
                            />
                        );
                    }
                    if (msg.type === "mock-ready") {
                        return (
                            <MockReadyMessage
                                key={msg.id}
                                datasets={mockDatasets}
                                mergedDatasets={mergedDatasets}
                                onMerge={handleMerge}
                                onAddToMerge={handleAddToMerge}
                                onRenameMerged={(id, name) =>
                                    setMergedDatasets((prev) =>
                                        prev.map((m) =>
                                            m.id === id ? { ...m, name } : m,
                                        ),
                                    )
                                }
                                onRemoveMerged={(id) =>
                                    setMergedDatasets((prev) =>
                                        prev.filter((m) => m.id !== id),
                                    )
                                }
                                onRemoveDataset={(shortName) => {
                                    setMockDatasets((prev) =>
                                        prev.filter(
                                            (d) =>
                                                d.structure.shortName !==
                                                shortName,
                                        ),
                                    );
                                    setSelectedStructures((prev) =>
                                        prev.filter(
                                            (s) => s.shortName !== shortName,
                                        ),
                                    );
                                }}
                                onHarmonize={
                                    phase === "complete" && mockDatasets.length > 1
                                        ? () => void handleHarmonize()
                                        : undefined
                                }
                            />
                        );
                    }
                    if (msg.type === "analysis") {
                        return (
                            <AnalysisMessage
                                key={msg.id}
                                msg={msg}
                                phase={phase}
                                datasets={mockDatasets}
                            />
                        );
                    }
                    if (msg.type === "harmonize") {
                        return <HarmonizeMessage key={msg.id} result={msg.result} />;
                    }
                    return null;
                })}

                {isLoading && (
                    <LoadingBubble
                        phase={phase}
                        suggestHistory={suggestHistory}
                    />
                )}

                {phase === "error" && errorMsg && (
                    <ErrorBubble
                        msg={errorMsg}
                        onDismiss={() => setPhase("idle")}
                    />
                )}

                <div ref={chatEndRef} />
            </div>

            {/* R/Python script panel — shown when complete or analyzing */}
            {showScriptPanel && (
                <div
                    className={`shrink-0 border-t border-gray-100 transition-colors ${isDraggingFile ? "bg-purple-50 ring-2 ring-purple-300 ring-inset" : ""}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        const file = e.dataTransfer.files[0];
                        if (!file) return;
                        const ext =
                            file.name.split(".").pop()?.toLowerCase() ?? "";
                        if (ext === "r" || ext === "rmd") setScriptLang("r");
                        else if (ext === "py") setScriptLang("python");
                        const reader = new FileReader();
                        reader.onload = (ev) =>
                            setRScript((ev.target?.result as string) ?? "");
                        reader.readAsText(file);
                        if (!rScriptOpen) setRScriptOpen(true);
                    }}
                >
                    <button
                        onClick={() => setRScriptOpen((v) => !v)}
                        className="w-full flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <span className="text-gray-400">
                            {rScriptOpen ? "▼" : "▶"}
                        </span>
                        R/Python script (optional)
                        {scriptLang && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-mono">
                                {scriptLang === "r" ? "R" : "Python"}
                            </span>
                        )}
                        {isDraggingFile && (
                            <span className="ml-auto text-purple-600 font-medium">
                                Drop .r · .py · .Rmd file here
                            </span>
                        )}
                    </button>
                    {availableVars.length > 0 && (
                        <p className="px-3 text-xs text-gray-400">
                            Available:{" "}
                            {availableVars.map((v) => (
                                <code
                                    key={v}
                                    className="font-mono mr-1 text-indigo-600"
                                >
                                    {v}
                                </code>
                            ))}
                        </p>
                    )}
                    {rScriptOpen && (
                        <textarea
                            value={rScript}
                            onChange={(e) => setRScript(e.target.value)}
                            placeholder={
                                scriptLang === "python"
                                    ? "# Paste Python script\nimport pandas as pd\ndf = pd.read_csv(...)"
                                    : "# Paste R analysis script\nlibrary(tidyverse)\ndf <- read_csv(...)"
                            }
                            className="w-full font-mono text-xs border-0 bg-gray-50 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-purple-300"
                            rows={6}
                        />
                    )}
                </div>
            )}

            {/* Sticky input bar */}
            <div className="shrink-0 pt-2 pb-1 border-t border-gray-200">
                <div className="flex gap-2">
                    <input
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={inputPlaceholder}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                    />
                    {phase === "selecting" && selectedShortNames.size > 0 && (
                        <button
                            onClick={() => void handleGenerateMock()}
                            disabled={isLoading}
                            className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap transition-colors"
                        >
                            Generate ({selectedShortNames.size})
                        </button>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading || !inputText.trim()}
                        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                        {phase === "suggesting"
                            ? "Finding…"
                            : phase === "analyzing"
                              ? "Analyzing…"
                              : "Send"}
                    </button>
                </div>
                {contextLine && (
                    <p className="text-xs text-gray-400 mt-1 px-1">
                        {contextLine}
                    </p>
                )}
            </div>
        </div>
    );
}

"use client";

import { useState, useMemo, useCallback } from "react";
import type { NetworkGraph } from "@/types";
import { useSpringSimulation } from "./useSpringSimulation";

const DT_PALETTE = [
    "#2563eb", "#0891b2", "#059669", "#d97706",
    "#dc2626", "#9333ea", "#db2777", "#0284c7",
];
const SITE_PALETTE = [
    "#f59e0b", "#ef4444", "#10b981", "#6366f1",
    "#f97316", "#14b8a6", "#a855f7", "#84cc16",
];
const DEFAULT_NODE_COLOR = "#7c3aed";

const JACCARD_EDGE_COLOR = (j: number) =>
    j >= 0.25 ? "#10b981" : j >= 0.08 ? "#f59e0b" : "#f97316";

const BLOB_PAD = 32;
const WIDTH = 600;
const HEIGHT = 380;

interface Blob { label: string; color: string; cx: number; cy: number; rx: number; ry: number }

function computeBlob(
    nodeIds: string[],
    posMap: Map<string, { x: number; y: number }>,
): { cx: number; cy: number; rx: number; ry: number } | null {
    const pts = nodeIds.map((id) => posMap.get(id)).filter(Boolean) as { x: number; y: number }[];
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const rx = Math.max((Math.max(...xs) - Math.min(...xs)) / 2 + BLOB_PAD, BLOB_PAD);
    const ry = Math.max((Math.max(...ys) - Math.min(...ys)) / 2 + BLOB_PAD, BLOB_PAD);
    return { cx, cy, rx, ry };
}

export function NetworkDiagram({ graph, printMode = false }: { graph: NetworkGraph; printMode?: boolean }) {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [clickedNodeId, setClickedNodeId] = useState<string | null>(null);
    const [clickedEdgeIdx, setClickedEdgeIdx] = useState<number | null>(null);
    const [showSiteBlobs, setShowSiteBlobs] = useState(true);
    const [showDtBlobs, setShowDtBlobs] = useState(true);

    const groupingEdges = useMemo(() => {
        const pairs: { source: string; target: string; idealLength: number; strength: number }[] = [];
        const nodes = graph.nodes;
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                const sharesSite = (a.sites ?? []).some((s) => (b.sites ?? []).includes(s));
                const sharesDt = a.dataType && a.dataType === b.dataType;
                if (sharesSite || sharesDt) {
                    pairs.push({ source: a.id, target: b.id, idealLength: 85, strength: 0.08 });
                }
            }
        }
        return pairs;
    }, [graph.nodes]);

    const simEdges = useMemo(
        () => [...graph.edges, ...groupingEdges],
        [graph.edges, groupingEdges],
    );

    const positions = useSpringSimulation(graph.nodes, simEdges, {
        width: WIDTH, height: HEIGHT, repulsion: 4000, idealLength: 280, paddingX: 44, paddingY: 24,
        instant: printMode,
    });

    const posMap = useMemo(
        () => new Map(positions.map((n) => [n.id, { x: n.x, y: n.y }])),
        [positions],
    );

    const dtColorMap = useMemo(() => {
        const types = [...new Set(graph.nodes.map((n) => n.dataType).filter(Boolean) as string[])].sort();
        return new Map(types.map((t, i) => [t, DT_PALETTE[i % DT_PALETTE.length]]));
    }, [graph.nodes]);

    const siteColorMap = useMemo(() => {
        const sites = [...new Set(graph.nodes.flatMap((n) => n.sites ?? []))].sort();
        return new Map(sites.map((s, i) => [s, SITE_PALETTE[i % SITE_PALETTE.length]]));
    }, [graph.nodes]);

    const nodeColor = useCallback(
        (dataType?: string) => (dataType ? (dtColorMap.get(dataType) ?? DEFAULT_NODE_COLOR) : DEFAULT_NODE_COLOR),
        [dtColorMap],
    );

    const siteBlobs = useMemo((): Blob[] => {
        if (!showSiteBlobs) return [];
        const siteMap = new Map<string, string[]>();
        for (const node of graph.nodes) {
            for (const site of node.sites ?? []) {
                if (!siteMap.has(site)) siteMap.set(site, []);
                siteMap.get(site)!.push(node.id);
            }
        }
        return [...siteMap.entries()].flatMap(([site, ids]) => {
            const geom = computeBlob(ids, posMap);
            if (!geom) return [];
            return [{ label: site, color: siteColorMap.get(site) ?? SITE_PALETTE[0], ...geom }];
        });
    }, [graph.nodes, posMap, showSiteBlobs, siteColorMap]);

    const dtBlobs = useMemo((): Blob[] => {
        if (!showDtBlobs) return [];
        const dtMap = new Map<string, string[]>();
        for (const node of graph.nodes) {
            if (!node.dataType) continue;
            if (!dtMap.has(node.dataType)) dtMap.set(node.dataType, []);
            dtMap.get(node.dataType)!.push(node.id);
        }
        return [...dtMap.entries()].flatMap(([dt, ids]) => {
            const geom = computeBlob(ids, posMap);
            if (!geom) return [];
            return [{ label: dt, color: dtColorMap.get(dt) ?? DEFAULT_NODE_COLOR, ...geom }];
        });
    }, [graph.nodes, posMap, showDtBlobs, dtColorMap]);

    const connectedNodeIds = useMemo(() => {
        if (!hoveredNodeId) return new Set<string>();
        const set = new Set<string>();
        for (const edge of graph.edges) {
            if (edge.source === hoveredNodeId) set.add(edge.target);
            if (edge.target === hoveredNodeId) set.add(edge.source);
        }
        return set;
    }, [hoveredNodeId, graph.edges]);

    const connectedEdgeIndices = useMemo(() => {
        if (!hoveredNodeId) return new Set<number>();
        const set = new Set<number>();
        graph.edges.forEach((edge, i) => {
            if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) set.add(i);
        });
        return set;
    }, [hoveredNodeId, graph.edges]);

    const isHovering = hoveredNodeId !== null;

    if (graph.nodes.length === 0) {
        return <div className="text-gray-400 text-sm text-center py-8">No network data available</div>;
    }

    return (
        <div className="overflow-auto">
            <svg
                width={WIDTH}
                height={HEIGHT}
                className="border rounded bg-gray-50 mx-auto block"
                onClick={() => { setClickedNodeId(null); setClickedEdgeIdx(null); }}
            >
                <defs>
                    <filter id="nd-node-glow" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Site blobs — behind everything */}
                {siteBlobs.map((blob) => (
                    <g key={`site-${blob.label}`} style={{ pointerEvents: "none" }}>
                        <ellipse
                            cx={blob.cx} cy={blob.cy} rx={blob.rx} ry={blob.ry}
                            fill={blob.color} fillOpacity={0.09}
                            stroke={blob.color} strokeOpacity={0.4} strokeWidth={1.5}
                        />
                        <text x={blob.cx} y={blob.cy - blob.ry + 11}
                            textAnchor="middle" fontSize={8} fontWeight="600"
                            fill={blob.color} fillOpacity={0.75}>
                            {blob.label}
                        </text>
                    </g>
                ))}

                {/* Datatype blobs — dashed, behind edges/nodes */}
                {dtBlobs.map((blob) => (
                    <g key={`dt-${blob.label}`} style={{ pointerEvents: "none" }}>
                        <ellipse
                            cx={blob.cx} cy={blob.cy} rx={blob.rx} ry={blob.ry}
                            fill={blob.color} fillOpacity={0.06}
                            stroke={blob.color} strokeOpacity={0.3} strokeWidth={1.2}
                            strokeDasharray="5 3"
                        />
                        <text x={blob.cx} y={blob.cy + blob.ry - 4}
                            textAnchor="middle" fontSize={8} fontWeight="600"
                            fill={blob.color} fillOpacity={0.6}>
                            {blob.label}
                        </text>
                    </g>
                ))}

                {/* Edges */}
                {graph.edges.map((edge, i) => {
                    const src = posMap.get(edge.source);
                    const tgt = posMap.get(edge.target);
                    if (!src || !tgt) return null;
                    const active = connectedEdgeIndices.has(i);
                    const isClicked = clickedEdgeIdx === i;
                    const edgeColor = JACCARD_EDGE_COLOR(edge.jaccardSimilarity ?? 0);
                    const mx = (src.x + tgt.x) / 2;
                    const my = (src.y + tgt.y) / 2;
                    return (
                        <g key={i}>
                            <line
                                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                stroke={isClicked ? "#4f46e5" : edgeColor}
                                strokeWidth={isClicked ? Math.min((edge.weight ?? 1) + 2, 6) : Math.min(edge.weight ?? 1, 4)}
                                strokeOpacity={isHovering ? (active ? 1 : 0.06) : 0.7}
                                style={{ transition: "stroke-opacity 0.18s" }}
                            />
                            <line
                                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                stroke="transparent" strokeWidth={12}
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setClickedNodeId(null);
                                    setClickedEdgeIdx(isClicked ? null : i);
                                }}
                            />
                            {(active || isClicked) && edge.label && (
                                <g style={{ pointerEvents: "none" }}>
                                    <rect
                                        x={mx - (edge.label.length * 3.2 + 8)} y={my - 9}
                                        width={edge.label.length * 6.4 + 16} height={15} rx={4}
                                        fill={isClicked ? "#4f46e5" : "white"}
                                        stroke={isClicked ? "#4f46e5" : edgeColor}
                                        strokeWidth={0.8} fillOpacity={0.95}
                                    />
                                    <text x={mx} y={my + 2} textAnchor="middle" fontSize={8}
                                        fill={isClicked ? "white" : edgeColor} fontWeight="600">
                                        {edge.label}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}

                {/* Nodes */}
                {positions.map((node) => {
                    const color = nodeColor(node.dataType);
                    const baseRadius = 14;
                    const isHovered = node.id === hoveredNodeId;
                    const isConnected = connectedNodeIds.has(node.id);
                    const isClicked = node.id === clickedNodeId;
                    const radius = isHovered ? baseRadius * 1.35 : baseRadius;
                    const fullLabel = node.label;
                    const shortLabel = fullLabel.length > 14 ? fullLabel.slice(0, 13) + "…" : fullLabel;
                    const tooltipWidth = Math.min(Math.max(fullLabel.length * 7 + 16, 60), 200);
                    return (
                        <g
                            key={node.id}
                            style={{
                                cursor: "pointer",
                                opacity: isHovering ? (isHovered || isConnected ? 1 : 0.15) : 1,
                                transition: "opacity 0.18s",
                            }}
                            onMouseEnter={() => setHoveredNodeId(node.id)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            onClick={(e) => {
                                e.stopPropagation();
                                setClickedEdgeIdx(null);
                                setClickedNodeId(isClicked ? null : node.id);
                            }}
                        >
                            {isHovered && (
                                <circle cx={node.x} cy={node.y} r={radius + 9}
                                    fill={color} fillOpacity={0.22} filter="url(#nd-node-glow)" />
                            )}
                            <circle
                                cx={node.x} cy={node.y} r={radius}
                                fill={color} fillOpacity={isHovered ? 1 : 0.85}
                                stroke={isClicked ? "#1e1b4b" : "white"}
                                strokeWidth={isClicked ? 3 : isHovered ? 3 : 2}
                            />
                            <text
                                x={node.x} y={node.y + radius + 10}
                                textAnchor="middle" fontSize={9}
                                fill={isHovering ? (isHovered || isConnected ? "#111827" : "#9ca3af") : "#374151"}
                                fontWeight="bold"
                                style={{ transition: "fill 0.18s" }}
                            >
                                {shortLabel}
                            </text>
                            {isHovered && fullLabel !== shortLabel && (
                                <g>
                                    <rect
                                        x={node.x - tooltipWidth / 2} y={node.y - radius - 24}
                                        width={tooltipWidth} height={17} rx={5}
                                        fill="#1f2937" fillOpacity={0.92}
                                    />
                                    <text x={node.x} y={node.y - radius - 12}
                                        textAnchor="middle" fontSize={10} fill="white" fontWeight="500">
                                        {fullLabel}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Blob toggles + legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center text-xs">
                {printMode ? (
                    <>
                        <span className="flex items-center gap-1 text-amber-700">
                            <span className="w-3 h-3 rounded-full inline-block bg-amber-400 opacity-70" />
                            sites
                        </span>
                        <span className="flex items-center gap-1 text-blue-700">
                            <span className="w-3 h-3 rounded-full inline-block bg-blue-400 opacity-70" style={{ border: "1px dashed #2563eb" }} />
                            data types
                        </span>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => setShowSiteBlobs((v) => !v)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors ${
                                showSiteBlobs ? "bg-amber-50 border-amber-300 text-amber-700" : "border-gray-200 text-gray-400"
                            }`}
                        >
                            <span className="w-3 h-3 rounded-full inline-block bg-amber-400 opacity-70" />
                            sites
                        </button>
                        <button
                            onClick={() => setShowDtBlobs((v) => !v)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors ${
                                showDtBlobs ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-400"
                            }`}
                        >
                            <span className="w-3 h-3 rounded-full inline-block bg-blue-400 opacity-70" style={{ border: "1px dashed #2563eb" }} />
                            data types
                        </button>
                    </>
                )}
                <span className="flex items-center gap-1 font-medium text-gray-400 ml-1">overlap:</span>
                {([["≥25%", 0.3], ["8–25%", 0.12], ["<8%", 0]] as [string, number][]).map(([label, j]) => (
                    <span key={label} className="flex items-center gap-1 text-gray-500">
                        <span className="w-5 h-1 rounded-full inline-block" style={{ background: JACCARD_EDGE_COLOR(j) }} />
                        {label}
                    </span>
                ))}
            </div>

            {/* Clicked edge — shared elements */}
            {clickedEdgeIdx !== null && (() => {
                const edge = graph.edges[clickedEdgeIdx];
                if (!edge?.sharedElementNames?.length) return null;
                return (
                    <div className="mt-3 border border-violet-200 rounded-lg bg-violet-50 p-3 text-sm max-w-[600px] mx-auto">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-violet-800">
                                {edge.source.replace("instrument:", "")} &amp; {edge.target.replace("instrument:", "")}
                            </span>
                            <button className="text-violet-400 hover:text-violet-600 text-xs" onClick={() => setClickedEdgeIdx(null)}>
                                dismiss
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {edge.sharedElementNames.map((name) => (
                                <span key={name} className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-mono border border-violet-200">
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Clicked node — shared elements per neighbour */}
            {clickedNodeId && (() => {
                const connections = graph.edges
                    .filter((e) =>
                        (e.source === clickedNodeId || e.target === clickedNodeId) &&
                        (e.sharedElementNames?.length ?? 0) > 0
                    )
                    .map((e) => ({
                        other: e.source === clickedNodeId ? e.target : e.source,
                        names: e.sharedElementNames!,
                    }));
                if (connections.length === 0) return null;
                return (
                    <div className="mt-3 border border-violet-200 rounded-lg bg-violet-50 p-3 text-sm max-w-[600px] mx-auto">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-violet-800">
                                {clickedNodeId.replace("instrument:", "")} — shared elements
                            </span>
                            <button className="text-violet-400 hover:text-violet-600 text-xs" onClick={() => setClickedNodeId(null)}>
                                dismiss
                            </button>
                        </div>
                        <div className="space-y-2">
                            {connections.map(({ other, names }) => (
                                <div key={other}>
                                    <div className="text-xs text-violet-600 font-medium mb-1">
                                        with {other.replace("instrument:", "")}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {names.map((name) => (
                                            <span key={name} className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-mono border border-violet-200">
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

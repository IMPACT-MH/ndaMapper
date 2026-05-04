"use client";

import { useState, useMemo } from "react";
import type { ElementRelationGraph } from "@/types";
import { useSpringSimulation } from "./useSpringSimulation";

const CONF_EDGE_COLOR: Record<string, string> = {
    direct:  "#10b981",
    partial: "#f59e0b",
    proxy:   "#f97316",
};

const WIDTH = 600;
const HEIGHT = 380;

export function ElementRelationDiagram({ graph }: { graph: ElementRelationGraph }) {
    const positions = useSpringSimulation(graph.nodes, graph.edges, {
        width: WIDTH, height: HEIGHT, repulsion: 900, idealLength: 130, paddingX: 44, paddingY: 24,
    });
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [clickedNodeId, setClickedNodeId] = useState<string | null>(null);
    const [clickedEdgeIdx, setClickedEdgeIdx] = useState<number | null>(null);

    const connectedNodeIds = useMemo(() => {
        if (!hoveredNodeId) return new Set<string>();
        const set = new Set<string>();
        for (const e of graph.edges) {
            if (e.source === hoveredNodeId) set.add(e.target);
            if (e.target === hoveredNodeId) set.add(e.source);
        }
        return set;
    }, [hoveredNodeId, graph.edges]);

    const connectedEdgeIndices = useMemo(() => {
        if (!hoveredNodeId) return new Set<number>();
        const set = new Set<number>();
        graph.edges.forEach((e, i) => {
            if (e.source === hoveredNodeId || e.target === hoveredNodeId) set.add(i);
        });
        return set;
    }, [hoveredNodeId, graph.edges]);

    const isHovering = hoveredNodeId !== null;
    const posMap = new Map(positions.map((n) => [n.id, n]));

    if (graph.nodes.length === 0) return null;

    return (
        <div className="overflow-auto">
            <svg
                width={WIDTH}
                height={HEIGHT}
                className="border rounded bg-gray-50 mx-auto block"
                onClick={() => { setClickedNodeId(null); setClickedEdgeIdx(null); }}
            >
                <defs>
                    <filter id="er-node-glow" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {graph.edges.map((edge, i) => {
                    const src = posMap.get(edge.source);
                    const tgt = posMap.get(edge.target);
                    if (!src || !tgt) return null;
                    const active = connectedEdgeIndices.has(i);
                    const isClicked = clickedEdgeIdx === i;
                    const color = CONF_EDGE_COLOR[edge.dominantConfidence] ?? "#94a3b8";
                    const strokeW = Math.min(1 + edge.sharedConstructs.length, 8);
                    const mx = (src.x + tgt.x) / 2;
                    const my = (src.y + tgt.y) / 2;
                    const label = `${edge.sharedConstructs.length} construct${edge.sharedConstructs.length !== 1 ? "s" : ""}`;
                    return (
                        <g key={i}>
                            <line
                                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                stroke={isClicked ? "#4f46e5" : active ? color : "#cbd5e1"}
                                strokeWidth={isClicked ? strokeW + 1 : strokeW}
                                strokeOpacity={isHovering ? (active ? 1 : 0.08) : 0.65}
                                style={{ transition: "stroke-opacity 0.18s" }}
                            />
                            <line
                                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                stroke="transparent"
                                strokeWidth={14}
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setClickedNodeId(null);
                                    setClickedEdgeIdx(isClicked ? null : i);
                                }}
                            />
                            {(active || isClicked) && (
                                <g>
                                    <rect
                                        x={mx - (label.length * 3.2 + 8)}
                                        y={my - 9}
                                        width={label.length * 6.4 + 16}
                                        height={15}
                                        rx={4}
                                        fill={isClicked ? "#4f46e5" : "white"}
                                        stroke={isClicked ? "#4f46e5" : color}
                                        strokeWidth={0.8}
                                        fillOpacity={0.95}
                                    />
                                    <text x={mx} y={my + 2} textAnchor="middle" fontSize={8}
                                        fill={isClicked ? "white" : color} fontWeight="600">
                                        {label}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}

                {positions.map((node) => {
                    const baseRadius = 9 + Math.min(node.constructCount * 1.5, 13);
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
                                <circle
                                    cx={node.x} cy={node.y}
                                    r={radius + 9}
                                    fill="#7c3aed"
                                    fillOpacity={0.22}
                                    filter="url(#er-node-glow)"
                                />
                            )}
                            <circle
                                cx={node.x} cy={node.y}
                                r={radius}
                                fill="#7c3aed"
                                fillOpacity={isHovered ? 1 : 0.82}
                                stroke={isClicked ? "#4f46e5" : "white"}
                                strokeWidth={isClicked ? 3 : isHovered ? 3 : 2}
                            />
                            <text
                                x={node.x}
                                y={node.y + radius + 10}
                                textAnchor="middle"
                                fontSize={9}
                                fill={isHovering ? (isHovered || isConnected ? "#111827" : "#9ca3af") : "#374151"}
                                fontWeight="bold"
                                style={{ transition: "fill 0.18s" }}
                            >
                                {shortLabel}
                            </text>
                            {isHovered && fullLabel !== shortLabel && (
                                <g>
                                    <rect
                                        x={node.x - tooltipWidth / 2}
                                        y={node.y - radius - 24}
                                        width={tooltipWidth}
                                        height={17}
                                        rx={5}
                                        fill="#1f2937"
                                        fillOpacity={0.92}
                                    />
                                    <text
                                        x={node.x}
                                        y={node.y - radius - 12}
                                        textAnchor="middle"
                                        fontSize={10}
                                        fill="white"
                                        fontWeight="500"
                                    >
                                        {fullLabel}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Confidence legend */}
            <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-600">
                {Object.entries(CONF_EDGE_COLOR).map(([conf, color]) => (
                    <span key={conf} className="flex items-center gap-1">
                        <span className="w-6 h-1 rounded-full inline-block" style={{ background: color }} />
                        {conf}
                    </span>
                ))}
            </div>

            {clickedEdgeIdx !== null && (() => {
                const edge = graph.edges[clickedEdgeIdx];
                if (!edge?.sharedConstructs?.length) return null;
                const srcNode = graph.nodes.find((n) => n.id === edge.source);
                const tgtNode = graph.nodes.find((n) => n.id === edge.target);
                return (
                    <div className="mt-3 border border-indigo-200 rounded-lg bg-indigo-50 p-3 text-sm max-w-[600px] mx-auto">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-indigo-800">
                                {srcNode?.label ?? edge.source} &amp; {tgtNode?.label ?? edge.target}
                            </span>
                            <button className="text-indigo-400 hover:text-indigo-600 text-xs" onClick={() => setClickedEdgeIdx(null)}>
                                dismiss
                            </button>
                        </div>
                        <div className="space-y-1">
                            {edge.sharedConstructs.map((sc) => (
                                <div key={sc.constructName} className="flex items-center gap-2 text-xs">
                                    <span className="font-medium text-indigo-700">{sc.constructName}</span>
                                    <span className="text-indigo-400">{sc.domain}</span>
                                    <span className="text-gray-400">·</span>
                                    <span className="text-gray-500">{sc.confidenceA}/{sc.confidenceB}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {clickedNodeId && (() => {
                const connectedEdges = graph.edges.filter(
                    (e) => e.source === clickedNodeId || e.target === clickedNodeId
                );
                if (connectedEdges.length === 0) return null;
                const node = graph.nodes.find((n) => n.id === clickedNodeId);
                return (
                    <div className="mt-3 border border-indigo-200 rounded-lg bg-indigo-50 p-3 text-sm max-w-[600px] mx-auto">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-indigo-800">
                                {node?.label ?? clickedNodeId} — {node?.constructCount ?? 0} construct{(node?.constructCount ?? 0) !== 1 ? "s" : ""}
                            </span>
                            <button className="text-indigo-400 hover:text-indigo-600 text-xs" onClick={() => setClickedNodeId(null)}>
                                dismiss
                            </button>
                        </div>
                        <div className="space-y-2">
                            {connectedEdges.map((e, i) => {
                                const other = e.source === clickedNodeId ? e.target : e.source;
                                const otherNode = graph.nodes.find((n) => n.id === other);
                                return (
                                    <div key={i}>
                                        <div className="text-xs text-indigo-600 font-medium mb-1">
                                            with {otherNode?.label ?? other} ({e.sharedConstructs.length} shared)
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {e.sharedConstructs.map((sc) => (
                                                <span key={sc.constructName} className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs border border-indigo-200">
                                                    {sc.constructName}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

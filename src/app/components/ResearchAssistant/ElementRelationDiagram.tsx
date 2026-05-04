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

export interface DiagramSelection {
    instruments: Set<string> | null;
    constructs: Set<string> | null;
    mode: "node" | "edge" | null;
}

export function ElementRelationDiagram({
    graph,
    onSelectionChange,
}: {
    graph: ElementRelationGraph;
    onSelectionChange?: (selection: DiagramSelection) => void;
}) {
    const positions = useSpringSimulation(graph.nodes, graph.edges, {
        width: WIDTH, height: HEIGHT, repulsion: 900, idealLength: 130, paddingX: 44, paddingY: 24,
    });
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeIdx, setHoveredEdgeIdx] = useState<number | null>(null);
    const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
    const [selectedEdgeIndices, setSelectedEdgeIndices] = useState<Set<number>>(new Set());

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

    // Nodes that are visually "active" (full opacity) given current selection
    const activeInGraph = useMemo(() => {
        if (selectedNodes.size > 0) return selectedNodes;
        if (selectedEdgeIndices.size > 0) {
            const active = new Set<string>();
            for (const idx of selectedEdgeIndices) {
                const edge = graph.edges[idx];
                if (edge) { active.add(edge.source); active.add(edge.target); }
            }
            return active;
        }
        return null;
    }, [selectedNodes, selectedEdgeIndices, graph.edges]);

    const isHovering = hoveredNodeId !== null;
    const hasSelection = activeInGraph !== null;
    const posMap = new Map(positions.map((n) => [n.id, n]));

    if (graph.nodes.length === 0) return null;

    const applySelection = (nodes: Set<string>, edges: Set<number>) => {
        setSelectedNodes(nodes);
        setSelectedEdgeIndices(edges);

        const hasNodes = nodes.size > 0;
        const hasEdges = edges.size > 0;

        if (!hasNodes && !hasEdges) {
            onSelectionChange?.({ instruments: null, constructs: null, mode: null });
            return;
        }

        const instruments = new Set(nodes);
        const constructs = new Set<string>();
        for (const idx of edges) {
            const edge = graph.edges[idx];
            if (!edge) continue;
            instruments.add(edge.source);
            instruments.add(edge.target);
            for (const sc of edge.sharedConstructs) constructs.add(sc.constructName);
        }

        onSelectionChange?.({
            instruments: instruments.size > 0 ? instruments : null,
            constructs: constructs.size > 0 ? constructs : null,
            mode: hasNodes ? "node" : "edge",
        });
    };

    return (
        <div className="overflow-auto">
            <svg
                width={WIDTH}
                height={HEIGHT}
                className="border rounded bg-gray-50 mx-auto block"
                onClick={() => applySelection(new Set(), new Set())}
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
                    const activeByNode = connectedEdgeIndices.has(i);
                    const isHoveredEdge = hoveredEdgeIdx === i;
                    const edgeIsSelected = selectedEdgeIndices.has(i);
                    const color = CONF_EDGE_COLOR[edge.dominantConfidence] ?? "#94a3b8";
                    const strokeW = Math.min(1 + edge.sharedConstructs.length, 8);
                    const mx = (src.x + tgt.x) / 2;
                    const my = (src.y + tgt.y) / 2;
                    const label = `${edge.sharedConstructs.length} construct${edge.sharedConstructs.length !== 1 ? "s" : ""}`;
                    const showLabel = isHoveredEdge || activeByNode || edgeIsSelected;
                    return (
                        <g key={i}>
                            <line
                                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                stroke={edgeIsSelected ? "#4f46e5" : activeByNode ? color : "#cbd5e1"}
                                strokeWidth={edgeIsSelected ? strokeW + 1 : strokeW}
                                strokeOpacity={isHovering ? (activeByNode ? 1 : 0.08) : 0.65}
                                style={{ transition: "stroke-opacity 0.18s" }}
                            />
                            <line
                                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                stroke="transparent"
                                strokeWidth={14}
                                style={{ cursor: "pointer" }}
                                onMouseEnter={() => setHoveredEdgeIdx(i)}
                                onMouseLeave={() => setHoveredEdgeIdx(null)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const next = new Set(selectedEdgeIndices);
                                    if (next.has(i)) { next.delete(i); } else { next.add(i); }
                                    applySelection(new Set(), next);
                                }}
                            />
                            {showLabel && (
                                <g style={{ pointerEvents: "none" }}>
                                    <rect
                                        x={mx - (label.length * 3.2 + 8)}
                                        y={my - 9}
                                        width={label.length * 6.4 + 16}
                                        height={15}
                                        rx={4}
                                        fill={edgeIsSelected ? "#4f46e5" : "white"}
                                        stroke={edgeIsSelected ? "#4f46e5" : color}
                                        strokeWidth={0.8}
                                        fillOpacity={0.95}
                                    />
                                    <text x={mx} y={my + 2} textAnchor="middle" fontSize={8}
                                        fill={edgeIsSelected ? "white" : color} fontWeight="600">
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
                    const isSelected = selectedNodes.has(node.id);
                    const radius = isHovered ? baseRadius * 1.35 : baseRadius;
                    const fullLabel = node.label;
                    const shortLabel = fullLabel.length > 14 ? fullLabel.slice(0, 13) + "…" : fullLabel;
                    const tooltipWidth = Math.min(Math.max(fullLabel.length * 7 + 16, 60), 200);

                    return (
                        <g
                            key={node.id}
                            style={{
                                cursor: "pointer",
                                opacity: hasSelection
                                    ? (activeInGraph!.has(node.id) ? 1 : 0.15)
                                    : isHovering ? (isHovered || isConnected ? 1 : 0.15) : 1,
                                transition: "opacity 0.18s",
                            }}
                            onMouseEnter={() => setHoveredNodeId(node.id)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            onClick={(e) => {
                                e.stopPropagation();
                                const next = new Set(selectedNodes);
                                if (next.has(node.id)) { next.delete(node.id); } else { next.add(node.id); }
                                applySelection(next, new Set());
                            }}
                        >
                            {isHovered && (
                                <circle cx={node.x} cy={node.y} r={radius + 9}
                                    fill="#7c3aed" fillOpacity={0.22} filter="url(#er-node-glow)" />
                            )}
                            <circle
                                cx={node.x} cy={node.y} r={radius}
                                fill="#7c3aed"
                                fillOpacity={isHovered ? 1 : 0.82}
                                stroke={isSelected ? "#4f46e5" : "white"}
                                strokeWidth={isSelected ? 3 : isHovered ? 3 : 2}
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

            <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-600">
                {Object.entries(CONF_EDGE_COLOR).map(([conf, color]) => (
                    <span key={conf} className="flex items-center gap-1">
                        <span className="w-6 h-1 rounded-full inline-block" style={{ background: color }} />
                        {conf}
                    </span>
                ))}
            </div>
        </div>
    );
}

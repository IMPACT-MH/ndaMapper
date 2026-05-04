"use client";

import { useState, useMemo } from "react";
import type { NetworkGraph } from "@/types";
import { useSpringSimulation } from "./useSpringSimulation";

const NODE_COLORS: Record<string, string> = {
    instrument: "#7c3aed",
    datatype: "#f97316",
    site: "#10b981",
    category: "#f59e0b",
};

const WIDTH = 600;
const HEIGHT = 400;

export function NetworkDiagram({ graph }: { graph: NetworkGraph }) {
    const positions = useSpringSimulation(graph.nodes, graph.edges, {
        width: WIDTH, height: HEIGHT, repulsion: 800, idealLength: 120,
    });
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [clickedNodeId, setClickedNodeId] = useState<string | null>(null);
    const [clickedEdgeIdx, setClickedEdgeIdx] = useState<number | null>(null);

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

    const posMap = new Map(positions.map((n) => [n.id, n]));

    return (
        <div className="overflow-auto">
            <svg
                width={WIDTH}
                height={HEIGHT}
                className="border rounded bg-gray-50 mx-auto block"
                onClick={() => { setClickedNodeId(null); setClickedEdgeIdx(null); }}
            >
                <defs>
                    <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
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
                    const isClickable = (edge.sharedElementNames?.length ?? 0) > 0;
                    const mx = (src.x + tgt.x) / 2;
                    const my = (src.y + tgt.y) / 2;
                    return (
                        <g key={i}>
                            <line
                                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                stroke={isClicked ? "#4f46e5" : active ? "#7c3aed" : "#cbd5e1"}
                                strokeWidth={isClicked
                                    ? Math.min((edge.weight ?? 1) + 2, 6)
                                    : active
                                        ? Math.min((edge.weight ?? 1) + 1, 5)
                                        : (edge.weight ? Math.min(edge.weight, 4) : 1)}
                                strokeOpacity={isHovering ? (active ? 1 : 0.08) : 0.7}
                                style={{ transition: "stroke-opacity 0.18s, stroke-width 0.18s" }}
                            />
                            {isClickable && (
                                <line
                                    x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                                    stroke="transparent"
                                    strokeWidth={12}
                                    style={{ cursor: "pointer" }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setClickedNodeId(null);
                                        setClickedEdgeIdx(isClicked ? null : i);
                                    }}
                                />
                            )}
                            {(active || isClicked) && edge.label && (
                                <g>
                                    <rect
                                        x={mx - (edge.label.length * 3.4 + 8)}
                                        y={my - 9}
                                        width={edge.label.length * 6.8 + 16}
                                        height={15}
                                        rx={4}
                                        fill={isClicked ? "#4f46e5" : "white"}
                                        stroke="#7c3aed"
                                        strokeWidth={0.8}
                                        fillOpacity={0.95}
                                    />
                                    <text
                                        x={mx} y={my + 2}
                                        textAnchor="middle"
                                        fontSize={8}
                                        fill={isClicked ? "white" : "#7c3aed"}
                                        fontWeight="600"
                                    >
                                        {edge.label}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}

                {positions.map((node) => {
                    const color = NODE_COLORS[node.type] ?? "#6b7280";
                    const baseRadius = node.type === "instrument" ? 14 : 9;
                    const isHovered = node.id === hoveredNodeId;
                    const isConnected = connectedNodeIds.has(node.id);
                    const isClicked = node.id === clickedNodeId;
                    const radius = isHovered ? baseRadius * 1.4 : baseRadius;
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
                                if (node.type === "instrument") {
                                    setClickedEdgeIdx(null);
                                    setClickedNodeId(isClicked ? null : node.id);
                                }
                            }}
                        >
                            {isHovered && (
                                <circle
                                    cx={node.x} cy={node.y}
                                    r={radius + 9}
                                    fill={color}
                                    fillOpacity={0.28}
                                    filter="url(#node-glow)"
                                />
                            )}
                            <circle
                                cx={node.x} cy={node.y}
                                r={radius}
                                fill={color}
                                fillOpacity={isHovered ? 1 : 0.85}
                                stroke={isClicked ? "#4f46e5" : "white"}
                                strokeWidth={isClicked ? 3 : isHovered ? 3 : 2}
                            />
                            <text
                                x={node.x}
                                y={node.y + radius + 10}
                                textAnchor="middle"
                                fontSize={9}
                                fill={isHovering ? (isHovered || isConnected ? "#111827" : "#9ca3af") : "#374151"}
                                fontWeight={node.type === "instrument" ? "bold" : "normal"}
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

            <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-600">
                {Object.entries(NODE_COLORS).map(([type, color]) => (
                    <span key={type} className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ background: color }} />
                        {type}
                    </span>
                ))}
            </div>

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

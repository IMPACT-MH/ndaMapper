"use client";

import React, { useState, useMemo } from "react";
import type { ElementHarmonizeResponse, ConstructGroup } from "@/types";
import { buildElementRelationGraph } from "@/lib/elementRelationGraph";
import { OverflowTags } from "./OverflowTags";
import { ElementRelationDiagram, type DiagramSelection } from "./ElementRelationDiagram";

const CONF_COLORS = {
    direct:  { dot: "bg-green-500",  text: "text-green-700" },
    partial: { dot: "bg-amber-400",  text: "text-amber-700" },
    proxy:   { dot: "bg-orange-400", text: "text-orange-700" },
} as const;

function downloadCSV(filename: string, csvContent: string) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

interface ElementHarmonizeMessageProps {
    result: ElementHarmonizeResponse;
    onElementSearch?: (elementName: string) => void;
    onStructureSearch?: (shortName: string) => void;
}

export function ElementHarmonizeMessage({
    result, onElementSearch, onStructureSearch,
}: ElementHarmonizeMessageProps) {
    const structs = result.structures;
    const relGraph = useMemo(
        () => buildElementRelationGraph(structs, result.constructs),
        [structs, result.constructs]
    );

    const [collapsedConstructs, setCollapsedConstructs] = useState<Set<string>>(new Set());
    const toggleConstruct = (name: string) =>
        setCollapsedConstructs((prev) => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });

    const [activeConstructs, setActiveConstructs] = useState<Set<string> | null>(null);
    const [tableActiveInstruments, setTableActiveInstruments] = useState<Set<string> | null>(null);

    const handleDiagramSelection = ({ instruments, constructs, mode }: DiagramSelection) => {
        if (!instruments) {
            setActiveConstructs(null);
            setTableActiveInstruments(null);
            return;
        }
        if (mode === "node") {
            // Show all constructs that involve any selected instrument
            const active = new Set(
                result.constructs
                    .filter((c) => c.mappings.some((m) => instruments.has(m.shortName)))
                    .map((c) => c.constructName)
            );
            setActiveConstructs(active);
            // Light up all instruments that participate in any active construct
            const tableInstr = new Set<string>();
            for (const c of result.constructs) {
                if (active.has(c.constructName)) {
                    for (const m of c.mappings) tableInstr.add(m.shortName);
                }
            }
            setTableActiveInstruments(tableInstr.size > 0 ? tableInstr : null);
        } else {
            // Edge mode: strict — only the edge endpoint columns and their shared constructs
            setActiveConstructs(constructs);
            setTableActiveInstruments(instruments);
        }
    };

    const domainOrder: string[] = [];
    const byDomain = new Map<string, ConstructGroup[]>();
    for (const c of result.constructs) {
        if (!byDomain.has(c.domain)) { byDomain.set(c.domain, []); domainOrder.push(c.domain); }
        byDomain.get(c.domain)!.push(c);
    }

    const handleMatrixCSV = () => {
        const headers = ["construct", "domain", ...structs.map((s) => s.shortName)];
        const rows = result.constructs.map((c) => {
            const cells = [c.constructName, c.domain, ...structs.map((s) => {
                const m = c.mappings.find((x) => x.shortName === s.shortName);
                return m ? `${m.elementName} (${m.mappingConfidence})` : "";
            })];
            return cells.map((v) => (String(v).includes(",") ? `"${v}"` : v)).join(",");
        });
        downloadCSV("element_relations.csv", [headers.join(","), ...rows].join("\n"));
    };

    return (
        <div className="border border-indigo-200 rounded-lg overflow-hidden">
            <div className="bg-indigo-50 px-4 py-3 flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-indigo-900 flex items-center gap-2 flex-wrap">
                        Element Relations — {result.constructs.length} construct{result.constructs.length !== 1 ? "s" : ""} across {structs.length} instrument{structs.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-indigo-700 mt-0.5">{result.summary}</p>
                </div>
                <button
                    onClick={handleMatrixCSV}
                    className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
                >
                    Matrix CSV
                </button>
            </div>

            {result.constructs.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">
                    {result.summary || "No shared elements found. Try asking about specific instruments first."}
                </p>
            ) : (
                <>
                    {relGraph.nodes.length >= 2 && (
                        <div className="px-4 py-3 border-b border-indigo-100">
                            <ElementRelationDiagram graph={relGraph} onSelectionChange={handleDiagramSelection} />
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200 w-44">Construct</th>
                                    {structs.map((s) => (
                                        <th key={s.shortName} className={`px-3 py-2 text-left border-b border-gray-200 whitespace-nowrap transition-opacity ${tableActiveInstruments && !tableActiveInstruments.has(s.shortName) ? "opacity-25" : ""}`}>
                                            <div
                                                className={`font-mono text-indigo-700 font-semibold ${onStructureSearch ? "cursor-pointer hover:underline" : ""}`}
                                                onClick={() => onStructureSearch?.(s.shortName)}
                                                title={onStructureSearch ? `Open ${s.shortName} in Data Structures` : undefined}
                                            >
                                                {s.shortName}
                                            </div>
                                            <div className="mt-1">
                                                <OverflowTags
                                                    items={s.sites}
                                                    itemClassName="text-xs bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded border border-emerald-200"
                                                />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {domainOrder.map((domain) => (
                                    <React.Fragment key={domain}>
                                        <tr className="bg-gray-100">
                                            <td colSpan={structs.length + 1}
                                                className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                                                {domain}
                                            </td>
                                        </tr>
                                        {(byDomain.get(domain) ?? []).map((construct) => {
                                            const isCollapsed = collapsedConstructs.has(construct.constructName);
                                            const rowDimmed = activeConstructs !== null && !activeConstructs.has(construct.constructName);
                                            return (
                                                <tr key={construct.constructName} className={`border-b border-gray-100 transition-opacity ${rowDimmed ? "opacity-25" : "hover:bg-gray-50"}`}>
                                                    <td
                                                        className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap cursor-pointer select-none"
                                                        onClick={() => toggleConstruct(construct.constructName)}
                                                    >
                                                        <span className="mr-1 text-gray-400 text-xs">{isCollapsed ? "▶" : "▼"}</span>
                                                        {construct.constructName}
                                                    </td>
                                                    {structs.map((s) => {
                                                        if (isCollapsed) return <td key={s.shortName} className="hidden" />;
                                                        const colDimmed = tableActiveInstruments !== null && !tableActiveInstruments.has(s.shortName);
                                                        const cellDimmed = colDimmed && !rowDimmed;
                                                        const m = construct.mappings.find((x) => x.shortName === s.shortName);
                                                        if (!m) return <td key={s.shortName} className={`px-3 py-2 text-gray-300 text-center transition-opacity ${cellDimmed ? "opacity-25" : ""}`}>—</td>;
                                                        const conf = CONF_COLORS[m.mappingConfidence] ?? CONF_COLORS.proxy;
                                                        const tooltip = [
                                                            m.description,
                                                            m.valueRange ? `Range: ${m.valueRange}` : "",
                                                        ].filter(Boolean).join("\n") || undefined;
                                                        return (
                                                            <td key={s.shortName} className={`px-3 py-2 transition-opacity ${cellDimmed ? "opacity-25" : ""}`} title={tooltip}>
                                                                <span className="flex items-center gap-1.5">
                                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf.dot}`} title={m.mappingConfidence} />
                                                                    <code
                                                                        className={`font-mono ${conf.text} ${onElementSearch ? "cursor-pointer hover:underline" : ""}`}
                                                                        onClick={() => onElementSearch?.(m.elementName)}
                                                                    >
                                                                        {m.elementName}
                                                                    </code>
                                                                    {m.matchSource === "semantic" && (
                                                                        <span className="text-xs text-violet-500 font-medium" title="Matched by concept normalization">≈</span>
                                                                    )}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
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
                            <span className="flex items-center gap-1 text-violet-500">
                                <span className="font-mono">≈</span> semantic
                            </span>
                        </div>
                        {result.reasoning && (
                            <details className="text-xs text-gray-500 ml-auto">
                                <summary className="cursor-pointer hover:text-gray-700 list-none">▶ Reasoning</summary>
                                <p className="mt-1 text-gray-600 leading-relaxed max-w-2xl">{result.reasoning}</p>
                            </details>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

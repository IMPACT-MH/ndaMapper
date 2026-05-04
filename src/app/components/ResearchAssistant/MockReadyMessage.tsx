"use client";

import { useState } from "react";
import type { MockDataset, DataElement } from "@/types";
import type { MergedDataset } from "./types";
import { ExportControls } from "./ExportControls";

interface MergedDatasetRowProps {
    merged: MergedDataset;
    isDragTarget: boolean;
    isDuplicate: boolean;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: () => void;
    onRename: (name: string) => void;
    onRemove: () => void;
}

function MergedDatasetRow({
    merged, isDragTarget, isDuplicate, onDragOver, onDragLeave, onDrop, onRename, onRemove,
}: MergedDatasetRowProps) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(merged.name);
    const [expanded, setExpanded] = useState(false);

    const headers = merged.schema.map((e: DataElement) => e.name).slice(0, 10);
    const previewRows = merged.rows.slice(0, 8);

    const handleExportCSV = (e: React.MouseEvent) => {
        e.stopPropagation();
        const allHeaders = merged.schema.map((el: DataElement) => el.name);
        const csvLines = [
            allHeaders.join(","),
            ...merged.rows.map((row) =>
                allHeaders.map((h) => {
                    const v = String(row[h] ?? "");
                    return v.includes(",") ? `"${v}"` : v;
                }).join(","),
            ),
        ];
        const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${merged.name}.csv`; a.click();
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
            onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
            onDragLeave={onDragLeave}
            onDrop={(e) => { e.preventDefault(); onDrop(); }}
        >
            <div className="flex items-center gap-2 px-3 py-2 text-sm">
                <button onClick={() => setExpanded((v) => !v)} className="text-indigo-300 text-xs shrink-0">
                    {expanded ? "▼" : "▶"}
                </button>
                <span className="text-indigo-400 select-none shrink-0">⊕</span>
                {editing ? (
                    <input
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        onBlur={() => { onRename(val); setEditing(false); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { onRename(val); setEditing(false); } }}
                        className="font-mono text-xs border border-indigo-300 rounded px-1 py-0.5 focus:outline-none w-40"
                        autoFocus
                    />
                ) : (
                    <button onClick={() => setEditing(true)} className="font-mono text-xs text-indigo-700 hover:underline" title="Click to rename">
                        {merged.name}
                    </button>
                )}
                <span className="text-xs text-indigo-400 truncate">
                    {merged.rows.length} rows · {merged.sourceNames.join(" + ")}
                </span>
                {isDuplicate && <span className="ml-auto text-xs text-amber-600 font-normal whitespace-nowrap">Already included</span>}
                {isDragTarget && !isDuplicate && <span className="ml-auto text-xs text-purple-600 font-normal whitespace-nowrap">Drop to add ↗</span>}
                <button onClick={handleExportCSV} className="text-indigo-400 hover:text-indigo-600 transition-colors shrink-0" title="Export CSV">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                </button>
                <button onClick={onRemove} className="text-gray-300 hover:text-red-400 text-sm leading-none shrink-0">✕</button>
            </div>
            {expanded && (
                <div className="px-3 pb-3 overflow-x-auto text-xs border-t border-indigo-100">
                    <table className="min-w-full divide-y divide-indigo-100 mt-2">
                        <thead className="bg-indigo-50/50">
                            <tr>
                                {headers.map((h) => (
                                    <th key={h} className="px-2 py-1 text-left font-medium text-indigo-400 whitespace-nowrap">{h}</th>
                                ))}
                                {merged.schema.length > 10 && <th className="px-2 py-1 text-indigo-300">…</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-indigo-50">
                            {previewRows.map((row, i) => (
                                <tr key={i}>
                                    {headers.map((h) => (
                                        <td key={h} className="px-2 py-1 text-gray-700 whitespace-nowrap">{String(row[h] ?? "")}</td>
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

export interface MockReadyMessageProps {
    datasets: MockDataset[];
    mergedDatasets: MergedDataset[];
    onMerge: (a: MockDataset, b: MockDataset) => void;
    onAddToMerge: (source: MockDataset, mergedId: string) => void;
    onRenameMerged: (id: string, name: string) => void;
    onRemoveMerged: (id: string) => void;
    onRemoveDataset?: (shortName: string) => void;
    onHarmonize?: () => void;
    onFindSharedElements?: () => void;
}

export function MockReadyMessage({
    datasets, mergedDatasets, onMerge, onAddToMerge, onRenameMerged, onRemoveMerged,
    onRemoveDataset, onHarmonize, onFindSharedElements,
}: MockReadyMessageProps) {
    const [expanded, setExpanded] = useState(false);
    const [dragging, setDragging] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const [dropTargetMergedId, setDropTargetMergedId] = useState<string | null>(null);

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700 flex-1 text-left"
                >
                    <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
                    Mock data ready — {datasets.length} instrument{datasets.length !== 1 ? "s" : ""}
                    <span className="text-gray-400 font-normal">{datasets.map((d) => d.structure.shortName).join(" · ")}</span>
                </button>
                <div className="flex items-center gap-2">
                    {onFindSharedElements && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onFindSharedElements(); }}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 transition-colors whitespace-nowrap"
                        >
                            Find Shared Elements
                        </button>
                    )}
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
                        const isTarget = dropTarget === ds.structure.shortName && dragging !== ds.structure.shortName;
                        const headers = Object.keys(ds.rows[0] ?? {}).slice(0, 10);
                        const previewRows = ds.rows.slice(0, 8);
                        return (
                            <div
                                key={ds.structure.shortName}
                                draggable
                                onDragStart={(e) => { setDragging(ds.structure.shortName); e.dataTransfer.effectAllowed = "move"; }}
                                onDragEnd={() => { setDragging(null); setDropTarget(null); setDropTargetMergedId(null); }}
                                onDragOver={(e) => { e.preventDefault(); setDropTarget(ds.structure.shortName); }}
                                onDragLeave={() => setDropTarget(null)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (dragging && dragging !== ds.structure.shortName) {
                                        const src = datasets.find((d) => d.structure.shortName === dragging);
                                        if (src) onMerge(src, ds);
                                    }
                                    setDragging(null); setDropTarget(null);
                                }}
                                className={`rounded border transition-all ${isTarget ? "ring-2 ring-purple-400 border-purple-300 bg-purple-50" : "border-gray-200"}`}
                            >
                                <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700">
                                    <span className="text-gray-300 cursor-grab text-base select-none">⠿</span>
                                    <span className="font-mono text-purple-700">{ds.structure.shortName}</span>
                                    <span className="text-xs text-gray-400">({ds.rows.length} rows · {ds.schema.length} fields)</span>
                                    <div className="ml-auto flex items-center gap-1">
                                        {isTarget && <span className="text-xs text-purple-600 font-normal">Drop to merge ↗</span>}
                                        {datasets.length > 1 && onRemoveDataset && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onRemoveDataset(ds.structure.shortName); }}
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
                                                    <th key={h} className="px-2 py-1 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                                                ))}
                                                {Object.keys(ds.rows[0] ?? {}).length > 10 && <th className="px-2 py-1 text-gray-400">…</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-100">
                                            {previewRows.map((row, i) => (
                                                <tr key={i}>
                                                    {headers.map((h) => (
                                                        <td key={h} className="px-2 py-1 text-gray-700 whitespace-nowrap">{String(row[h] ?? "")}</td>
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
                            <p className="text-xs text-gray-500 font-medium">Merged datasets</p>
                            {mergedDatasets.map((m) => (
                                <MergedDatasetRow
                                    key={m.id}
                                    merged={m}
                                    isDragTarget={dropTargetMergedId === m.id && !!dragging}
                                    isDuplicate={!!dragging && m.sourceNames.includes(dragging)}
                                    onDragOver={() => setDropTargetMergedId(m.id)}
                                    onDragLeave={() => setDropTargetMergedId(null)}
                                    onDrop={() => {
                                        if (dragging) {
                                            const src = datasets.find((d) => d.structure.shortName === dragging);
                                            if (src && !m.sourceNames.includes(dragging)) onAddToMerge(src, m.id);
                                        }
                                        setDropTargetMergedId(null);
                                    }}
                                    onRename={(name) => onRenameMerged(m.id, name)}
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

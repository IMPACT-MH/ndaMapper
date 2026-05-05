"use client";

import { useState } from "react";
import type { Phase, ChatMsg } from "./types";
import { OverflowTags } from "./OverflowTags";
import { NetworkDiagram } from "./NetworkDiagram";

const CONFIDENCE_COLOR: Record<string, string> = {
    high: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-gray-100 text-gray-700",
};

export interface SuggestionsMessageProps {
    msg: Extract<ChatMsg, { type: "suggestions" }>;
    selectedShortNames: Set<string>;
    toggleStructure: (shortName: string) => void;
    onSelectAll: () => void;
    phase: Phase;
    isLatest: boolean;
    onGenerate: () => void;
    isGenerating: boolean;
    onLoadMore: () => void;
    isLoadingMore: boolean;
    onFindElements: () => void;
}

export function SuggestionsMessage({
    msg,
    selectedShortNames,
    toggleStructure,
    onSelectAll,
    phase,
    isLatest,
    onGenerate,
    isGenerating,
    onLoadMore,
    isLoadingMore,
    onFindElements,
}: SuggestionsMessageProps) {
    const [showSelectionWarning, setShowSelectionWarning] = useState(false);

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
                        } ${!isLatest || isGenerating ? "opacity-60 cursor-default" : ""}`}
                    >
                        <input
                            type="checkbox"
                            checked={selectedShortNames.has(s.shortName)}
                            onChange={() => toggleStructure(s.shortName)}
                            className="mt-0.5 accent-purple-600"
                            disabled={!isLatest || isGenerating}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-semibold text-purple-700">
                                    {s.shortName}
                                </span>
                                <span
                                    className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CONFIDENCE_COLOR[s.confidence] ?? CONFIDENCE_COLOR.low}`}
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
                                <div className="mt-1.5">
                                    <OverflowTags
                                        items={s.sites}
                                        itemClassName="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200"
                                    />
                                </div>
                            )}
                            {s.dataTypes && s.dataTypes.length > 0 && (
                                <div className="mt-1">
                                    <OverflowTags
                                        items={s.dataTypes}
                                        itemClassName="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700"
                                    />
                                </div>
                            )}
                            {s.categories && s.categories.length > 0 && (
                                <div className="mt-1">
                                    <OverflowTags
                                        items={s.categories}
                                        itemClassName="px-1.5 py-0.5 text-xs rounded bg-violet-100 text-violet-700"
                                    />
                                </div>
                            )}
                            {s.recommendedElements &&
                                s.recommendedElements.length > 0 && (
                                    <details className="mt-2 group">
                                        <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600 list-none flex items-center gap-1">
                                            <span className="group-open:rotate-90 inline-block transition-transform">
                                                ▶
                                            </span>
                                            {s.recommendedElements.length}{" "}
                                            relevant element
                                            {s.recommendedElements.length !== 1
                                                ? "s"
                                                : ""}
                                        </summary>
                                        <ul className="mt-1.5 space-y-1.5 pl-1">
                                            {s.recommendedElements.map((el) => (
                                                <li
                                                    key={el.name}
                                                    className="text-xs"
                                                >
                                                    <span className="font-mono text-purple-700">
                                                        {el.name}
                                                    </span>
                                                    <span className="text-gray-400 ml-1">
                                                        — {el.reason}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                        </div>
                    </label>
                ))}
            </div>

            {isLatest && (phase === "selecting" || phase === "complete") && (
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2 flex-wrap">
                        {/* <button
                            onClick={onGenerate}
                            disabled={
                                isGenerating || selectedShortNames.size === 0
                            }
                            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Generate Mock Dataset
                            {selectedShortNames.size > 0
                                ? ` (${selectedShortNames.size} instrument${selectedShortNames.size > 1 ? "s" : ""})`
                                : ""}
                        </button> */}
                        <button
                            onClick={onLoadMore}
                            disabled={isLoadingMore || isGenerating}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoadingMore
                                ? "Loading…"
                                : "Load more suggestions"}
                        </button>
                        <button
                            onClick={() => {
                                if (selectedShortNames.size === 0) {
                                    setShowSelectionWarning(true);
                                } else {
                                    setShowSelectionWarning(false);
                                    onFindElements();
                                }
                            }}
                            disabled={isGenerating}
                            className="px-4 py-2 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Find Element Relations
                            {selectedShortNames.size > 0
                                ? ` (${selectedShortNames.size})`
                                : ""}
                        </button>
                    </div>
                    {showSelectionWarning && selectedShortNames.size === 0 && (
                        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <span>
                                Select at least one instrument to analyze.
                            </span>
                            <button
                                onClick={() => {
                                    onSelectAll();
                                    setShowSelectionWarning(false);
                                }}
                                className="underline font-medium hover:text-amber-900 whitespace-nowrap"
                            >
                                Select all
                            </button>
                        </div>
                    )}
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

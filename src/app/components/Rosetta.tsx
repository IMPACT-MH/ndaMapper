"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import {
    Search,
    Upload,
    X,
    ChevronDown,
    ChevronRight,
    Database,
    Loader2,
    Download,
} from "lucide-react";
import { parseCSV } from "@/utils/csvUtils";
import type { RosettaResult } from "@/app/api/v1/research/rosetta/route";

interface RosettaProps {
    databaseStructures: string[];
    loadingDatabaseStructures: boolean;
    databaseConnectionError: string | null;
    onElementSearch?: (elementName: string) => void;
    onStructureSearch?: (shortName: string) => void;
}

interface RowState {
    status: "idle" | "loading" | "done" | "error";
    rawResults?: RosettaResult[];
    searchTerms?: string[];
    error?: string;
}

function confidenceLabel(
    score: number,
    matchedBy: RosettaResult["matchedBy"],
): { label: string; color: string } {
    if (matchedBy === "name-guess")
        return { label: "Exact", color: "text-green-700 bg-green-50" };
    if (score >= 10)
        return { label: "High", color: "text-green-700 bg-green-50" };
    if (score >= 3)
        return { label: "Medium", color: "text-yellow-700 bg-yellow-50" };
    return { label: "Low", color: "text-gray-500 bg-gray-50" };
}

function ResultCard({
    result,
    databaseFilterEnabled,
    databaseStructures,
    onElementSearch,
    onStructureSearch,
    selectable,
    selected,
    onSelect,
}: {
    result: RosettaResult;
    databaseFilterEnabled: boolean;
    databaseStructures: string[];
    onElementSearch?: (name: string) => void;
    onStructureSearch?: (name: string) => void;
    selectable?: boolean;
    selected?: boolean;
    onSelect?: () => void;
}) {
    const conf = confidenceLabel(result.score, result.matchedBy);
    const dbStructures = databaseFilterEnabled
        ? result.dataStructures.filter((s) =>
              databaseStructures
                  .map((d) => d.toLowerCase())
                  .includes(s.toLowerCase()),
          )
        : result.dataStructures;
    const inDatabase = databaseFilterEnabled
        ? dbStructures.length > 0
        : result.dataStructures.some((s) =>
              databaseStructures
                  .map((d) => d.toLowerCase())
                  .includes(s.toLowerCase()),
          );
    const displayStructures = databaseFilterEnabled
        ? dbStructures
        : result.dataStructures;

    return (
        <div
            className={`border rounded-lg p-3 transition-colors ${
                selectable ? "cursor-pointer" : ""
            } ${
                selected
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
            }`}
            onClick={() => selectable && onSelect?.()}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {selectable && (
                        <span
                            className={`shrink-0 text-base leading-none ${selected ? "text-indigo-600" : "text-gray-300"}`}
                        >
                            {selected ? "●" : "○"}
                        </span>
                    )}
                    {onElementSearch ? (
                        <button
                            className="font-mono font-semibold text-blue-700 hover:underline text-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onElementSearch(result.name);
                            }}
                            title="Search for this element in Data Elements tab"
                        >
                            {result.name}
                        </button>
                    ) : (
                        <span className="font-mono font-semibold text-blue-700 text-sm">
                            {result.name}
                        </span>
                    )}
                    {inDatabase && (
                        <Database className="w-3.5 h-3.5 text-blue-500" />
                    )}
                </div>
                <span
                    className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${conf.color}`}
                >
                    {conf.label}
                </span>
            </div>

            {displayStructures.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {displayStructures.slice(0, 8).map((s) => {
                        const sInDb = databaseStructures
                            .map((d) => d.toLowerCase())
                            .includes(s.toLowerCase());
                        return onStructureSearch ? (
                            <button
                                key={s}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStructureSearch(s);
                                }}
                                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 hover:text-gray-800 font-mono"
                                title="Open this structure in Data Structures tab"
                            >
                                {s}
                                {sInDb && <Database className="w-3 h-3 text-blue-500" />}
                            </button>
                        ) : (
                            <span
                                key={s}
                                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono"
                            >
                                {s}
                                {sInDb && <Database className="w-3 h-3 text-blue-500" />}
                            </span>
                        );
                    })}
                    {displayStructures.length > 8 && (
                        <span className="text-xs text-gray-400 self-center">
                            +{displayStructures.length - 8} more
                        </span>
                    )}
                </div>
            )}

            {result.description && (
                <p className="text-sm text-gray-600 mt-1.5 italic leading-snug">
                    &ldquo;{result.description}&rdquo;
                </p>
            )}
            {!result.description && (
                <p className="text-xs text-gray-400 mt-1.5 italic">
                    No description available
                </p>
            )}
        </div>
    );
}

export default function Rosetta({
    databaseStructures,
    loadingDatabaseStructures,
    databaseConnectionError,
    onElementSearch,
    onStructureSearch,
}: RosettaProps) {
    const [databaseFilterEnabled, setDatabaseFilterEnabled] = useState(false);
    const [mode, setMode] = useState<"search" | "csv">("search");

    // Single search state
    const [query, setQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [singleResult, setSingleResult] = useState<{
        rawResults: RosettaResult[];
        searchTerms: string[];
    } | null>(null);
    const [singleError, setSingleError] = useState<string | null>(null);

    // CSV batch state
    const [csvRows, setCsvRows] = useState<string[]>([]);
    const [batchState, setBatchState] = useState<Record<number, RowState>>({});
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [batchProcessing, setBatchProcessing] = useState(false);
    const [selections, setSelections] = useState<Record<number, RosettaResult>>(
        {},
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filterResults = (results: RosettaResult[]): RosettaResult[] => {
        const dbSet = new Set(databaseStructures.map((s) => s.toLowerCase()));
        const isInDb = (r: RosettaResult) =>
            r.dataStructures.some((s) => dbSet.has(s.toLowerCase()));

        const filtered =
            databaseFilterEnabled && databaseStructures.length > 0
                ? results.filter(isInDb)
                : results;

        // Sort DB elements to the top within the result set
        return [
            ...filtered.filter(isInDb),
            ...filtered.filter((r) => !isInDb(r)),
        ];
    };

    const runSearch = async (description: string, exclude: string[] = []) => {
        const res = await fetch("/api/v1/research/rosetta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description, databaseStructures, exclude }),
        });
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        return res.json() as Promise<{
            results: RosettaResult[];
            searchTerms: string[];
            candidateNames: string[];
        }>;
    };

    const handleSearch = async () => {
        const trimmed = query.trim();
        if (!trimmed) return;
        setIsSearching(true);
        setSingleError(null);
        setSingleResult(null);
        try {
            const data = await runSearch(trimmed);
            setSingleResult({
                rawResults: data.results,
                searchTerms: data.searchTerms,
            });
        } catch (err) {
            setSingleError(
                err instanceof Error ? err.message : "Search failed",
            );
        } finally {
            setIsSearching(false);
        }
    };

    const handleFileUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const rows = parseCSV(text)
                .map((row) => (row[0] ?? "").trim())
                .filter(Boolean);
            // Skip header row if it looks like a header (e.g., "description", "Description")
            const startIdx =
                rows.length > 0 && /^description$/i.test(rows[0]) ? 1 : 0;
            setCsvRows(rows.slice(startIdx, 100)); // cap at 100 rows
            setBatchState({});
            setExpandedRows(new Set());
        };
        reader.readAsText(file);
    };

    const downloadFile = (filename: string, content: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportCSV = () => {
        const header = [
            "input_description",
            "element_name",
            "data_structures",
            "nda_description",
            "confidence",
        ];
        const rows = csvRows.map((row, i) => {
            const sel = selections[i];
            if (!sel) return [row, "", "", "", ""];
            return [
                row,
                sel.name,
                sel.dataStructures.join("|"),
                sel.description,
                confidenceLabel(sel.score, sel.matchedBy).label,
            ];
        });
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const csv = [header, ...rows]
            .map((r) => r.map(escape).join(","))
            .join("\n");
        downloadFile("rosetta-mapping.csv", csv, "text/csv");
    };

    const exportJSON = () => {
        const data = csvRows.map((row, i) => {
            const sel = selections[i];
            if (!sel)
                return {
                    inputDescription: row,
                    elementName: null,
                    dataStructures: [],
                    ndaDescription: null,
                    confidence: null,
                };
            return {
                inputDescription: row,
                elementName: sel.name,
                dataStructures: sel.dataStructures,
                ndaDescription: sel.description,
                notes: sel.notes ?? null,
                confidence: confidenceLabel(sel.score, sel.matchedBy).label,
            };
        });
        downloadFile(
            "rosetta-mapping.json",
            JSON.stringify(data, null, 2),
            "application/json",
        );
    };

    const handleBatchProcess = async () => {
        if (csvRows.length === 0 || batchProcessing) return;
        setBatchProcessing(true);
        setSelections({});
        // Initialize all rows to loading
        setBatchState(
            Object.fromEntries(
                csvRows.map((_, i) => [i, { status: "loading" as const }]),
            ),
        );
        // Process all rows in parallel
        await Promise.all(
            csvRows.map(async (row, i) => {
                try {
                    const data = await runSearch(row);
                    setBatchState((prev) => ({
                        ...prev,
                        [i]: {
                            status: "done",
                            rawResults: data.results,
                            searchTerms: data.searchTerms,
                        },
                    }));
                    // Auto-expand only the first row
                    if (i === 0 && data.results.length > 0) {
                        setExpandedRows((prev) => new Set([...prev, i]));
                    }
                } catch {
                    setBatchState((prev) => ({
                        ...prev,
                        [i]: { status: "error", error: "Search failed" },
                    }));
                }
            }),
        );
        setBatchProcessing(false);
    };

    const toggleRow = (i: number) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    };

    const loadMoreRow = async (i: number) => {
        const row = csvRows[i];
        if (!row) return;
        const existing = batchState[i]?.rawResults ?? [];
        const exclude = existing.map((r) => r.name);
        setBatchState((prev) => ({
            ...prev,
            [i]: { ...prev[i], status: "loading" },
        }));
        try {
            const data = await runSearch(row, exclude);
            setBatchState((prev) => ({
                ...prev,
                [i]: {
                    status: "done",
                    rawResults: [...existing, ...data.results],
                    searchTerms: prev[i]?.searchTerms ?? data.searchTerms,
                },
            }));
        } catch {
            setBatchState((prev) => ({
                ...prev,
                [i]: {
                    status: "done",
                    rawResults: existing,
                    searchTerms: prev[i]?.searchTerms,
                },
            }));
        }
    };

    const reSearchRow = async (i: number) => {
        const row = csvRows[i];
        if (!row) return;
        setBatchState((prev) => ({ ...prev, [i]: { status: "loading" } }));
        setExpandedRows((prev) => new Set([...prev, i]));
        try {
            const data = await runSearch(row);
            setBatchState((prev) => ({
                ...prev,
                [i]: {
                    status: "done",
                    rawResults: data.results,
                    searchTerms: data.searchTerms,
                },
            }));
        } catch {
            setBatchState((prev) => ({
                ...prev,
                [i]: { status: "error", error: "Search failed" },
            }));
        }
    };

    return (
        <div className="space-y-4">
            {/* Header + Database Filter Checkbox */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">
                    Rosetta Mapper
                    <span className="ml-1 px-2 py-0.5 text-sm font-semibold bg-indigo-100 text-indigo-600 rounded-full align-middle">
                        beta
                    </span>
                </h1>
                <p className="text-gray-600 -mb-7">
                    Describe a data element in plain language and Rosetta will
                    find the best matching NDA data elements using AI.
                </p>
                <br />
                {/* <div className="-mb-8">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={databaseFilterEnabled}
                            onChange={(e) =>
                                setDatabaseFilterEnabled(e.target.checked)
                            }
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 flex-shrink-0 self-center"
                        />
                        <div className="flex items-center space-x-2">
                            <div className="w-32 h-32 relative flex items-center justify-center self-center">
                                <Image
                                    src="/impact.png"
                                    alt="IMPACT Logo"
                                    width={128}
                                    height={128}
                                    className="object-contain"
                                />
                            </div>
                            {databaseConnectionError && (
                                <p className="text-sm text-red-600 ml-2">
                                    {databaseConnectionError}
                                </p>
                            )}
                            {loadingDatabaseStructures && (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                            )}
                        </div>
                        {databaseFilterEnabled &&
                            databaseStructures.length > 0 && (
                                <p className="text-xs text-gray-500 ml-2">
                                    Filtering by {databaseStructures.length}{" "}
                                    available structures
                                </p>
                            )}
                    </label>
                </div> */}
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2 border-b border-gray-200 pb-0">
                <button
                    onClick={() => setMode("search")}
                    className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                        mode === "search"
                            ? "border-indigo-500 text-indigo-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                >
                    <span className="flex items-center gap-1.5">
                        <Search className="w-4 h-4" />
                        Search
                    </span>
                </button>
                <button
                    onClick={() => setMode("csv")}
                    className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                        mode === "csv"
                            ? "border-indigo-500 text-indigo-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                >
                    <span className="flex items-center gap-1.5">
                        <Upload className="w-4 h-4" />
                        Batch via CSV
                    </span>
                </button>
            </div>

            {/* Search mode */}
            {mode === "search" && (
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder="e.g. self-reported depression severity over the past two weeks"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleSearch();
                            }}
                        />
                        <button
                            onClick={() => void handleSearch()}
                            disabled={isSearching || !query.trim()}
                            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSearching ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                            Find Elements
                        </button>
                    </div>

                    {isSearching && (
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Searching NDA data elements…
                        </div>
                    )}

                    {singleError && (
                        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                            {singleError}
                        </div>
                    )}

                    {singleResult && (
                        <div className="space-y-3">
                            {singleResult.searchTerms.length > 0 && (
                                <div className="text-xs text-gray-500 flex flex-wrap gap-1 items-center">
                                    <span className="font-medium text-gray-400">
                                        Terms used:
                                    </span>
                                    {singleResult.searchTerms.map((t) => (
                                        <span
                                            key={t}
                                            className="px-2 py-0.5 bg-gray-100 rounded font-mono"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {filterResults(singleResult.rawResults).length ===
                            0 ? (
                                <div className="text-center py-10 text-gray-500">
                                    <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                    <p className="font-medium">
                                        No matching elements found
                                    </p>
                                    <p className="text-sm mt-1">
                                        Try rephrasing with more clinical or
                                        technical terms.
                                    </p>
                                    {databaseFilterEnabled && (
                                        <p className="text-xs mt-2 text-gray-400">
                                            DB filter is on — results are
                                            limited to IMPACT-MH structures.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-500">
                                        {
                                            filterResults(
                                                singleResult.rawResults,
                                            ).length
                                        }{" "}
                                        match
                                        {filterResults(singleResult.rawResults)
                                            .length !== 1
                                            ? "es"
                                            : ""}
                                        {databaseFilterEnabled
                                            ? " (IMPACT-MH only)"
                                            : ""}
                                    </p>
                                    {filterResults(singleResult.rawResults).map(
                                        (r) => (
                                            <ResultCard
                                                key={r.name}
                                                result={r}
                                                databaseFilterEnabled={
                                                    databaseFilterEnabled
                                                }
                                                databaseStructures={
                                                    databaseStructures
                                                }
                                                onElementSearch={
                                                    onElementSearch
                                                }
                                                onStructureSearch={
                                                    onStructureSearch
                                                }
                                            />
                                        ),
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* CSV batch mode */}
            {mode === "csv" && (
                <div className="space-y-4">
                    {csvRows.length === 0 ? (
                        <div
                            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const file = e.dataTransfer.files[0];
                                if (file) handleFileUpload(file);
                            }}
                        >
                            <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                            <p className="font-medium text-gray-700">
                                Drop a CSV file here or click to upload
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                Single column, one variable description per row.
                                Max 100 rows.
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                }}
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-600">
                                    <span className="font-medium">
                                        {csvRows.length}
                                    </span>{" "}
                                    description{csvRows.length !== 1 ? "s" : ""}{" "}
                                    loaded
                                    {databaseFilterEnabled && (
                                        <span className="ml-1 text-gray-400">
                                            (results filtered to IMPACT-MH)
                                        </span>
                                    )}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setCsvRows([]);
                                            setBatchState({});
                                            setExpandedRows(new Set());
                                            setSelections({});
                                            if (fileInputRef.current)
                                                fileInputRef.current.value = "";
                                        }}
                                        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                    >
                                        <X className="w-4 h-4" />
                                        Clear
                                    </button>
                                    <button
                                        onClick={() =>
                                            void handleBatchProcess()
                                        }
                                        disabled={batchProcessing}
                                        className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {batchProcessing ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                Searching…
                                            </>
                                        ) : (
                                            <>
                                                <Search className="w-3.5 h-3.5" />
                                                Find Elements
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Accordion rows */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                                {(() => {
                                    const nodes: React.ReactNode[] = [];
                                    let lastStructure: string | undefined;
                                    csvRows.forEach((row, i) => {
                                        const sel = selections[i];
                                        const structure =
                                            sel?.dataStructures[0];
                                        // Insert a structure header when a new structure group starts
                                        if (
                                            sel &&
                                            structure !== lastStructure
                                        ) {
                                            const countInGroup = csvRows.filter(
                                                (_, j) =>
                                                    selections[j]
                                                        ?.dataStructures[0] ===
                                                    structure,
                                            ).length;
                                            nodes.push(
                                                <div
                                                    key={`struct-header-${structure ?? "other"}-${i}`}
                                                    className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-2"
                                                >
                                                    <span className="text-xs font-mono font-medium px-2 py-0.5 bg-white text-slate-600 rounded border border-slate-200">
                                                        {structure ?? "Other"}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {countInGroup} element
                                                        {countInGroup !== 1
                                                            ? "s"
                                                            : ""}
                                                    </span>
                                                </div>,
                                            );
                                        }
                                        lastStructure = sel
                                            ? structure
                                            : undefined;
                                        const state = batchState[i];
                                        const isExpanded = expandedRows.has(i);
                                        const allResults = filterResults(
                                            state?.rawResults ?? [],
                                        );
                                        const resultCount = allResults.length;
                                        const rowNode = (
                                            <div
                                                key={i}
                                                className="bg-white border-t border-gray-100 first:border-t-0"
                                            >
                                                <button
                                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                                                    onClick={() => {
                                                        if (
                                                            state?.status ===
                                                            "done"
                                                        )
                                                            toggleRow(i);
                                                    }}
                                                >
                                                    <span className="shrink-0 text-gray-400">
                                                        {state?.status ===
                                                        "loading" ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : state?.status ===
                                                          "done" ? (
                                                            isExpanded ? (
                                                                <ChevronDown className="w-4 h-4 text-gray-500" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4 text-gray-500" />
                                                            )
                                                        ) : state?.status ===
                                                          "error" ? (
                                                            <X className="w-4 h-4 text-red-400" />
                                                        ) : (
                                                            <ChevronRight className="w-4 h-4 text-gray-300" />
                                                        )}
                                                    </span>
                                                    <span className="flex-1 text-sm text-gray-800 truncate">
                                                        {row}
                                                    </span>
                                                    {state?.status ===
                                                        "done" && (
                                                        <span className="shrink-0 flex items-center gap-1.5">
                                                            {selections[i] && (
                                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                                                    ✓{" "}
                                                                    {
                                                                        selections[
                                                                            i
                                                                        ].name
                                                                    }
                                                                </span>
                                                            )}
                                                            <span
                                                                className={`text-xs font-medium px-2 py-0.5 rounded-full ${resultCount > 0 ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}
                                                            >
                                                                {resultCount}{" "}
                                                                match
                                                                {resultCount !==
                                                                1
                                                                    ? "es"
                                                                    : ""}
                                                            </span>
                                                            <button
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    void loadMoreRow(
                                                                        i,
                                                                    );
                                                                    setExpandedRows(
                                                                        (
                                                                            prev,
                                                                        ) =>
                                                                            new Set(
                                                                                [
                                                                                    ...prev,
                                                                                    i,
                                                                                ],
                                                                            ),
                                                                    );
                                                                }}
                                                                className="text-xs text-indigo-500 hover:text-indigo-700"
                                                            >
                                                                search more
                                                            </button>
                                                        </span>
                                                    )}
                                                    {state?.status ===
                                                        "error" && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void reSearchRow(
                                                                    i,
                                                                );
                                                            }}
                                                            className="shrink-0 text-xs text-red-500 hover:text-indigo-600 flex items-center gap-1"
                                                        >
                                                            <Search className="w-3 h-3" />
                                                            Retry
                                                        </button>
                                                    )}
                                                </button>

                                                {isExpanded &&
                                                    state?.status ===
                                                        "done" && (
                                                        <div className="px-4 pb-4 space-y-2 bg-gray-50 border-t border-gray-100">
                                                            {state.searchTerms &&
                                                                state
                                                                    .searchTerms
                                                                    .length >
                                                                    0 && (
                                                                    <div className="text-xs text-gray-400 flex flex-wrap gap-1 items-center pt-3">
                                                                        <span className="font-medium">
                                                                            Terms:
                                                                        </span>
                                                                        {state.searchTerms.map(
                                                                            (
                                                                                t,
                                                                            ) => (
                                                                                <span
                                                                                    key={
                                                                                        t
                                                                                    }
                                                                                    className="px-1.5 py-0.5 bg-white rounded border font-mono"
                                                                                >
                                                                                    {
                                                                                        t
                                                                                    }
                                                                                </span>
                                                                            ),
                                                                        )}
                                                                    </div>
                                                                )}
                                                            {allResults.length ===
                                                            0 ? (
                                                                <p className="text-sm text-gray-400 italic pt-3">
                                                                    No matching
                                                                    elements
                                                                    found. Try
                                                                    rephrasing.
                                                                </p>
                                                            ) : (
                                                                (() => {
                                                                    // Group by primary structure
                                                                    const groups: {
                                                                        structure: string;
                                                                        results: RosettaResult[];
                                                                    }[] = [];
                                                                    const groupIndex =
                                                                        new Map<
                                                                            string,
                                                                            number
                                                                        >();
                                                                    for (const r of allResults) {
                                                                        const key =
                                                                            r
                                                                                .dataStructures[0] ??
                                                                            "Other";
                                                                        if (
                                                                            !groupIndex.has(
                                                                                key,
                                                                            )
                                                                        ) {
                                                                            groupIndex.set(
                                                                                key,
                                                                                groups.length,
                                                                            );
                                                                            groups.push(
                                                                                {
                                                                                    structure:
                                                                                        key,
                                                                                    results:
                                                                                        [],
                                                                                },
                                                                            );
                                                                        }
                                                                        groups[
                                                                            groupIndex.get(
                                                                                key,
                                                                            )!
                                                                        ].results.push(
                                                                            r,
                                                                        );
                                                                    }
                                                                    return (
                                                                        <div className="space-y-3 pt-2">
                                                                            {groups.map(
                                                                                ({
                                                                                    structure,
                                                                                    results:
                                                                                        groupResults,
                                                                                }) => (
                                                                                    <div
                                                                                        key={
                                                                                            structure
                                                                                        }
                                                                                    >
                                                                                        <div className="flex items-center gap-2 mb-1.5">
                                                                                            <span className="text-xs font-mono font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                                                                                                {
                                                                                                    structure
                                                                                                }
                                                                                            </span>
                                                                                            <span className="text-xs text-gray-400">
                                                                                                {
                                                                                                    groupResults.length
                                                                                                }{" "}
                                                                                                element
                                                                                                {groupResults.length !==
                                                                                                1
                                                                                                    ? "s"
                                                                                                    : ""}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="space-y-2">
                                                                                            {groupResults.map(
                                                                                                (
                                                                                                    r,
                                                                                                ) => (
                                                                                                    <ResultCard
                                                                                                        key={
                                                                                                            r.name
                                                                                                        }
                                                                                                        result={
                                                                                                            r
                                                                                                        }
                                                                                                        databaseFilterEnabled={
                                                                                                            databaseFilterEnabled
                                                                                                        }
                                                                                                        databaseStructures={
                                                                                                            databaseStructures
                                                                                                        }
                                                                                                        onElementSearch={
                                                                                                            onElementSearch
                                                                                                        }
                                                                                                        onStructureSearch={
                                                                                                            onStructureSearch
                                                                                                        }
                                                                                                        selectable
                                                                                                        selected={
                                                                                                            selections[
                                                                                                                i
                                                                                                            ]
                                                                                                                ?.name ===
                                                                                                            r.name
                                                                                                        }
                                                                                                        onSelect={() => {
                                                                                                            setSelections(
                                                                                                                (
                                                                                                                    prev,
                                                                                                                ) => ({
                                                                                                                    ...prev,
                                                                                                                    [i]: r,
                                                                                                                }),
                                                                                                            );
                                                                                                            setExpandedRows(
                                                                                                                (
                                                                                                                    prev,
                                                                                                                ) => {
                                                                                                                    const next =
                                                                                                                        new Set(
                                                                                                                            prev,
                                                                                                                        );
                                                                                                                    next.delete(
                                                                                                                        i,
                                                                                                                    );
                                                                                                                    const nextIdx =
                                                                                                                        i +
                                                                                                                        1;
                                                                                                                    if (
                                                                                                                        nextIdx <
                                                                                                                            csvRows.length &&
                                                                                                                        batchState[
                                                                                                                            nextIdx
                                                                                                                        ]
                                                                                                                            ?.status ===
                                                                                                                            "done"
                                                                                                                    ) {
                                                                                                                        next.add(
                                                                                                                            nextIdx,
                                                                                                                        );
                                                                                                                    }
                                                                                                                    return next;
                                                                                                                },
                                                                                                            );
                                                                                                        }}
                                                                                                    />
                                                                                                ),
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()
                                                            )}
                                                        </div>
                                                    )}
                                            </div>
                                        );
                                        nodes.push(rowNode);
                                    });
                                    return nodes;
                                })()}
                            </div>

                            {/* Export toolbar */}
                            {!batchProcessing &&
                                Object.keys(batchState).length > 0 && (
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-2">
                                        <p className="text-sm text-gray-500">
                                            {Object.keys(selections).length} of{" "}
                                            {csvRows.length} row
                                            {csvRows.length !== 1
                                                ? "s"
                                                : ""}{" "}
                                            mapped
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                disabled={
                                                    Object.keys(selections)
                                                        .length === 0
                                                }
                                                onClick={exportCSV}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                Export CSV
                                            </button>
                                            <button
                                                disabled={
                                                    Object.keys(selections)
                                                        .length === 0
                                                }
                                                onClick={exportJSON}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                Export JSON
                                            </button>
                                        </div>
                                    </div>
                                )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

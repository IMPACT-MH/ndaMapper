"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
    Trash2,
} from "lucide-react";
import { parseCSV } from "@/utils/csvUtils";
import type { RosettaResult } from "@/app/api/v1/research/rosetta/route";
import type { OmapResult } from "@/app/api/v1/research/rosetta/omap/route";

interface RosettaProps {
    databaseStructures: string[];
    databaseElementNames: Set<string>;
    loadingDatabaseStructures: boolean;
    databaseConnectionError: string | null;
    onElementSearch?: (elementName: string) => void;
    onStructureSearch?: (shortName: string) => void;
}

interface RowState {
    status: "idle" | "loading" | "done" | "error";
    rawResults?: RosettaResult[];
    omapResults?: OmapResult[];
    searchTerms?: string[];
    error?: string;
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "rosetta-session-v1";
const SOURCE_MODE_KEY = "rosetta-source-mode";

interface StoredRosettaSession {
    mode: "search" | "csv";
    query: string;
    singleResult: { rawResults: RosettaResult[]; searchTerms: string[] } | null;
    singleOmapResult: { results: OmapResult[]; searchTerms: string[] } | null;
    csvRows: string[];
    batchState: Record<string, RowState>;
    selections: Record<string, RosettaResult>;
    omapSelections: Record<string, OmapResult>;
}

function loadRosettaSession(): StoredRosettaSession | null {
    try {
        if (typeof window === "undefined") return null;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as StoredRosettaSession;
    } catch {
        return null;
    }
}

function saveRosettaSession(session: StoredRosettaSession) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch { /* quota */ }
}

function confidenceLabel(
    score: number,
    matchedBy: RosettaResult["matchedBy"],
    descriptionOverlap: number,
): { label: string; color: string } {
    if (descriptionOverlap >= 0.85)
        return { label: "Exact", color: "text-indigo-600 bg-indigo-100" };
    if (score >= 10 || descriptionOverlap >= 0.4)
        return { label: "High", color: "text-green-700 bg-green-50" };
    if (score >= 3)
        return { label: "Medium", color: "text-yellow-700 bg-yellow-50" };
    return { label: "Low", color: "text-gray-500 bg-gray-50" };
}

function ResultCard({
    result,
    databaseFilterEnabled,
    databaseStructures,
    databaseElementNames,
    onElementSearch,
    onStructureSearch,
    selectable,
    selected,
    onSelect,
}: {
    result: RosettaResult;
    databaseFilterEnabled: boolean;
    databaseStructures: string[];
    databaseElementNames: Set<string>;
    onElementSearch?: (name: string) => void;
    onStructureSearch?: (name: string) => void;
    selectable?: boolean;
    selected?: boolean;
    onSelect?: () => void;
}) {
    const conf = confidenceLabel(result.score, result.matchedBy, result.descriptionOverlap);
    const dbStructures = databaseFilterEnabled
        ? result.dataStructures.filter((s) =>
              databaseStructures
                  .map((d) => d.toLowerCase())
                  .includes(s.toLowerCase()),
          )
        : result.dataStructures;
    const inDatabase = databaseElementNames.has(result.name.toLowerCase());
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
                    {(() => {
                        const dbSet = new Set(databaseStructures.map((d) => d.toLowerCase()));
                        const sortedStructures = [...displayStructures].sort((a, b) => {
                            const aInDb = dbSet.has(a.toLowerCase());
                            const bInDb = dbSet.has(b.toLowerCase());
                            if (aInDb !== bInDb) return aInDb ? -1 : 1;
                            return 0;
                        });
                        return sortedStructures;
                    })().map((s) => {
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

function OmapResultCard({
    result,
    selectable,
    selected,
    onSelect,
}: {
    result: OmapResult;
    selectable?: boolean;
    selected?: boolean;
    onSelect?: () => void;
}) {
    const conf = confidenceLabel(result.score, result.matchedBy, result.descriptionOverlap);
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
                        <span className={`shrink-0 text-base leading-none ${selected ? "text-indigo-600" : "text-gray-300"}`}>
                            {selected ? "●" : "○"}
                        </span>
                    )}
                    <span className="font-medium text-gray-900 text-sm">{result.conceptName}</span>
                    <span className="font-mono text-xs text-gray-400">{result.conceptId}</span>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${conf.color}`}>
                    {conf.label}
                </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">
                    {result.domainId}
                </span>
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">
                    {result.vocabularyId}
                </span>
                {result.standardConcept === "S" && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded border border-green-100">
                        Standard
                    </span>
                )}
                <span className="text-xs px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded font-mono">
                    {result.conceptCode}
                </span>
            </div>
            {result.conceptClassId && (
                <p className="text-xs text-gray-400 mt-1 italic">{result.conceptClassId}</p>
            )}
        </div>
    );
}

export default function Rosetta({
    databaseStructures,
    databaseElementNames,
    loadingDatabaseStructures,
    databaseConnectionError,
    onElementSearch,
    onStructureSearch,
}: RosettaProps) {
    const [sourceMode, setSourceMode] = useState<"nda" | "omap">("nda");
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
    const [singleOmapResult, setSingleOmapResult] = useState<{ results: OmapResult[]; searchTerms: string[] } | null>(null);

    // CSV batch state
    const [csvRows, setCsvRows] = useState<string[]>([]);
    const [batchState, setBatchState] = useState<Record<number, RowState>>({});
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [batchProcessing, setBatchProcessing] = useState(false);
    const [selections, setSelections] = useState<Record<number, RosettaResult>>({});
    const [omapSelections, setOmapSelections] = useState<Record<number, OmapResult>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [mounted, setMounted] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);

    const clearAll = useCallback(() => {
        setQuery("");
        setSingleResult(null);
        setSingleOmapResult(null);
        setSingleError(null);
        setCsvRows([]);
        setBatchState({});
        setExpandedRows(new Set());
        setSelections({});
        setOmapSelections({});
        setMode("search");
        setShowClearModal(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* SSR */ }
        // SOURCE_MODE_KEY is intentionally preserved
    }, []);

    // Restore from localStorage after first client render
    useEffect(() => {
        setMounted(true);
        try {
            const saved = localStorage.getItem(SOURCE_MODE_KEY);
            if (saved === "nda" || saved === "omap") setSourceMode(saved);
        } catch { /* SSR */ }
        const session = loadRosettaSession();
        if (!session) return;
        if (session.mode) setMode(session.mode);
        if (session.query) setQuery(session.query);
        if (session.singleResult) setSingleResult(session.singleResult);
        if (session.singleOmapResult) setSingleOmapResult(session.singleOmapResult);
        if (session.csvRows?.length > 0) setCsvRows(session.csvRows);
        if (session.batchState && Object.keys(session.batchState).length > 0) {
            setBatchState(session.batchState as Record<number, RowState>);
        }
        if (session.selections && Object.keys(session.selections).length > 0) {
            setSelections(session.selections as Record<number, RosettaResult>);
        }
        if (session.omapSelections && Object.keys(session.omapSelections).length > 0) {
            setOmapSelections(session.omapSelections as Record<number, OmapResult>);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist sourceMode separately so it survives session clears
    useEffect(() => {
        if (!mounted) return;
        try { localStorage.setItem(SOURCE_MODE_KEY, sourceMode); } catch { /* quota */ }
    }, [mounted, sourceMode]);

    // Persist session to localStorage on relevant state changes
    useEffect(() => {
        if (!mounted) return;
        const cleanBatchState = Object.fromEntries(
            Object.entries(batchState).filter(([, v]) => v.status === "done" || v.status === "error")
        );
        saveRosettaSession({
            mode, query, singleResult, singleOmapResult, csvRows,
            batchState: cleanBatchState,
            selections: selections as Record<string, RosettaResult>,
            omapSelections: omapSelections as Record<string, OmapResult>,
        });
    }, [mounted, mode, query, singleResult, singleOmapResult, csvRows, batchState, selections, omapSelections]);

    const filterNdaResults = (results: RosettaResult[]): RosettaResult[] => {
        const dbSet = new Set(databaseStructures.map((s) => s.toLowerCase()));
        const isInDb = (r: RosettaResult) =>
            r.dataStructures.some((s) => dbSet.has(s.toLowerCase()));

        const filtered =
            databaseFilterEnabled && databaseStructures.length > 0
                ? results.filter(isInDb)
                : results;

        return [
            ...filtered.filter(isInDb),
            ...filtered.filter((r) => !isInDb(r)),
        ];
    };

    const runNdaSearch = async (description: string, exclude: string[] = []) => {
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

    const runOmapSearchClient = async (description: string, excludeIds: number[] = []) => {
        const res = await fetch("/api/v1/research/rosetta/omap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description, exclude: excludeIds }),
        });
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        return res.json() as Promise<{
            results: OmapResult[];
            searchTerms: string[];
        }>;
    };

    const handleSearch = async () => {
        const trimmed = query.trim();
        if (!trimmed) return;
        setIsSearching(true);
        setSingleError(null);
        if (sourceMode === "omap") setSingleOmapResult(null);
        else setSingleResult(null);
        try {
            if (sourceMode === "omap") {
                const data = await runOmapSearchClient(trimmed);
                setSingleOmapResult({ results: data.results, searchTerms: data.searchTerms });
            } else {
                const data = await runNdaSearch(trimmed);
                setSingleResult({ rawResults: data.results, searchTerms: data.searchTerms });
            }
        } catch (err) {
            setSingleError(err instanceof Error ? err.message : "Search failed");
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
        if (sourceMode === "omap") {
            const header = ["input_description", "concept_id", "concept_name", "domain", "vocabulary", "concept_code", "standard_concept", "confidence"];
            const rows = csvRows.map((row, i) => {
                const sel = omapSelections[i];
                if (!sel) return [row, "", "", "", "", "", "", ""];
                return [
                    row,
                    String(sel.conceptId),
                    sel.conceptName,
                    sel.domainId,
                    sel.vocabularyId,
                    sel.conceptCode,
                    sel.standardConcept ?? "",
                    confidenceLabel(sel.score, sel.matchedBy, sel.descriptionOverlap).label,
                ];
            });
            const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
            downloadFile("rosetta-omap-mapping.csv", [header, ...rows].map((r) => r.map(escape).join(",")).join("\n"), "text/csv");
            return;
        }
        const header = ["input_description", "element_name", "data_structures", "nda_description", "confidence"];
        const rows = csvRows.map((row, i) => {
            const sel = selections[i];
            if (!sel) return [row, "", "", "", ""];
            return [
                row,
                sel.name,
                sel.dataStructures.join("|"),
                sel.description,
                confidenceLabel(sel.score, sel.matchedBy, sel.descriptionOverlap).label,
            ];
        });
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
        downloadFile("rosetta-mapping.csv", [header, ...rows].map((r) => r.map(escape).join(",")).join("\n"), "text/csv");
    };

    const exportJSON = () => {
        if (sourceMode === "omap") {
            const data = csvRows.map((row, i) => {
                const sel = omapSelections[i];
                if (!sel) return { inputDescription: row, conceptId: null, conceptName: null, domain: null, vocabulary: null, confidence: null };
                return {
                    inputDescription: row,
                    conceptId: sel.conceptId,
                    conceptName: sel.conceptName,
                    conceptCode: sel.conceptCode,
                    domain: sel.domainId,
                    vocabulary: sel.vocabularyId,
                    standardConcept: sel.standardConcept,
                    confidence: confidenceLabel(sel.score, sel.matchedBy, sel.descriptionOverlap).label,
                };
            });
            downloadFile("rosetta-omap-mapping.json", JSON.stringify(data, null, 2), "application/json");
            return;
        }
        const data = csvRows.map((row, i) => {
            const sel = selections[i];
            if (!sel)
                return { inputDescription: row, elementName: null, dataStructures: [], ndaDescription: null, confidence: null };
            return {
                inputDescription: row,
                elementName: sel.name,
                dataStructures: sel.dataStructures,
                ndaDescription: sel.description,
                notes: sel.notes ?? null,
                confidence: confidenceLabel(sel.score, sel.matchedBy, sel.descriptionOverlap).label,
            };
        });
        downloadFile("rosetta-mapping.json", JSON.stringify(data, null, 2), "application/json");
    };

    const handleBatchProcess = async () => {
        if (csvRows.length === 0 || batchProcessing) return;
        setBatchProcessing(true);
        if (sourceMode === "omap") setOmapSelections({});
        else setSelections({});
        setBatchState(
            Object.fromEntries(
                csvRows.map((_, i) => [i, { status: "loading" as const }]),
            ),
        );
        await Promise.all(
            csvRows.map(async (row, i) => {
                try {
                    if (sourceMode === "omap") {
                        const data = await runOmapSearchClient(row);
                        setBatchState((prev) => ({
                            ...prev,
                            [i]: { status: "done", omapResults: data.results, searchTerms: data.searchTerms },
                        }));
                        if (i === 0 && data.results.length > 0)
                            setExpandedRows((prev) => new Set([...prev, i]));
                    } else {
                        const data = await runNdaSearch(row);
                        setBatchState((prev) => ({
                            ...prev,
                            [i]: { status: "done", rawResults: data.results, searchTerms: data.searchTerms },
                        }));
                        if (i === 0 && data.results.length > 0)
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
        setBatchState((prev) => ({ ...prev, [i]: { ...prev[i], status: "loading" } }));
        if (sourceMode === "omap") {
            const existing = batchState[i]?.omapResults ?? [];
            const excludeIds = existing.map((r) => r.conceptId);
            try {
                const data = await runOmapSearchClient(row, excludeIds);
                setBatchState((prev) => ({
                    ...prev,
                    [i]: { status: "done", omapResults: [...existing, ...data.results], searchTerms: prev[i]?.searchTerms ?? data.searchTerms },
                }));
            } catch {
                setBatchState((prev) => ({
                    ...prev,
                    [i]: { status: "done", omapResults: existing, searchTerms: prev[i]?.searchTerms },
                }));
            }
            return;
        }
        const existing = batchState[i]?.rawResults ?? [];
        const exclude = existing.map((r) => r.name);
        try {
            const data = await runNdaSearch(row, exclude);
            setBatchState((prev) => ({
                ...prev,
                [i]: { status: "done", rawResults: [...existing, ...data.results], searchTerms: prev[i]?.searchTerms ?? data.searchTerms },
            }));
        } catch {
            setBatchState((prev) => ({
                ...prev,
                [i]: { status: "done", rawResults: existing, searchTerms: prev[i]?.searchTerms },
            }));
        }
    };

    const reSearchRow = async (i: number) => {
        const row = csvRows[i];
        if (!row) return;
        setBatchState((prev) => ({ ...prev, [i]: { status: "loading" } }));
        setExpandedRows((prev) => new Set([...prev, i]));
        try {
            if (sourceMode === "omap") {
                const data = await runOmapSearchClient(row);
                setBatchState((prev) => ({
                    ...prev,
                    [i]: { status: "done", omapResults: data.results, searchTerms: data.searchTerms },
                }));
            } else {
                const data = await runNdaSearch(row);
                setBatchState((prev) => ({
                    ...prev,
                    [i]: { status: "done", rawResults: data.results, searchTerms: data.searchTerms },
                }));
            }
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
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h1 className="text-3xl font-bold">
                        Rosetta Mapper
                        <span className="ml-1 px-2 py-0.5 text-sm font-semibold bg-indigo-100 text-indigo-600 rounded-full align-middle">
                            beta
                        </span>
                    </h1>
                    {(query || singleResult || csvRows.length > 0) && (
                        <button
                            onClick={() => setShowClearModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                            title="Clear all results"
                        >
                            <Trash2 className="w-4 h-4" />
                            Clear
                        </button>
                    )}
                </div>
                <p className="text-gray-600">
                    Describe a data element in plain language and Rosetta will
                    find the best matching{" "}
                    {sourceMode === "omap" ? "OMOP vocabulary concepts" : "NDA data elements"}{" "}
                    using AI.
                </p>
                {/* NDA / OMOP source toggle */}
                <div className="flex items-start gap-3 mt-3">
                    <button
                        onClick={() => setSourceMode("nda")}
                        className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors ${
                            sourceMode === "nda"
                                ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                    >
                        <span className="text-xs font-semibold">NDA</span>
                        <span className="text-xs text-gray-400 mt-0.5 font-normal">NIMH Data Archive elements</span>
                    </button>
                    <button
                        onClick={() => setSourceMode("omap")}
                        className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors ${
                            sourceMode === "omap"
                                ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                    >
                        <span className="text-xs font-semibold">OMOP</span>
                        <span className="text-xs text-gray-400 mt-0.5 font-normal">OHDSI standard vocabulary (SNOMED, LOINC)</span>
                    </button>
                </div>
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
                            {sourceMode === "omap" ? "Searching OMOP vocabulary…" : "Searching NDA data elements…"}
                        </div>
                    )}

                    {singleError && (
                        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                            {singleError}
                        </div>
                    )}

                    {/* NDA single results */}
                    {sourceMode === "nda" && singleResult && (
                        <div className="space-y-3">
                            {singleResult.searchTerms.length > 0 && (
                                <div className="text-xs text-gray-500 flex flex-wrap gap-1 items-center">
                                    <span className="font-medium text-gray-400">Terms used:</span>
                                    {singleResult.searchTerms.map((t) => (
                                        <span key={t} className="px-2 py-0.5 bg-gray-100 rounded font-mono">{t}</span>
                                    ))}
                                </div>
                            )}
                            {filterNdaResults(singleResult.rawResults).length === 0 ? (
                                <div className="text-center py-10 text-gray-500">
                                    <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                    <p className="font-medium">No matching elements found</p>
                                    <p className="text-sm mt-1">Try rephrasing with more clinical or technical terms.</p>
                                    {databaseFilterEnabled && (
                                        <p className="text-xs mt-2 text-gray-400">DB filter is on — results are limited to IMPACT-MH structures.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-500">
                                        {filterNdaResults(singleResult.rawResults).length} match{filterNdaResults(singleResult.rawResults).length !== 1 ? "es" : ""}
                                        {databaseFilterEnabled ? " (IMPACT-MH only)" : ""}
                                    </p>
                                    {filterNdaResults(singleResult.rawResults).map((r) => (
                                        <ResultCard
                                            key={r.name}
                                            result={r}
                                            databaseFilterEnabled={databaseFilterEnabled}
                                            databaseStructures={databaseStructures}
                                            databaseElementNames={databaseElementNames}
                                            onElementSearch={onElementSearch}
                                            onStructureSearch={onStructureSearch}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* OMOP single results */}
                    {sourceMode === "omap" && singleOmapResult && (
                        <div className="space-y-3">
                            {singleOmapResult.searchTerms.length > 0 && (
                                <div className="text-xs text-gray-500 flex flex-wrap gap-1 items-center">
                                    <span className="font-medium text-gray-400">Terms used:</span>
                                    {singleOmapResult.searchTerms.map((t) => (
                                        <span key={t} className="px-2 py-0.5 bg-gray-100 rounded font-mono">{t}</span>
                                    ))}
                                </div>
                            )}
                            {singleOmapResult.results.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">
                                    <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                    <p className="font-medium">No matching OMOP concepts found</p>
                                    <p className="text-sm mt-1">Try a shorter clinical term, e.g. &ldquo;depressive disorder&rdquo; or &ldquo;PHQ-9&rdquo;.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-500">
                                        {singleOmapResult.results.length} match{singleOmapResult.results.length !== 1 ? "es" : ""}
                                    </p>
                                    {singleOmapResult.results.map((r) => (
                                        <OmapResultCard key={r.conceptId} result={r} />
                                    ))}
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
                                    let lastGroupKey: string | undefined;
                                    csvRows.forEach((row, i) => {
                                        const sel = sourceMode === "nda" ? selections[i] : undefined;
                                        const omapSel = sourceMode === "omap" ? omapSelections[i] : undefined;
                                        const groupKey = sourceMode === "nda"
                                            ? sel?.dataStructures[0]
                                            : omapSel?.domainId;
                                        const groupLabel = sourceMode === "nda"
                                            ? (groupKey ?? "Other")
                                            : (groupKey ?? "Other");
                                        const hasSelection = sourceMode === "nda" ? !!sel : !!omapSel;
                                        // Insert a group header when a new group starts
                                        if (hasSelection && groupKey !== lastGroupKey) {
                                            const countInGroup = csvRows.filter((_, j) =>
                                                sourceMode === "nda"
                                                    ? selections[j]?.dataStructures[0] === groupKey
                                                    : omapSelections[j]?.domainId === groupKey
                                            ).length;
                                            nodes.push(
                                                <div
                                                    key={`group-header-${groupLabel}-${i}`}
                                                    className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-2"
                                                >
                                                    <span className="text-xs font-mono font-medium px-2 py-0.5 bg-white text-slate-600 rounded border border-slate-200">
                                                        {groupLabel}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {countInGroup} element{countInGroup !== 1 ? "s" : ""}
                                                    </span>
                                                </div>,
                                            );
                                        }
                                        lastGroupKey = hasSelection ? groupKey : undefined;
                                        const state = batchState[i];
                                        const isExpanded = expandedRows.has(i);
                                        const allResults = sourceMode === "nda"
                                            ? filterNdaResults(state?.rawResults ?? [])
                                            : (state?.omapResults ?? []);
                                        const resultCount = allResults.length;
                                        const selDisplayName = sourceMode === "nda"
                                            ? sel?.name
                                            : omapSel?.conceptName;
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
                                                            {selDisplayName && (
                                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                                                    ✓{" "}
                                                                    {selDisplayName}
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
                                                            {allResults.length === 0 ? (
                                                                <p className="text-sm text-gray-400 italic pt-3">
                                                                    No matching{" "}
                                                                    {sourceMode === "omap" ? "OMOP concepts" : "NDA elements"}{" "}
                                                                    found. Try a shorter clinical term.
                                                                </p>
                                                            ) : sourceMode === "omap" ? (
                                                                // OMAP: flat list of OmapResultCards
                                                                <div className="space-y-2 pt-2">
                                                                    {(allResults as OmapResult[]).map((r) => (
                                                                        <OmapResultCard
                                                                            key={r.conceptId}
                                                                            result={r}
                                                                            selectable
                                                                            selected={omapSelections[i]?.conceptId === r.conceptId}
                                                                            onSelect={() => {
                                                                                setOmapSelections((prev) => ({ ...prev, [i]: r }));
                                                                                setExpandedRows((prev) => {
                                                                                    const next = new Set(prev);
                                                                                    next.delete(i);
                                                                                    const nextIdx = i + 1;
                                                                                    if (nextIdx < csvRows.length && batchState[nextIdx]?.status === "done")
                                                                                        next.add(nextIdx);
                                                                                    return next;
                                                                                });
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                // NDA: group by primary data structure
                                                                (() => {
                                                                    const ndaResults = allResults as RosettaResult[];
                                                                    const groups: { structure: string; results: RosettaResult[] }[] = [];
                                                                    const groupIndex = new Map<string, number>();
                                                                    for (const r of ndaResults) {
                                                                        const key = r.dataStructures[0] ?? "Other";
                                                                        if (!groupIndex.has(key)) {
                                                                            groupIndex.set(key, groups.length);
                                                                            groups.push({ structure: key, results: [] });
                                                                        }
                                                                        groups[groupIndex.get(key)!].results.push(r);
                                                                    }
                                                                    return (
                                                                        <div className="space-y-3 pt-2">
                                                                            {groups.map(({ structure, results: groupResults }) => (
                                                                                <div key={structure}>
                                                                                    <div className="flex items-center gap-2 mb-1.5">
                                                                                        <span className="text-xs font-mono font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                                                                                            {structure}
                                                                                        </span>
                                                                                        <span className="text-xs text-gray-400">
                                                                                            {groupResults.length} element{groupResults.length !== 1 ? "s" : ""}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="space-y-2">
                                                                                        {groupResults.map((r) => (
                                                                                            <ResultCard
                                                                                                key={r.name}
                                                                                                result={r}
                                                                                                databaseFilterEnabled={databaseFilterEnabled}
                                                                                                databaseStructures={databaseStructures}
                                                                                                databaseElementNames={databaseElementNames}
                                                                                                onElementSearch={onElementSearch}
                                                                                                onStructureSearch={onStructureSearch}
                                                                                                selectable
                                                                                                selected={selections[i]?.name === r.name}
                                                                                                onSelect={() => {
                                                                                                    setSelections((prev) => ({ ...prev, [i]: r }));
                                                                                                    setExpandedRows((prev) => {
                                                                                                        const next = new Set(prev);
                                                                                                        next.delete(i);
                                                                                                        const nextIdx = i + 1;
                                                                                                        if (nextIdx < csvRows.length && batchState[nextIdx]?.status === "done")
                                                                                                            next.add(nextIdx);
                                                                                                        return next;
                                                                                                    });
                                                                                                }}
                                                                                            />
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
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
                                            {Object.keys(sourceMode === "omap" ? omapSelections : selections).length} of{" "}
                                            {csvRows.length} row{csvRows.length !== 1 ? "s" : ""} mapped
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                disabled={Object.keys(sourceMode === "omap" ? omapSelections : selections).length === 0}
                                                onClick={exportCSV}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                Export CSV
                                            </button>
                                            <button
                                                disabled={Object.keys(sourceMode === "omap" ? omapSelections : selections).length === 0}
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

            {/* Clear confirmation modal */}
            {showClearModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowClearModal(false)}>
                    <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-semibold text-gray-900 mb-2">Clear Rosetta Mapper?</h3>
                        <p className="text-sm text-gray-500 mb-5">All searches, results, and selections will be removed. This cannot be undone.</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowClearModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={clearAll}
                                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

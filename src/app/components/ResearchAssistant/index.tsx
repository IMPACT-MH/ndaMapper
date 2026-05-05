"use client";

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import type {
    DataElement,
    DataStructure,
    SuggestResponse,
    MockDataset,
    HarmonizeResponse,
    ElementHarmonizeResponse,
    ConversationMessage,
} from "@/types";
import type { Phase, ChatMsg, MergedDataset, Props } from "./types";
import { phaseReducer } from "./types";
import {
    Phase2Banner,
    EmptyState,
    UserBubble,
    LoadingBubble,
    ErrorBubble,
    AnalysisMessage,
} from "./MessageComponents";
import { SuggestionsMessage } from "./SuggestionsMessage";
import { MockReadyMessage } from "./MockReadyMessage";
import { HarmonizeMessage } from "./HarmonizeMessage";
import { ElementHarmonizeMessage } from "./ElementHarmonizeMessage";
import { Trash2 } from "lucide-react";

function detectIntent(q: string): "structures" | "elements" {
    const lower = q.toLowerCase();
    const elementSignals = [
        "element",
        "variable",
        "item",
        "field",
        "harmoniz",
        "across site",
        "which site",
        "shared element",
        "crosswalk",
        "overlap",
        "element relation",
    ];
    return elementSignals.some((s) => lower.includes(s))
        ? "elements"
        : "structures";
}

const DEFAULT_OVERLAP_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ra-session-v1";

interface StoredSession {
    chatMessages: ChatMsg[];
    overlapThreshold: number;
}

function loadSession(): StoredSession | null {
    try {
        if (typeof window === "undefined") return null;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as StoredSession;
    } catch {
        return null;
    }
}

function saveSession(messages: ChatMsg[], threshold: number) {
    try {
        const toStore: StoredSession = {
            chatMessages: messages.slice(-20),
            overlapThreshold: threshold,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
        // Quota exceeded or SSR — silently ignore
    }
}

export default function ResearchAssistant({
    databaseStructures,
    databaseSites: _databaseSites,
    databaseFilterEnabled,
    databaseConnectionError,
    isVisible: _isVisible,
    onElementSearch,
    onStructureSearch,
}: Props) {
    void _databaseSites;
    void _isVisible;

    // Chat state — initialised from localStorage if available
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [inputText, setInputText] = useState("");
    const [rScript, setRScript] = useState("");
    const [rScriptOpen, setRScriptOpen] = useState(false);
    const [scriptLang, setScriptLang] = useState<"r" | "python" | null>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Tracks whether we've completed the first client-side render
    const [mounted, setMounted] = useState(false);

    // Phase & error
    const [phase, dispatch] = useReducer(phaseReducer, "idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Selection / data state
    const [selectedShortNames, setSelectedShortNames] = useState<Set<string>>(
        new Set(),
    );
    const selectedShortNamesRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        selectedShortNamesRef.current = selectedShortNames;
    }, [selectedShortNames]);
    const [selectedStructures, setSelectedStructures] = useState<
        DataStructure[]
    >([]);
    const [mockDatasets, setMockDatasets] = useState<MockDataset[]>([]);
    const [mergedDatasets, setMergedDatasets] = useState<MergedDataset[]>([]);

    const [analysisText, setAnalysisText] = useState("");
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const [conversationHistory, setConversationHistory] = useState<
        ConversationMessage[]
    >([]);
    const [suggestHistory, setSuggestHistory] = useState<
        Array<{ role: "user" | "assistant"; content: string }>
    >([]);

    const [showClearModal, setShowClearModal] = useState(false);
    const [overlapThreshold, setOverlapThreshold] = useState<number>(
        DEFAULT_OVERLAP_THRESHOLD,
    );
    const [elementProgress, setElementProgress] = useState<string>("");

    const clearChat = useCallback(() => {
        setChatMessages([]);
        setInputText("");
        setRScript("");
        setRScriptOpen(false);
        setScriptLang(null);
        dispatch({ type: "RESET" });
        setErrorMsg(null);
        setSelectedShortNames(new Set());
        setSelectedStructures([]);
        setMockDatasets([]);
        setMergedDatasets([]);
        setAnalysisText("");
        setIsLoadingMore(false);
        setConversationHistory([]);
        setSuggestHistory([]);
        setShowClearModal(false);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* SSR */
        }
    }, []);

    // Restore all localStorage-backed state on first client mount.
    // Runs once after hydration — keeps server and client initial renders identical.
    useEffect(() => {
        setMounted(true);
        const session = loadSession();
        if (!session) return;
        const msgs = session.chatMessages;
        if (msgs.length > 0) setChatMessages(msgs);
        if (session.overlapThreshold !== DEFAULT_OVERLAP_THRESHOLD)
            setOverlapThreshold(session.overlapThreshold);
        const mockMsg = [...msgs]
            .reverse()
            .find((m) => m.type === "mock-ready");
        if (mockMsg?.type === "mock-ready") {
            setMockDatasets(mockMsg.datasets);
            setSelectedStructures(mockMsg.datasets.map((d) => d.structure));
            dispatch({ type: "GENERATE_DONE" });
        } else if (msgs.some((m) => m.type === "suggestions")) {
            dispatch({ type: "SUGGEST_DONE" });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist to localStorage whenever chat or threshold changes
    useEffect(() => {
        if (chatMessages.length > 0)
            saveSession(chatMessages, overlapThreshold);
    }, [chatMessages, overlapThreshold]);

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
                        return m;
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
        dispatch({ type: "SUGGEST_START" });
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
            if (!res.ok)
                throw new Error((await res.text()) || `HTTP ${res.status}`);
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
            dispatch({ type: "SUGGEST_DONE" });

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
            dispatch({ type: "ERROR" });
        }
    };

    // ---------------------------------------------------------------------------
    // toggleStructure
    // ---------------------------------------------------------------------------

    const toggleStructure = (shortName: string) => {
        setSelectedShortNames((prev) => {
            const next = new Set(prev);
            next.has(shortName) ? next.delete(shortName) : next.add(shortName);
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
            if (!res.ok)
                throw new Error((await res.text()) || `HTTP ${res.status}`);
            const data = (await res.json()) as SuggestResponse;

            setChatMessages((prev) =>
                prev.map((m) =>
                    m.id === latestSugMsg.id && m.type === "suggestions"
                        ? {
                              ...m,
                              suggestions: [
                                  ...m.suggestions,
                                  ...data.suggestions,
                              ],
                          }
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
        dispatch({ type: "GENERATE_START" });
        setErrorMsg(null);

        try {
            const res = await fetch("/api/v1/research/mock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    selectedStructures: [...selectedShortNames],
                }),
            });
            if (!res.ok)
                throw new Error((await res.text()) || `HTTP ${res.status}`);
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
            dispatch({ type: "GENERATE_DONE" });
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            dispatch({ type: "ERROR" });
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

            dispatch({ type: "ANALYZE_START" });
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
                if (!res.ok)
                    throw new Error((await res.text()) || `HTTP ${res.status}`);

                const reader = res.body?.getReader();
                if (!reader) throw new Error("No response stream");

                const decoder = new TextDecoder();
                let fullText = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    fullText += decoder.decode(value, { stream: true });
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

                let parsedCharts: import("@/types").ChartConfig[] = [];
                if (chartsMatch) {
                    try {
                        parsedCharts = JSON.parse(
                            chartsMatch[1],
                        ) as import("@/types").ChartConfig[];
                    } catch {
                        /* malformed */
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
                dispatch({ type: "ANALYZE_DONE" });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setErrorMsg(msg);
                dispatch({ type: "ERROR" });
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
        dispatch({ type: "HARMONIZE_START" });
        setErrorMsg(null);

        const lastQ =
            [...chatMessages].reverse().find((m) => m.type === "user")?.text ??
            "";
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
                body: JSON.stringify({
                    question: lastQ,
                    structures: structuresWithElements,
                }),
            });
            if (!res.ok)
                throw new Error((await res.text()) || `HTTP ${res.status}`);
            const data = (await res.json()) as HarmonizeResponse;

            setChatMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    type: "harmonize" as const,
                    result: { ...data },
                },
            ]);
            dispatch({ type: "HARMONIZE_DONE" });
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            dispatch({ type: "ERROR" });
        }
    }, [mockDatasets, chatMessages]);

    // ---------------------------------------------------------------------------
    // handleElementSearch
    // ---------------------------------------------------------------------------

    const handleElementSearch = useCallback(
        async (question: string) => {
            dispatch({ type: "ELEMENT_HARMONIZE_START" });
            setErrorMsg(null);
            setChatMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    type: "user" as const,
                    text: question,
                },
            ]);

            const latestSuggestions = [...chatMessages]
                .reverse()
                .find((m) => m.type === "suggestions");

            let suggestions =
                latestSuggestions?.type === "suggestions"
                    ? latestSuggestions.suggestions
                          .filter((s) =>
                              selectedShortNamesRef.current.has(s.shortName),
                          )
                          .map((s) => ({
                              shortName: s.shortName,
                              title: s.title,
                              sites: s.sites ?? [],
                          }))
                    : [];

            if (suggestions.length === 0) {
                try {
                    const suggestRes = await fetch("/api/v1/research/suggest", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            question,
                            databaseStructures,
                            conversationHistory: [],
                        }),
                    });
                    if (suggestRes.ok) {
                        const suggestData =
                            (await suggestRes.json()) as SuggestResponse;
                        setChatMessages((prev) => [
                            ...prev,
                            {
                                id: crypto.randomUUID(),
                                type: "suggestions" as const,
                                suggestions: suggestData.suggestions,
                                reasoning: suggestData.reasoning,
                                networkGraph: suggestData.networkGraph,
                            },
                        ]);
                        dispatch({ type: "SUGGEST_DONE" });
                        setSuggestHistory([
                            { role: "user" as const, content: question },
                            {
                                role: "assistant" as const,
                                content: JSON.stringify({
                                    suggestions: suggestData.suggestions,
                                    reasoning: suggestData.reasoning,
                                }),
                            },
                        ]);
                        return;
                    }
                } catch {
                    /* proceed with empty */
                }
            }

            try {
                const res = await fetch("/api/v1/research/element-harmonize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        question,
                        suggestions,
                        overlapThreshold,
                    }),
                });
                if (!res.ok)
                    throw new Error((await res.text()) || `HTTP ${res.status}`);

                const reader = res.body!.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop()!;
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        const event = JSON.parse(line) as {
                            type: string;
                            [k: string]: unknown;
                        };
                        if (event.type === "status")
                            setElementProgress(event.text as string);
                        if (event.type === "progress") {
                            setElementProgress(
                                `Fetching ${String(event.shortName)} (${String(event.current)}/${String(event.total)})…`,
                            );
                        }
                        if (event.type === "error")
                            throw new Error(event.message as string);
                        if (event.type === "result") {
                            const data =
                                event as unknown as ElementHarmonizeResponse;
                            setChatMessages((prev) => [
                                ...prev,
                                {
                                    id: crypto.randomUUID(),
                                    type: "element-harmonize" as const,
                                    result: data,
                                    overlapThreshold,
                                },
                            ]);
                            dispatch({ type: "ELEMENT_HARMONIZE_DONE" });
                            setSuggestHistory((prev) => [
                                ...prev,
                                { role: "user" as const, content: question },
                                {
                                    role: "assistant" as const,
                                    content: `Performed element harmonization across ${data.structures?.length ?? 0} instruments, finding ${data.constructs?.length ?? 0} shared construct groups.`,
                                },
                            ]);
                        }
                    }
                }
                setElementProgress("");
            } catch (err) {
                setElementProgress("");
                setErrorMsg(err instanceof Error ? err.message : String(err));
                dispatch({ type: "ERROR" });
            }
        },
        [chatMessages, databaseStructures, overlapThreshold],
    );

    // ---------------------------------------------------------------------------
    // Unified submit
    // ---------------------------------------------------------------------------

    const handleSubmit = () => {
        const text = inputText.trim();
        if (!text || isLoading) return;
        setInputText("");
        if (detectIntent(text) === "elements") {
            void handleElementSearch(text);
        } else {
            const hasHistory = phase === "selecting" || phase === "complete";
            void handleSuggest(text, hasHistory);
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

    const isLoading =
        phase === "suggesting" ||
        phase === "generating" ||
        phase === "analyzing" ||
        phase === "harmonizing" ||
        phase === "element-harmonizing";

    const latestSuggestionsIdx = chatMessages.reduce(
        (acc, m, i) => (m.type === "suggestions" ? i : acc),
        -1,
    );
    const showScriptPanel = phase === "complete" || phase === "analyzing";

    const lastSuggestQuery = (() => {
        if (latestSuggestionsIdx <= 0) return null;
        const prior = chatMessages[latestSuggestionsIdx - 1];
        return prior?.type === "user" ? prior.text : null;
    })();
    const isRefineMode = mounted && latestSuggestionsIdx >= 0 && !isLoading;

    const inputPlaceholder = isLoading
        ? "Please wait…"
        : isRefineMode
          ? "Narrow down, or start a completely new search…"
          : "Ask about instruments, elements, or harmonization…";
    const contextLine = isLoading
        ? ""
        : isRefineMode && lastSuggestQuery
          ? `↩ Continuing from "${lastSuggestQuery.length > 40 ? lastSuggestQuery.slice(0, 40) + "…" : lastSuggestQuery}"`
          : `Searching ${databaseFilterEnabled ? databaseStructures.length + " IMPACT-MH" : "all NDA"} instruments · Enter to submit`;

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <div
            className="flex flex-col"
            style={{ height: phase === "idle" ? "auto" : "calc(100vh - 8rem)" }}
        >
            {/* Clear chat modal */}
            {showClearModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
                        <h2 className="text-base font-semibold text-gray-900 mb-2">
                            Clear conversation?
                        </h2>
                        <p className="text-sm text-gray-500 mb-5">
                            This will remove all messages, selections, and
                            generated datasets. It cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowClearModal(false)}
                                className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={clearChat}
                                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Static header */}
            <div className="shrink-0 pb-3 space-y-2">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-0.5">
                            Research Assistant{" "}
                            <span className="ml-1 px-2 py-0.5 text-sm font-semibold bg-purple-100 text-purple-600 rounded-full align-middle">
                                beta
                            </span>
                        </h1>
                        <p className="text-gray-500 text-sm">
                            Explore IMPACT-MH instruments, generate mock
                            datasets, and plan your analysis — powered by
                            Claude.
                        </p>
                    </div>
                    {chatMessages.length > 0 && (
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
                    if (msg.type === "user")
                        return <UserBubble key={msg.id} text={msg.text} />;
                    if (msg.type === "hint")
                        return (
                            <div
                                key={msg.id}
                                className="text-xs text-gray-400 italic pl-1"
                            >
                                {msg.text}
                            </div>
                        );
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
                                isGenerating={
                                    phase === "generating" ||
                                    phase === "element-harmonizing" ||
                                    phase === "suggesting"
                                }
                                onLoadMore={() => void handleLoadMore()}
                                isLoadingMore={isLoadingMore}
                                onSelectAll={() =>
                                    setSelectedShortNames(
                                        new Set(
                                            msg.suggestions.map(
                                                (s) => s.shortName,
                                            ),
                                        ),
                                    )
                                }
                                onFindElements={() =>
                                    void handleElementSearch(
                                        "Which elements can I harmonize across these instruments?",
                                    )
                                }
                                overlapThreshold={overlapThreshold}
                                onOverlapThresholdChange={setOverlapThreshold}
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
                                    phase === "complete" &&
                                    mockDatasets.length > 1
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
                        return (
                            <HarmonizeMessage
                                key={msg.id}
                                result={msg.result}
                            />
                        );
                    }
                    if (msg.type === "element-harmonize") {
                        return (
                            <ElementHarmonizeMessage
                                key={msg.id}
                                result={msg.result}
                                overlapThreshold={msg.overlapThreshold}
                                onElementSearch={onElementSearch}
                                onStructureSearch={onStructureSearch}
                            />
                        );
                    }
                    return null;
                })}

                {isLoading && (
                    <LoadingBubble
                        phase={phase}
                        suggestHistory={suggestHistory}
                        elementProgress={elementProgress}
                    />
                )}
                {phase === "error" && errorMsg && (
                    <ErrorBubble
                        msg={errorMsg}
                        onDismiss={() => dispatch({ type: "DISMISS_ERROR" })}
                    />
                )}
                <div ref={chatEndRef} />
            </div>

            {/* R/Python script panel */}
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
                    {/* <button
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
                    </button> */}
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
                    {isRefineMode && (
                        <button
                            onClick={() => setShowClearModal(true)}
                            className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 transition-colors"
                            title="Start a fresh search"
                        >
                            New search
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

"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
    MockDataset,
    HarmonizationResult,
    ElementHarmonizeResponse,
    ConstructGroup,
} from "@/types";
import type { ChatMsg, MergedDataset } from "./types";
import { buildElementRelationGraph } from "@/lib/elementRelationGraph";
import { NetworkDiagram } from "./NetworkDiagram";
import { ElementRelationDiagram } from "./ElementRelationDiagram";
import { ChartPanel } from "./ChartPanel";

const CONFIDENCE_BADGE: Record<string, string> = {
    high: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-gray-100 text-gray-700",
};

const CONF_COLORS = {
    direct: { dot: "bg-green-500", text: "text-green-700" },
    partial: { dot: "bg-amber-400", text: "text-amber-700" },
    proxy: { dot: "bg-orange-400", text: "text-orange-700" },
} as const;

const CHART_WIDTH = 640;

function groupByDomain(constructs: ConstructGroup[]) {
    const domainOrder: string[] = [];
    const byDomain = new Map<string, ConstructGroup[]>();
    for (const c of constructs) {
        if (!byDomain.has(c.domain)) {
            byDomain.set(c.domain, []);
            domainOrder.push(c.domain);
        }
        byDomain.get(c.domain)!.push(c);
    }
    return { domainOrder, byDomain };
}

function ConfidenceLegend() {
    return (
        <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
            {(["direct", "partial", "proxy"] as const).map((c) => (
                <span key={c} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${CONF_COLORS[c].dot}`} />
                    {c}
                </span>
            ))}
        </div>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="text-base font-semibold text-gray-900 mt-8 mb-2 border-b border-gray-200 pb-1">
            {children}
        </h2>
    );
}

function QuestionBlock({ text }: { text: string }) {
    return (
        <div className="border-l-4 border-purple-400 pl-3 py-1 mt-6 mb-2 print-avoid-break">
            <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                Question
            </p>
            <p className="text-sm text-gray-800">{text}</p>
        </div>
    );
}

function SuggestionsSection({
    msg,
}: {
    msg: Extract<ChatMsg, { type: "suggestions" }>;
}) {
    return (
        <div>
            <SectionTitle>Suggested Instruments</SectionTitle>
            {msg.reasoning && (
                <p className="text-sm text-gray-600 italic mb-3">{msg.reasoning}</p>
            )}
            <div className="space-y-3">
                {msg.suggestions.map((s) => (
                    <div
                        key={s.shortName}
                        className="border border-gray-200 rounded-lg p-3 print-avoid-break"
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-purple-700">
                                {s.shortName}
                            </span>
                            <span
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CONFIDENCE_BADGE[s.confidence] ?? CONFIDENCE_BADGE.low}`}
                            >
                                {s.confidence}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{s.title}</p>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                            {s.relevanceReason}
                        </p>
                        {s.sites && s.sites.length > 0 && (
                            <p className="text-xs text-emerald-700 mt-1">
                                <span className="font-medium">Sites:</span>{" "}
                                {s.sites.join(", ")}
                            </p>
                        )}
                        {s.dataTypes && s.dataTypes.length > 0 && (
                            <p className="text-xs text-blue-700 mt-0.5">
                                <span className="font-medium">Data types:</span>{" "}
                                {s.dataTypes.join(", ")}
                            </p>
                        )}
                        {s.categories && s.categories.length > 0 && (
                            <p className="text-xs text-violet-700 mt-0.5">
                                <span className="font-medium">Categories:</span>{" "}
                                {s.categories.join(", ")}
                            </p>
                        )}
                        {s.recommendedElements && s.recommendedElements.length > 0 && (
                            <div className="mt-2">
                                <p className="text-xs text-gray-400 font-medium">
                                    {s.recommendedElements.length} relevant element
                                    {s.recommendedElements.length !== 1 ? "s" : ""}
                                </p>
                                <ul className="mt-1 space-y-1 pl-1">
                                    {s.recommendedElements.map((el) => (
                                        <li key={el.name} className="text-xs">
                                            <span className="font-mono text-purple-700">
                                                {el.name}
                                            </span>
                                            <span className="text-gray-500 ml-1">
                                                — {el.reason}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {msg.networkGraph.nodes.length > 0 && (
                <div className="mt-4 print-avoid-break">
                    <p className="text-xs text-gray-500 mb-2 font-medium">
                        Instrument Relationship Network
                    </p>
                    <NetworkDiagram graph={msg.networkGraph} printMode />
                </div>
            )}
        </div>
    );
}

function DatasetSummarySection({
    mockDatasets,
    mergedDatasets,
}: {
    mockDatasets: MockDataset[];
    mergedDatasets: MergedDataset[];
}) {
    if (mockDatasets.length === 0 && mergedDatasets.length === 0) return null;
    return (
        <div>
            <SectionTitle>Mock Datasets</SectionTitle>
            {mockDatasets.length > 0 && (
                <table className="min-w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200">Instrument</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200">Title</th>
                            <th className="px-3 py-2 text-right text-gray-600 font-medium border-b border-gray-200">Rows</th>
                            <th className="px-3 py-2 text-right text-gray-600 font-medium border-b border-gray-200">Fields</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200">Sample fields</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockDatasets.map((ds) => {
                            const fieldNames = ds.schema.map((el) => el.name);
                            const sample =
                                fieldNames.slice(0, 8).join(", ") +
                                (fieldNames.length > 8 ? ", …" : "");
                            return (
                                <tr key={ds.structure.shortName} className="border-b border-gray-100">
                                    <td className="px-3 py-2 font-mono text-purple-700 font-semibold">
                                        {ds.structure.shortName}
                                    </td>
                                    <td className="px-3 py-2 text-gray-700">{ds.structure.title}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{ds.rows.length}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{ds.schema.length}</td>
                                    <td className="px-3 py-2 font-mono text-gray-500">{sample}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            {mergedDatasets.length > 0 && (
                <table className="min-w-full text-xs border-collapse mt-3">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200">Merged dataset</th>
                            <th className="px-3 py-2 text-right text-gray-600 font-medium border-b border-gray-200">Rows</th>
                            <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200">Merged from</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mergedDatasets.map((m) => (
                            <tr key={m.id} className="border-b border-gray-100">
                                <td className="px-3 py-2 font-mono text-indigo-700 font-semibold">{m.name}</td>
                                <td className="px-3 py-2 text-right text-gray-700">{m.rows.length}</td>
                                <td className="px-3 py-2 text-gray-700">{m.sourceNames.join(", ")}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p className="text-xs text-gray-400 mt-2 italic">
                All rows are synthetic mock data generated for research planning.
            </p>
        </div>
    );
}

function AnalysisSection({
    msg,
    datasets,
}: {
    msg: Extract<ChatMsg, { type: "analysis" }>;
    datasets: MockDataset[];
}) {
    return (
        <div>
            <SectionTitle>Analysis</SectionTitle>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {msg.text}
            </p>
            {msg.charts.length > 0 && (
                <div className="mt-4">
                    <ChartPanel
                        charts={msg.charts}
                        datasets={datasets}
                        fixedWidth={CHART_WIDTH}
                    />
                </div>
            )}
        </div>
    );
}

function CrosswalkSection({ result }: { result: HarmonizationResult }) {
    const instruments = Array.from(
        new Set(result.constructs.flatMap((c) => c.mappings.map((m) => m.shortName))),
    );
    const { domainOrder, byDomain } = groupByDomain(result.constructs);

    return (
        <div>
            <SectionTitle>
                Element Harmonization — {result.constructs.length} construct
                {result.constructs.length !== 1 ? "s" : ""} across {instruments.length}{" "}
                instrument{instruments.length !== 1 ? "s" : ""}
            </SectionTitle>
            <p className="text-xs text-teal-700 mb-2">{result.summary}</p>
            <table className="min-w-full text-xs border-collapse">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200">Construct</th>
                        {instruments.map((inst) => (
                            <th key={inst} className="px-3 py-2 text-left font-mono text-purple-700 font-semibold border-b border-gray-200">
                                {inst}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {domainOrder.map((domain) => (
                        <React.Fragment key={domain}>
                            <tr className="bg-gray-100">
                                <td
                                    colSpan={instruments.length + 1}
                                    className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200"
                                >
                                    {domain}
                                </td>
                            </tr>
                            {(byDomain.get(domain) ?? []).map((construct) => (
                                <tr key={construct.constructName} className="border-b border-gray-100">
                                    <td className="px-3 py-2 text-gray-800 font-medium">
                                        {construct.constructName}
                                    </td>
                                    {instruments.map((inst) => {
                                        const m = construct.mappings.find((x) => x.shortName === inst);
                                        if (!m)
                                            return (
                                                <td key={inst} className="px-3 py-2 text-gray-300 text-center">—</td>
                                            );
                                        const conf = CONF_COLORS[m.mappingConfidence] ?? CONF_COLORS.proxy;
                                        return (
                                            <td key={inst} className="px-3 py-2">
                                                <span className="flex items-center gap-1.5">
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf.dot}`} />
                                                    <code className={`font-mono ${conf.text}`}>{m.elementName}</code>
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
            <ConfidenceLegend />
            {result.reasoning && (
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                    <span className="font-medium text-gray-500">Reasoning:</span>{" "}
                    {result.reasoning}
                </p>
            )}
        </div>
    );
}

function MatrixSection({ result }: { result: ElementHarmonizeResponse }) {
    const structs = result.structures;
    const { domainOrder, byDomain } = groupByDomain(result.constructs);
    const relGraph = buildElementRelationGraph(structs, result.constructs);

    return (
        <div>
            <SectionTitle>
                Element Relations — {result.constructs.length} construct
                {result.constructs.length !== 1 ? "s" : ""} across {structs.length}{" "}
                instrument{structs.length !== 1 ? "s" : ""}
            </SectionTitle>
            {result.constructs.length === 0 ? (
                <p className="text-sm text-gray-500">
                    {result.summary || "No shared elements found."}
                </p>
            ) : (
                <>
                    <p className="text-xs text-indigo-700 mb-2">{result.summary}</p>
                    {relGraph.nodes.length >= 2 && (
                        <div className="mb-3 print-avoid-break">
                            <ElementRelationDiagram graph={relGraph} printMode />
                        </div>
                    )}
                    <table className="min-w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200">Construct</th>
                                {structs.map((s) => (
                                    <th key={s.shortName} className="px-3 py-2 text-left border-b border-gray-200">
                                        <div className="font-mono text-indigo-700 font-semibold">
                                            {s.shortName}
                                        </div>
                                        {s.sites.length > 0 && (
                                            <div className="text-emerald-700 font-normal mt-0.5">
                                                {s.sites.join(", ")}
                                            </div>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {domainOrder.map((domain) => (
                                <React.Fragment key={domain}>
                                    <tr className="bg-gray-100">
                                        <td
                                            colSpan={structs.length + 1}
                                            className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200"
                                        >
                                            {domain}
                                        </td>
                                    </tr>
                                    {(byDomain.get(domain) ?? []).map((construct) => (
                                        <tr key={construct.constructName} className="border-b border-gray-100">
                                            <td className="px-3 py-2 text-gray-800 font-medium">
                                                {construct.constructName}
                                            </td>
                                            {structs.map((s) => {
                                                const m = construct.mappings.find(
                                                    (x) => x.shortName === s.shortName,
                                                );
                                                if (!m)
                                                    return (
                                                        <td key={s.shortName} className="px-3 py-2 text-gray-300 text-center">—</td>
                                                    );
                                                const conf = CONF_COLORS[m.mappingConfidence] ?? CONF_COLORS.proxy;
                                                return (
                                                    <td key={s.shortName} className="px-3 py-2">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf.dot}`} />
                                                            <code className={`font-mono ${conf.text}`}>
                                                                {m.elementName}
                                                            </code>
                                                            {m.matchSource === "semantic" && (
                                                                <span className="text-xs text-violet-500 font-medium">≈</span>
                                                            )}
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                    <div className="flex items-center gap-4 flex-wrap">
                        <ConfidenceLegend />
                        <span className="flex items-center gap-1 text-xs text-violet-500 mt-2">
                            <span className="font-mono">≈</span> semantic
                        </span>
                    </div>
                    {result.reasoning && (
                        <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                            <span className="font-medium text-gray-500">Reasoning:</span>{" "}
                            {result.reasoning}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

export interface PrintableReportProps {
    messages: ChatMsg[];
    mockDatasets: MockDataset[];
    mergedDatasets: MergedDataset[];
    databaseFilterEnabled: boolean;
    structureCount: number;
    onDone: () => void;
}

export function PrintableReport({
    messages,
    mockDatasets,
    mergedDatasets,
    databaseFilterEnabled,
    structureCount,
    onDone,
}: PrintableReportProps) {
    const [portalMounted, setPortalMounted] = useState(false);

    useEffect(() => {
        setPortalMounted(true);
    }, []);

    useEffect(() => {
        if (!portalMounted) return;
        document.body.classList.add("ra-printing");
        const prevTitle = document.title;
        document.title = `research-report-${new Date().toISOString().slice(0, 10)}`;
        window.addEventListener("afterprint", onDone);
        // Let the instant spring sims and fixed-width charts commit first
        const t = setTimeout(() => window.print(), 300);
        return () => {
            clearTimeout(t);
            window.removeEventListener("afterprint", onDone);
            document.body.classList.remove("ra-printing");
            document.title = prevTitle;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [portalMounted]);

    if (!portalMounted) return null;

    const firstQuestion = messages.find((m) => m.type === "user");
    const lastMockIdx = messages.reduce(
        (acc, m, i) => (m.type === "mock-ready" ? i : acc),
        -1,
    );

    const generatedAt = new Date().toLocaleString();

    return createPortal(
        <div
            id="ra-print-root"
            className="bg-white text-gray-900 text-sm max-w-[720px] mx-auto"
        >
            <div className="print-avoid-break border-b-2 border-purple-600 pb-3">
                <h1 className="text-2xl font-bold text-gray-900">
                    Research Assistant Report
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                    Generated {generatedAt} ·{" "}
                    {databaseFilterEnabled
                        ? `Searching within ${structureCount} IMPACT-MH instruments`
                        : "Searching all NDA instruments"}
                </p>
                {firstQuestion && firstQuestion.type === "user" && (
                    <p className="text-base text-gray-800 mt-3 font-medium">
                        “{firstQuestion.text}”
                    </p>
                )}
            </div>

            {messages.map((msg, i) => {
                switch (msg.type) {
                    case "user":
                        if (msg === firstQuestion) return null;
                        return <QuestionBlock key={msg.id} text={msg.text} />;
                    case "suggestions":
                        return <SuggestionsSection key={msg.id} msg={msg} />;
                    case "mock-ready":
                        if (i !== lastMockIdx) return null;
                        return (
                            <DatasetSummarySection
                                key={msg.id}
                                mockDatasets={mockDatasets}
                                mergedDatasets={mergedDatasets}
                            />
                        );
                    case "analysis":
                        return (
                            <AnalysisSection
                                key={msg.id}
                                msg={msg}
                                datasets={mockDatasets}
                            />
                        );
                    case "harmonize":
                        return <CrosswalkSection key={msg.id} result={msg.result} />;
                    case "element-harmonize":
                        return <MatrixSection key={msg.id} result={msg.result} />;
                    default:
                        return null;
                }
            })}

            <p className="text-xs text-gray-400 mt-8 pt-2 border-t border-gray-200">
                All data shown is synthetic mock data generated for research
                planning. Report generated by the IMPACT-MH Research Assistant on{" "}
                {generatedAt}.
            </p>
        </div>,
        document.body,
    );
}

"use client";

import React from "react";
import type { HarmonizationResult, ConstructGroup } from "@/types";

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

export function HarmonizeMessage({ result }: { result: HarmonizationResult }) {
    const instruments = Array.from(
        new Set(result.constructs.flatMap((c) => c.mappings.map((m) => m.shortName)))
    );

    const domainOrder: string[] = [];
    const byDomain = new Map<string, ConstructGroup[]>();
    for (const c of result.constructs) {
        if (!byDomain.has(c.domain)) { byDomain.set(c.domain, []); domainOrder.push(c.domain); }
        byDomain.get(c.domain)!.push(c);
    }

    const handleCrosswalkCSV = () => {
        const headers = ["construct", "domain", ...instruments];
        const rows = result.constructs.map((c) => {
            const cells = [c.constructName, c.domain, ...instruments.map((inst) => {
                const m = c.mappings.find((x) => x.shortName === inst);
                return m ? `${m.elementName} (${m.mappingConfidence})` : "";
            })];
            return cells.map((v) => v.includes(",") ? `"${v}"` : v).join(",");
        });
        downloadCSV("crosswalk.csv", [headers.join(","), ...rows].join("\n"));
    };

    const handleHarmonizedCSV = () => {
        const ds = result.harmonizedDataset;
        if (!ds.rows.length) return;
        const hdrs = Object.keys(ds.rows[0]);
        const lines = [
            hdrs.join(","),
            ...ds.rows.map((row) => hdrs.map((h) => {
                const v = String(row[h] ?? "");
                return v.includes(",") ? `"${v}"` : v;
            }).join(",")),
        ];
        downloadCSV("harmonized_dataset.csv", lines.join("\n"));
    };

    return (
        <div className="border border-teal-200 rounded-lg overflow-hidden">
            <div className="bg-teal-50 px-4 py-3 flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-teal-900">
                        Element Harmonization — {result.constructs.length} construct{result.constructs.length !== 1 ? "s" : ""} across {instruments.length} instrument{instruments.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-teal-700 mt-0.5">{result.summary}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button onClick={handleCrosswalkCSV}
                        className="px-2.5 py-1 text-xs border border-teal-300 text-teal-700 rounded hover:bg-teal-100 transition-colors whitespace-nowrap">
                        Crosswalk CSV
                    </button>
                    <button onClick={handleHarmonizedCSV}
                        className="px-2.5 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors whitespace-nowrap">
                        Harmonized Dataset
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left text-gray-600 font-medium border-b border-gray-200 w-44">Construct</th>
                            {instruments.map((inst) => (
                                <th key={inst} className="px-3 py-2 text-left font-mono text-purple-700 font-semibold border-b border-gray-200 whitespace-nowrap">
                                    {inst}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {domainOrder.map((domain) => (
                            <React.Fragment key={domain}>
                                <tr className="bg-gray-100">
                                    <td colSpan={instruments.length + 1}
                                        className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                                        {domain}
                                    </td>
                                </tr>
                                {(byDomain.get(domain) ?? []).map((construct) => (
                                    <tr key={construct.constructName} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{construct.constructName}</td>
                                        {instruments.map((inst) => {
                                            const m = construct.mappings.find((x) => x.shortName === inst);
                                            if (!m) return <td key={inst} className="px-3 py-2 text-gray-300 text-center">—</td>;
                                            const conf = CONF_COLORS[m.mappingConfidence] ?? CONF_COLORS.proxy;
                                            return (
                                                <td key={inst} className="px-3 py-2" title={m.description ?? ""}>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf.dot}`} title={m.mappingConfidence} />
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
            </div>

            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    {(["direct", "partial", "proxy"] as const).map((c) => (
                        <span key={c} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${CONF_COLORS[c].dot}`} />
                            {c}
                        </span>
                    ))}
                </div>
                <details className="text-xs text-gray-500 ml-auto">
                    <summary className="cursor-pointer hover:text-gray-700 list-none">▶ Reasoning</summary>
                    <p className="mt-1 text-gray-600 leading-relaxed max-w-2xl">{result.reasoning}</p>
                </details>
            </div>
        </div>
    );
}

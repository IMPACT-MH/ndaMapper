"use client";

import type { MockDataset } from "@/types";

export function ExportControls({ datasets }: { datasets: MockDataset[] }) {
    const handleCSVDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        for (const ds of datasets) {
            if (ds.rows.length === 0) continue;
            const headers = Object.keys(ds.rows[0]);
            const csvLines = [
                headers.join(","),
                ...ds.rows.map((row) =>
                    headers.map((h) => {
                        const val = String(row[h] ?? "");
                        return val.includes(",") ? `"${val}"` : val;
                    }).join(","),
                ),
            ];
            const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `mock_${ds.structure.shortName}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    if (datasets.length === 0) return null;

    return (
        <button
            onClick={handleCSVDownload}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors whitespace-nowrap"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV{datasets.length > 1 ? ` (${datasets.length})` : ""}
        </button>
    );
}

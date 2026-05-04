"use client";

import type { MockDataset } from "@/types";
import type { Phase, ChatMsg } from "./types";
import { ChartPanel } from "./ChartPanel";

export function Phase2Banner() {
    return (
        <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-3">
                <div className="text-purple-500 mt-0.5 shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <div>
                    <p className="font-medium text-purple-800 text-xs mb-0.5">Connect your database to analyze real data</p>
                    <p className="text-purple-700 text-xs">
                        Currently showing synthetic mock data. Set{" "}
                        <code className="bg-purple-100 px-1 rounded font-mono">MONGODB_URI</code>{" "}
                        and{" "}
                        <code className="bg-purple-100 px-1 rounded font-mono">MONGODB_DB_NAME</code>{" "}
                        in{" "}
                        <code className="bg-purple-100 px-1 rounded font-mono">.env.local</code>{" "}
                        to use real data.
                    </p>
                </div>
            </div>
        </div>
    );
}

export function EmptyState({ databaseFilterEnabled, count }: { databaseFilterEnabled: boolean; count: number }) {
    return (
        <div className="flex flex-col items-center justify-center text-center pt-6 pb-2">
            <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm font-medium text-gray-500 mb-1">Start a research conversation</p>
            <p className="text-xs text-gray-400">
                {databaseFilterEnabled
                    ? `Searching within ${count} IMPACT-MH instruments`
                    : "Searching all NDA instruments"}
            </p>
        </div>
    );
}

export function UserBubble({ text }: { text: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[75%] bg-purple-100 text-purple-900 rounded-2xl rounded-br-none px-4 py-2 text-sm">
                {text}
            </div>
        </div>
    );
}

export function LoadingBubble({
    phase,
    suggestHistory,
    elementProgress,
}: {
    phase: Phase;
    suggestHistory: Array<{ role: "user" | "assistant"; content: string }>;
    elementProgress?: string;
}) {
    return (
        <div className="flex items-center gap-2 text-sm text-purple-600 py-2 pl-1">
            <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {phase === "suggesting" && (suggestHistory.length > 0 ? "Refining suggestions…" : "Analyzing your research question…")}
            {phase === "generating" && "Generating synthetic dataset…"}
            {phase === "harmonizing" && "Building element crosswalk…"}
            {phase === "element-harmonizing" && (elementProgress || "Searching NDA elements for harmonization…")}
        </div>
    );
}

export function ErrorBubble({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
    return (
        <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-800">
            <strong>Error:</strong> {msg}
            <button onClick={onDismiss} className="ml-3 underline text-red-600">Dismiss</button>
        </div>
    );
}

export function AnalysisMessage({
    msg,
    phase,
    datasets,
}: {
    msg: Extract<ChatMsg, { type: "analysis" }>;
    phase: Phase;
    datasets: MockDataset[];
}) {
    return (
        <div className="space-y-3">
            <div className="max-w-[90%] bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 text-sm text-gray-700">
                {msg.text === "" ? (
                    phase === "analyzing" ? (
                        <span className="text-gray-400 italic">Streaming…</span>
                    ) : (
                        <span className="text-red-400 text-xs italic">Analysis failed — see error below</span>
                    )
                ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                )}
            </div>
            {msg.charts.length > 0 && (
                <div className="max-w-[90%]">
                    <ChartPanel charts={msg.charts} datasets={datasets} />
                </div>
            )}
        </div>
    );
}

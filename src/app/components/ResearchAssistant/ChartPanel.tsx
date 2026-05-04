"use client";

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter,
} from "recharts";
import type { ChartConfig, MockDataset } from "@/types";

export function ChartPanel({ charts, datasets }: { charts: ChartConfig[]; datasets: MockDataset[] }) {
    if (charts.length === 0) return null;

    const allRows = datasets.flatMap((ds) => ds.rows);

    return (
        <div className="space-y-6">
            {charts.map((chart) => {
                const data = allRows.slice(0, 200);

                if (chart.type === "bar" && chart.xField && chart.yField) {
                    const counts = new Map<string, number>();
                    for (const row of data) {
                        const key = String(row[chart.xField] ?? "unknown");
                        counts.set(key, (counts.get(key) ?? 0) + 1);
                    }
                    const barData = [...counts.entries()]
                        .slice(0, 15)
                        .map(([name, value]) => ({ name, value }));
                    return (
                        <div key={chart.id}>
                            <h4 className="font-medium text-gray-700 text-sm mb-2">{chart.title}</h4>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={barData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#7c3aed" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    );
                }

                if (chart.type === "histogram" && chart.xField) {
                    const values = data
                        .map((r) => Number(r[chart.xField!]))
                        .filter((v) => !isNaN(v) && v > -700);
                    if (values.length === 0) return null;
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const buckets = 12;
                    const bucketSize = (max - min) / buckets || 1;
                    const hist = Array.from({ length: buckets }, (_, i) => ({
                        range: `${(min + i * bucketSize).toFixed(0)}`,
                        count: 0,
                    }));
                    for (const v of values) {
                        const idx = Math.min(Math.floor((v - min) / bucketSize), buckets - 1);
                        hist[idx].count++;
                    }
                    return (
                        <div key={chart.id}>
                            <h4 className="font-medium text-gray-700 text-sm mb-2">{chart.title}</h4>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={hist}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#0ea5e9" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    );
                }

                if (chart.type === "scatter" && chart.xField && chart.yField) {
                    const scatterData = data
                        .map((r) => ({ x: Number(r[chart.xField!]), y: Number(r[chart.yField!]) }))
                        .filter((p) => !isNaN(p.x) && !isNaN(p.y) && p.x > -700 && p.y > -700)
                        .slice(0, 100);
                    return (
                        <div key={chart.id}>
                            <h4 className="font-medium text-gray-700 text-sm mb-2">{chart.title}</h4>
                            <ResponsiveContainer width="100%" height={220}>
                                <ScatterChart>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="x" name={chart.xField} tick={{ fontSize: 11 }} />
                                    <YAxis dataKey="y" name={chart.yField} tick={{ fontSize: 11 }} />
                                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                                    <Scatter data={scatterData} fill="#7c3aed" />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
}

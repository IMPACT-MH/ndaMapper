"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from "recharts";
import type {
  StructureSuggestion,
  ConversationMessage,
  ChartConfig,
  NetworkGraph,
  MockDataset,
  DataStructure,
  SuggestResponse,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "idle"
  | "suggesting"
  | "selecting"
  | "generating"
  | "analyzing"
  | "complete"
  | "error";

interface Props {
  databaseStructures: string[];
  databaseSites: string[];
  databaseFilterEnabled: boolean;
  databaseConnectionError: string | null;
  isVisible: boolean;
}

// ---------------------------------------------------------------------------
// NetworkDiagram — pure SVG spring-layout
// ---------------------------------------------------------------------------

interface SVGNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const NODE_COLORS: Record<string, string> = {
  instrument: "#7c3aed",
  element: "#0ea5e9",
  site: "#10b981",
  category: "#f59e0b",
};

function NetworkDiagram({ graph }: { graph: NetworkGraph }) {
  const [positions, setPositions] = useState<SVGNode[]>([]);
  const animRef = useRef<number | null>(null);
  const WIDTH = 600;
  const HEIGHT = 400;

  useEffect(() => {
    if (graph.nodes.length === 0) {
      setPositions([]);
      return;
    }

    // Initialize positions in a circle
    const nodes: SVGNode[] = graph.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / graph.nodes.length;
      const r = Math.min(WIDTH, HEIGHT) * 0.35;
      return {
        ...n,
        x: WIDTH / 2 + r * Math.cos(angle),
        y: HEIGHT / 2 + r * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    const edgeMap = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, []);
      if (!edgeMap.has(edge.target)) edgeMap.set(edge.target, []);
      edgeMap.get(edge.source)!.push(edge.target);
      edgeMap.get(edge.target)!.push(edge.source);
    }

    let step = 0;
    const MAX_STEPS = 150;

    function simulate() {
      if (step >= MAX_STEPS) {
        setPositions([...nodes]);
        return;
      }
      step++;

      const alpha = 1 - step / MAX_STEPS;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (800 / (dist * dist)) * alpha;
          nodes[i].vx -= (dx / dist) * force;
          nodes[i].vy -= (dy / dist) * force;
          nodes[j].vx += (dx / dist) * force;
          nodes[j].vy += (dy / dist) * force;
        }
      }

      // Attraction along edges
      for (const edge of graph.edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = 120;
        const force = ((dist - ideal) / dist) * 0.3 * alpha;
        src.vx += dx * force;
        src.vy += dy * force;
        tgt.vx -= dx * force;
        tgt.vy -= dy * force;
      }

      // Apply velocity + center gravity
      for (const node of nodes) {
        node.vx += (WIDTH / 2 - node.x) * 0.01 * alpha;
        node.vy += (HEIGHT / 2 - node.y) * 0.01 * alpha;
        node.vx *= 0.8;
        node.vy *= 0.8;
        node.x = Math.max(40, Math.min(WIDTH - 40, node.x + node.vx));
        node.y = Math.max(20, Math.min(HEIGHT - 20, node.y + node.vy));
      }

      setPositions([...nodes]);
      animRef.current = requestAnimationFrame(simulate);
    }

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="text-gray-400 text-sm text-center py-8">
        No network data available
      </div>
    );
  }

  const posMap = new Map(positions.map((n) => [n.id, n]));

  return (
    <div className="overflow-auto">
      <svg width={WIDTH} height={HEIGHT} className="border rounded bg-gray-50 mx-auto block">
        {/* Edges */}
        {graph.edges.map((edge, i) => {
          const src = posMap.get(edge.source);
          const tgt = posMap.get(edge.target);
          if (!src || !tgt) return null;
          return (
            <line
              key={i}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke="#cbd5e1"
              strokeWidth={edge.weight ? Math.min(edge.weight, 4) : 1}
              strokeOpacity={0.7}
            />
          );
        })}
        {/* Nodes */}
        {positions.map((node) => {
          const color = NODE_COLORS[node.type] ?? "#6b7280";
          const radius = node.type === "instrument" ? 14 : 9;
          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={color}
                fillOpacity={0.85}
                stroke="white"
                strokeWidth={2}
              />
              <text
                x={node.x}
                y={node.y + radius + 10}
                textAnchor="middle"
                fontSize={9}
                fill="#374151"
                fontWeight={node.type === "instrument" ? "bold" : "normal"}
              >
                {node.label.length > 14
                  ? node.label.slice(0, 13) + "…"
                  : node.label}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 justify-center text-xs text-gray-600">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ background: color }}
            />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartPanel
// ---------------------------------------------------------------------------

function ChartPanel({
  charts,
  datasets,
}: {
  charts: ChartConfig[];
  datasets: MockDataset[];
}) {
  if (charts.length === 0) return null;

  // Merge all rows into one pool keyed by structure shortName
  const allRows = datasets.flatMap((ds) => ds.rows);

  return (
    <div className="space-y-6">
      {charts.map((chart) => {
        const data = allRows.slice(0, 200);

        if (chart.type === "bar" && chart.xField && chart.yField) {
          // Aggregate: count by xField
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
              <h4 className="font-medium text-gray-700 text-sm mb-2">
                {chart.title}
              </h4>
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
          // Histogram: bucket numeric values
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
            const idx = Math.min(
              Math.floor((v - min) / bucketSize),
              buckets - 1
            );
            hist[idx].count++;
          }
          return (
            <div key={chart.id}>
              <h4 className="font-medium text-gray-700 text-sm mb-2">
                {chart.title}
              </h4>
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
            .map((r) => ({
              x: Number(r[chart.xField!]),
              y: Number(r[chart.yField!]),
            }))
            .filter((p) => !isNaN(p.x) && !isNaN(p.y) && p.x > -700 && p.y > -700)
            .slice(0, 100);
          return (
            <div key={chart.id}>
              <h4 className="font-medium text-gray-700 text-sm mb-2">
                {chart.title}
              </h4>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="x"
                    name={chart.xField}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="y"
                    name={chart.yField}
                    tick={{ fontSize: 11 }}
                  />
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

// ---------------------------------------------------------------------------
// MockDatasetPreview
// ---------------------------------------------------------------------------

function MockDatasetPreview({ datasets }: { datasets: MockDataset[] }) {
  if (datasets.length === 0) return null;

  return (
    <div className="space-y-6">
      {datasets.map((ds) => {
        const headers = Object.keys(ds.rows[0] ?? {}).slice(0, 10);
        const previewRows = ds.rows.slice(0, 8);
        return (
          <div key={ds.structure.shortName}>
            <div className="text-sm font-medium text-gray-700 mb-1">
              {ds.structure.shortName}{" "}
              <span className="text-gray-400 font-normal">
                ({ds.rows.length} synthetic rows, {ds.schema.length} fields)
              </span>
            </div>
            <div className="overflow-x-auto text-xs border rounded">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="px-2 py-1 text-left font-medium text-gray-500 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                    {Object.keys(ds.rows[0] ?? {}).length > 10 && (
                      <th className="px-2 py-1 text-gray-400">…</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      {headers.map((h) => (
                        <td
                          key={h}
                          className="px-2 py-1 text-gray-700 whitespace-nowrap"
                        >
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExportControls
// ---------------------------------------------------------------------------

function ExportControls({ datasets }: { datasets: MockDataset[] }) {
  const handleCSVDownload = () => {
    for (const ds of datasets) {
      if (ds.rows.length === 0) continue;
      const headers = Object.keys(ds.rows[0]);
      const csvLines = [
        headers.join(","),
        ...ds.rows.map((row) =>
          headers
            .map((h) => {
              const val = String(row[h] ?? "");
              return val.includes(",") ? `"${val}"` : val;
            })
            .join(",")
        ),
      ];
      const blob = new Blob([csvLines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
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
      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Export Mock CSV{datasets.length > 1 ? `s (${datasets.length})` : ""}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Phase2Banner
// ---------------------------------------------------------------------------

function Phase2Banner() {
  return (
    <div className="border border-purple-200 bg-purple-50 rounded-lg p-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="text-purple-500 mt-0.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-purple-800 mb-1">
            Connect your database to analyze real data
          </p>
          <p className="text-purple-700">
            Currently showing synthetic mock data generated from NDA schema definitions.
            To enable real participant data analysis, set{" "}
            <code className="bg-purple-100 px-1 rounded font-mono text-xs">MONGODB_URI</code> and{" "}
            <code className="bg-purple-100 px-1 rounded font-mono text-xs">MONGODB_DB_NAME</code>{" "}
            in your <code className="bg-purple-100 px-1 rounded font-mono text-xs">.env.local</code> file.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConversationHistory
// ---------------------------------------------------------------------------

function ConversationHistory({
  history,
}: {
  history: ConversationMessage[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (history.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700"
      >
        <span>Conversation history ({Math.floor(history.length / 2)} exchanges)</span>
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="divide-y">
          {history.map((msg, i) => (
            <div
              key={i}
              className={`px-4 py-3 text-sm ${
                msg.role === "user" ? "bg-white" : "bg-gray-50"
              }`}
            >
              <span
                className={`font-medium text-xs uppercase tracking-wide ${
                  msg.role === "user" ? "text-purple-600" : "text-gray-500"
                }`}
              >
                {msg.role}
              </span>
              <p className="text-gray-700 mt-1 whitespace-pre-wrap">
                {msg.content.length > 300
                  ? msg.content.slice(0, 300) + "…"
                  : msg.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ResearchAssistant Component
// ---------------------------------------------------------------------------

export default function ResearchAssistant({
  databaseStructures,
  databaseSites: _databaseSites,
  databaseFilterEnabled,
  databaseConnectionError,
  isVisible,
}: Props) {
  void _databaseSites;
  void isVisible;

  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<StructureSuggestion[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [networkGraph, setNetworkGraph] = useState<NetworkGraph>({ nodes: [], edges: [] });
  const [selectedShortNames, setSelectedShortNames] = useState<Set<string>>(new Set());
  const [selectedStructures, setSelectedStructures] = useState<DataStructure[]>([]);

  const [mockDatasets, setMockDatasets] = useState<MockDataset[]>([]);

  const [analysisText, setAnalysisText] = useState("");
  const [charts, setCharts] = useState<ChartConfig[]>([]);

  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [suggestHistory, setSuggestHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [refineInput, setRefineInput] = useState("");

  const analysisEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll analysis panel
  useEffect(() => {
    if (phase === "analyzing") {
      analysisEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [analysisText, phase]);

  const handleSuggest = async (refinement?: string) => {
    const isRefinement = refinement !== undefined;
    const q = isRefinement ? refinement : question;
    if (!q.trim()) return;

    // On a fresh search, reset history; on refinement, keep it
    const historyToSend = isRefinement ? suggestHistory : [];

    setPhase("suggesting");
    setErrorMsg(null);
    setSuggestions([]);
    setReasoning("");
    setNetworkGraph({ nodes: [], edges: [] });
    if (!isRefinement) {
      setSelectedShortNames(new Set());
      setSelectedStructures([]);
      setMockDatasets([]);
      setAnalysisText("");
      setCharts([]);
      setSuggestHistory([]);
    }

    try {
      const res = await fetch("/api/v1/research/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          databaseStructures: databaseFilterEnabled ? databaseStructures : [],
          conversationHistory: historyToSend,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json() as SuggestResponse;
      setSuggestions(data.suggestions);
      setReasoning(data.reasoning);
      setNetworkGraph(data.networkGraph);
      setPhase("selecting");

      // Append this turn to suggest history
      const assistantContent = JSON.stringify({
        suggestions: data.suggestions,
        reasoning: data.reasoning,
      });
      setSuggestHistory((prev) => [
        ...historyToSend,
        { role: "user" as const, content: q },
        { role: "assistant" as const, content: assistantContent },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const toggleStructure = (shortName: string) => {
    setSelectedShortNames((prev) => {
      const next = new Set(prev);
      if (next.has(shortName)) {
        next.delete(shortName);
      } else {
        next.add(shortName);
      }
      return next;
    });
  };

  const handleGenerateMock = useCallback(async () => {
    if (selectedShortNames.size === 0) return;
    setPhase("generating");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/v1/research/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedStructures: [...selectedShortNames] }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const datasets = await res.json() as MockDataset[];
      setMockDatasets(datasets);

      // Build selectedStructures from datasets for analyze call
      setSelectedStructures(datasets.map((d) => d.structure));
      setPhase("complete");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [selectedShortNames]);

  const handleAnalyze = useCallback(
    async (q: string) => {
      if (!q.trim() || mockDatasets.length === 0) return;
      setPhase("analyzing");
      setAnalysisText("");
      setCharts([]);

      try {
        const res = await fetch("/api/v1/research/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            selectedStructures,
            mockDatasets,
            conversationHistory,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setAnalysisText(fullText);
        }

        // Parse charts block from end of response
        const chartsMatch = fullText.match(/<charts>([\s\S]*?)<\/charts>/);
        let cleanText = fullText.replace(/<charts>[\s\S]*?<\/charts>/, "").trim();
        setAnalysisText(cleanText);

        if (chartsMatch) {
          try {
            const parsedCharts = JSON.parse(chartsMatch[1]) as ChartConfig[];
            setCharts(parsedCharts);
          } catch {
            // Charts block malformed — ignore
          }
        }

        // Update conversation history
        setConversationHistory((prev) => [
          ...prev,
          { role: "user", content: q, timestamp: Date.now() },
          { role: "assistant", content: cleanText, timestamp: Date.now() },
        ]);

        setPhase("complete");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [mockDatasets, selectedStructures, conversationHistory]
  );

  const handleFollowUp = async () => {
    if (!followUpQuestion.trim()) return;
    const q = followUpQuestion;
    setFollowUpQuestion("");
    await handleAnalyze(q);
  };

  const confidenceColor: Record<string, string> = {
    high: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-gray-100 text-gray-700",
  };

  const isLoading =
    phase === "suggesting" || phase === "generating" || phase === "analyzing";

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-1">
          Research Assistant
        </h1>
        <p className="text-gray-500 text-sm">
          Explore IMPACT-MH instruments, generate mock datasets, and plan your
          analysis — powered by Claude.
        </p>
      </div>

      {/* Connection error warning */}
      {databaseConnectionError && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3 text-sm text-amber-800">
          Database connection unavailable. Suggestions will use all NDA structures.
        </div>
      )}

      {/* Phase 2 banner — always visible */}
      <Phase2Banner />

      {/* Question input */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Research question
        </label>
        <div className="flex gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., anxiety and depression measures in adolescents, PTSD biomarkers, cognitive function in MDD..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSuggest();
            }}
            disabled={isLoading}
          />
          <button
            onClick={() => void handleSuggest()}
            disabled={isLoading || !question.trim()}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {phase === "suggesting" ? "Finding…" : "Find Instruments"}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {databaseFilterEnabled
            ? `Searching within ${databaseStructures.length} IMPACT-MH instruments`
            : "Searching all NDA instruments"}
          {" · "}Cmd+Enter to submit
        </p>
      </div>

      {/* Error */}
      {phase === "error" && errorMsg && (
        <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {errorMsg}
          <button
            onClick={() => setPhase("idle")}
            className="ml-3 underline text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-purple-600">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {phase === "suggesting" && (suggestHistory.length > 0 ? "Refining suggestions…" : "Analyzing your research question…")}
          {phase === "generating" && "Generating synthetic dataset…"}
          {phase === "analyzing" && "Analyzing mock data…"}
        </div>
      )}

      {/* Suggestions */}
      {(phase === "selecting" ||
        phase === "generating" ||
        phase === "complete" ||
        phase === "analyzing") &&
        suggestions.length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Suggested Instruments
              </h2>
              {reasoning && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded p-3 border">
                  {reasoning}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {suggestions.map((s) => (
                <label
                  key={s.shortName}
                  className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedShortNames.has(s.shortName)
                      ? "border-purple-400 bg-purple-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedShortNames.has(s.shortName)}
                    onChange={() => toggleStructure(s.shortName)}
                    className="mt-0.5 accent-purple-600"
                    disabled={phase !== "selecting"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-purple-700">
                        {s.shortName}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          confidenceColor[s.confidence] ?? confidenceColor.low
                        }`}
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
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {s.sites.slice(0, 3).map((site) => (
                          <span
                            key={site}
                            className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200"
                          >
                            {site}
                          </span>
                        ))}
                        {s.sites.length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{s.sites.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                    {s.dataTypes && s.dataTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.dataTypes.slice(0, 3).map((dt) => (
                          <span
                            key={dt}
                            className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700"
                          >
                            {dt}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.categories && s.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.categories.slice(0, 3).map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 text-xs rounded bg-violet-100 text-violet-700"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {phase === "selecting" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGenerateMock}
                    disabled={selectedShortNames.size === 0}
                    className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Generate Mock Dataset
                    {selectedShortNames.size > 0
                      ? ` (${selectedShortNames.size} instrument${selectedShortNames.size > 1 ? "s" : ""})`
                      : ""}
                  </button>
                  <span className="text-xs text-gray-400">
                    Select instruments above, then generate synthetic data
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    placeholder="Refine: e.g. remove neuropsychological ones, only behavioral tasks…"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && refineInput.trim()) {
                        const q = refineInput;
                        setRefineInput("");
                        void handleSuggest(q);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!refineInput.trim()) return;
                      const q = refineInput;
                      setRefineInput("");
                      void handleSuggest(q);
                    }}
                    disabled={!refineInput.trim()}
                    className="px-3 py-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    Refine list →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      {/* Network diagram */}
      {networkGraph.nodes.length > 0 && phase !== "suggesting" && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Instrument Relationship Network
          </h2>
          <NetworkDiagram graph={networkGraph} />
        </div>
      )}

      {/* Mock dataset preview + export */}
      {mockDatasets.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              Mock Dataset Preview
            </h2>
            <ExportControls datasets={mockDatasets} />
          </div>
          <MockDatasetPreview datasets={mockDatasets} />

          {/* Analyze button / follow-up input */}
          {phase === "complete" && analysisText === "" && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleAnalyze(question)}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                Analyze with Claude
              </button>
              <span className="text-xs text-gray-400 self-center">
                Get preliminary analysis of the mock data
              </span>
            </div>
          )}
        </div>
      )}

      {/* Analysis panel */}
      {(analysisText || phase === "analyzing") && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Analysis</h2>
          <div className="prose prose-sm max-w-none bg-white border rounded-lg p-4 text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
            {analysisText ||
              (phase === "analyzing" && (
                <span className="text-gray-400 italic">Streaming…</span>
              ))}
          </div>
          <div ref={analysisEndRef} />

          {/* Charts */}
          {charts.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-800 mb-3">
                Suggested Charts (Mock Data)
              </h3>
              <ChartPanel charts={charts} datasets={mockDatasets} />
            </div>
          )}

          {/* Follow-up */}
          {phase === "complete" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Follow-up question
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={followUpQuestion}
                  onChange={(e) => setFollowUpQuestion(e.target.value)}
                  placeholder="Ask a follow-up about the analysis or instruments…"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFollowUp();
                  }}
                />
                <button
                  onClick={handleFollowUp}
                  disabled={!followUpQuestion.trim()}
                  className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  Ask
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conversation history */}
      <ConversationHistory history={conversationHistory} />
    </div>
  );
}

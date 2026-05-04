import type {
    StructureSuggestion,
    ChartConfig,
    NetworkGraph,
    MockDataset,
    DataElement,
    HarmonizationResult,
    ElementHarmonizeResponse,
} from "@/types";

export type Phase =
    | "idle"
    | "suggesting"
    | "selecting"
    | "generating"
    | "analyzing"
    | "harmonizing"
    | "element-harmonizing"
    | "complete"
    | "error";

export type PhaseAction =
    | { type: "SUGGEST_START" }
    | { type: "SUGGEST_DONE" }
    | { type: "GENERATE_START" }
    | { type: "GENERATE_DONE" }
    | { type: "ANALYZE_START" }
    | { type: "ANALYZE_DONE" }
    | { type: "HARMONIZE_START" }
    | { type: "HARMONIZE_DONE" }
    | { type: "ELEMENT_HARMONIZE_START" }
    | { type: "ELEMENT_HARMONIZE_DONE" }
    | { type: "ERROR" }
    | { type: "DISMISS_ERROR" }
    | { type: "RESET" };

export function phaseReducer(state: Phase, action: PhaseAction): Phase {
    switch (action.type) {
        case "SUGGEST_START":          return "suggesting";
        case "SUGGEST_DONE":           return "selecting";
        case "GENERATE_START":         return "generating";
        case "GENERATE_DONE":          return "complete";
        case "ANALYZE_START":          return "analyzing";
        case "ANALYZE_DONE":           return "complete";
        case "HARMONIZE_START":        return "harmonizing";
        case "HARMONIZE_DONE":         return "complete";
        case "ELEMENT_HARMONIZE_START": return "element-harmonizing";
        case "ELEMENT_HARMONIZE_DONE": return "complete";
        case "ERROR":                  return "error";
        case "DISMISS_ERROR":          return "idle";
        case "RESET":                  return "idle";
        default:                       return state;
    }
}

export type ChatMsg =
    | { id: string; type: "user"; text: string }
    | {
          id: string;
          type: "suggestions";
          suggestions: StructureSuggestion[];
          reasoning: string;
          networkGraph: NetworkGraph;
      }
    | { id: string; type: "mock-ready"; datasets: MockDataset[] }
    | { id: string; type: "analysis"; text: string; charts: ChartConfig[] }
    | { id: string; type: "hint"; text: string }
    | { id: string; type: "harmonize"; result: HarmonizationResult }
    | { id: string; type: "element-harmonize"; result: ElementHarmonizeResponse; overlapThreshold: number };

export interface MergedDataset {
    id: string;
    name: string;
    sourceNames: string[];
    rows: Record<string, unknown>[];
    schema: DataElement[];
}

export interface Props {
    databaseStructures: string[];
    databaseSites: string[];
    databaseFilterEnabled: boolean;
    databaseConnectionError: string | null;
    isVisible: boolean;
    onElementSearch?: (elementName: string) => void;
    onStructureSearch?: (shortName: string) => void;
}

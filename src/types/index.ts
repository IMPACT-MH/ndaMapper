/**
 * Shared type definitions for ndaValidator
 */

// ---------------------------------------------------------------------------
// NDA API shapes
// ---------------------------------------------------------------------------

export interface DataElement {
  name: string;
  type: string;
  description?: string;
  valueRange?: string;
  notes?: string;
  aliases?: string[];
  required?: string;
  position?: number;
  size?: string | number;
}


export interface DataStructure {
  shortName: string;
  title: string;
  categories?: string[];
  dataType?: string;
  dataTypes?: string[];
  status?: string;
  dominantAlias?: string;
  submittedByProjects?: string[];
  dataElements?: DataElement[];
}

// ---------------------------------------------------------------------------
// IMPACT-MH API shapes
// ---------------------------------------------------------------------------

export type TagType = "Category" | "Data Type" | "Removed Category" | "Removed Data Type";

export interface CustomTag {
  id: string;
  name: string;
  tagType: TagType;
  createdAt?: string;
  updatedAt?: string;
}

export interface DatabaseDataStructuresResponse {
  dataStructures: DataStructure[];
  elements?: DataElement[];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditAction = "create" | "update" | "delete" | "assign" | "remove";

export interface AuditEntry {
  id?: string;
  action: AuditAction;
  tagId: string;
  tagName: string;
  tagType: string;
  structureShortName?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Value validation
// ---------------------------------------------------------------------------

export interface ParsedRangeRange {
  type: "range";
  min: number;
  max: number;
  values: string[] | null;
  original: string;
}

export interface ParsedRangeEnum {
  type: "enum";
  values: string[];
  original: string;
}

export interface ParsedRangeUnknown {
  type: "unknown";
  original: string;
}

export type ParsedValueRange = ParsedRangeRange | ParsedRangeEnum | ParsedRangeUnknown;

// ---------------------------------------------------------------------------
// CSV Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  row: number;
  column: string;
  value: string;
  message: string;
  elementName?: string;
}

export interface ValidationWarning {
  row: number;
  column: string;
  value: string;
  message: string;
}

export interface TransformationCounts {
  handedness: number;
  binary: number;
  [key: string]: number;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
  transformations: TransformationCounts;
  correctedData?: string[][];
}

export interface ValidatorState {
  isValidating: boolean;
  results: ValidationResult | null;
  csvFile: File | null;
  csvData: string[][] | null;
  headers: string[] | null;
}

// ---------------------------------------------------------------------------
// HTTPS client (api-client.ts)
// ---------------------------------------------------------------------------

export interface HttpsRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface HttpsResponse {
  ok: boolean;
  status: number | undefined;
  statusText: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

// ---------------------------------------------------------------------------
// ApiError — replaces ad-hoc `error.status = 400` pattern
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// NDA Search
// ---------------------------------------------------------------------------

export interface NdaSearchParams {
  size?: number | string;
  from?: number | string;
  ddsize?: number | string;
  highlight?: boolean;
  site?: string[];
}

// ---------------------------------------------------------------------------
// App navigation
// ---------------------------------------------------------------------------

export type TabValue = "dictionary" | "structures" | "elements" | "reverse" | "research-assistant";

// ---------------------------------------------------------------------------
// Research Assistant
// ---------------------------------------------------------------------------

export interface StructureSuggestion {
  shortName: string;
  title: string;
  relevanceReason: string;
  confidence: "high" | "medium" | "low";
  sites?: string[];
  sharedElements?: string[];
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChartConfig {
  id: string;
  type: "bar" | "histogram" | "scatter" | "network";
  title: string;
  xField?: string;
  yField?: string;
  groupByField?: string;
  data: Record<string, unknown>[];
}

export interface NetworkNode {
  id: string;
  label: string;
  type: "instrument" | "element" | "site" | "category";
  value?: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  label?: string;
  weight?: number;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface MockDataset {
  rows: Record<string, unknown>[];
  schema: DataElement[];
  structure: DataStructure;
}

export interface SuggestRequest {
  question: string;
  databaseStructures?: string[];
  databaseSites?: string[];
}

export interface SuggestResponse {
  suggestions: StructureSuggestion[];
  reasoning: string;
  networkGraph: NetworkGraph;
}

export interface AnalyzeRequest {
  question: string;
  selectedStructures: DataStructure[];
  mockDatasets: MockDataset[];
  conversationHistory: ConversationMessage[];
}

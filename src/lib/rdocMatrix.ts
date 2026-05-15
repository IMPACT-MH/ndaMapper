import fs from "fs";
import path from "path";

const CACHE_PATH = path.join(process.cwd(), "public", "rdoc-matrix.json");

export interface RdocUnit {
    name: string;
    elements: string[];
}

export interface RdocConstruct {
    id: string;
    domain: string;
    construct: string;
    subconstruct?: string;
    units: RdocUnit[];
}

export interface RdocMatrix {
    fetchedAt: string;
    constructs: RdocConstruct[];
}

let cachedMatrix: RdocMatrix | null = null;

export async function getRdocMatrix(): Promise<RdocMatrix> {
    if (cachedMatrix && cachedMatrix.constructs.length > 0) return cachedMatrix;

    try {
        const raw = fs.readFileSync(CACHE_PATH, "utf-8");
        const parsed = JSON.parse(raw) as Partial<RdocMatrix>;
        if (parsed.constructs && parsed.constructs.length > 0) {
            cachedMatrix = parsed as RdocMatrix;
            return cachedMatrix;
        }
    } catch {
        // file missing or invalid JSON
    }

    console.warn("[rdocMatrix] Cache missing or empty. Run: node scripts/fetch-rdoc.mjs");
    return { fetchedAt: new Date().toISOString(), constructs: [] };
}

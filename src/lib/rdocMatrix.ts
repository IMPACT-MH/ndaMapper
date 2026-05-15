import fs from "fs";
import path from "path";

const RDOC_URL =
    "https://www.nimh.nih.gov/research/research-funded-by-nimh/rdoc/constructs/rdoc-snapshot-version-4-saved-5-30-18";
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

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseUnits(chunk: string): RdocUnit[] {
    const units: RdocUnit[] = [];
    // Split into unit blocks by h3.rdoc-unit__heading--unit-name
    const unitBlockRe =
        /<h3[^>]*rdoc-unit__heading--unit-name[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[^>]*rdoc-unit__heading|$)/gi;
    let um: RegExpExecArray | null;
    while ((um = unitBlockRe.exec(chunk)) !== null) {
        const unitName = stripTags(um[1]).trim();
        if (!unitName) continue;
        const body = um[2];
        const elements: string[] = [];
        const elRe = /<span[^>]*rdoc-unit__el[^>]*>([\s\S]*?)<\/span>/gi;
        let em: RegExpExecArray | null;
        while ((em = elRe.exec(body)) !== null) {
            const el = stripTags(em[1]).trim();
            if (el) elements.push(el);
        }
        units.push({ name: unitName, elements });
    }
    return units;
}

function parseRdocHtml(html: string): RdocConstruct[] {
    const constructs: RdocConstruct[] = [];

    // The page uses <li data-cms-taxonid="N"> for each domain/construct/subconstruct.
    // Split the HTML into chunks at each data-cms-taxonid boundary.
    const positions: Array<{ taxonid: string; pos: number }> = [];
    const taxonRe = /data-cms-taxonid="(\d+)"/g;
    let tm: RegExpExecArray | null;
    while ((tm = taxonRe.exec(html)) !== null) {
        positions.push({ taxonid: tm[1], pos: tm.index });
    }

    let currentDomain = "";
    let currentConstruct = "";

    for (let pi = 0; pi < positions.length; pi++) {
        const { taxonid, pos } = positions[pi];
        // Take chunk up to next taxonid occurrence (or 8KB limit to avoid cross-section bleed)
        const end = pi + 1 < positions.length
            ? Math.min(positions[pi + 1].pos, pos + 8192)
            : pos + 8192;
        const rawChunk = html.slice(pos, end);
        // The position is mid-tag (at the attribute), skip past the closing ">" of the opening tag
        const gtIdx = rawChunk.indexOf(">");
        const chunk = gtIdx >= 0 ? rawChunk.slice(gtIdx + 1) : rawChunk;

        // Get the first meaningful text line
        const textContent = stripTags(chunk);
        const firstLine = textContent.split(/[\n\r]+/).map((l) => l.trim()).find((l) => l.length > 2) ?? "";

        if (firstLine.startsWith("Domain:")) {
            currentDomain = firstLine.replace(/^Domain:\s*/i, "").trim();
            currentConstruct = "";
        } else if (firstLine.startsWith("Construct:")) {
            currentConstruct = firstLine.replace(/^Construct:\s*/i, "").trim();
            if (!currentDomain || !currentConstruct) continue;
            const units = parseUnits(chunk);
            constructs.push({
                id: slugify(`${currentDomain}-${currentConstruct}`),
                domain: currentDomain,
                construct: currentConstruct,
                units,
            });
        } else if (firstLine.startsWith("Subconstruct:")) {
            const subconstruct = firstLine.replace(/^Subconstruct:\s*/i, "").trim();
            if (!currentDomain || !currentConstruct || !subconstruct) continue;
            const units = parseUnits(chunk);
            constructs.push({
                id: slugify(`${currentDomain}-${currentConstruct}-${subconstruct}`),
                domain: currentDomain,
                construct: currentConstruct,
                subconstruct,
                units,
            });
        }
        // Skip entries that are taxonid anchors without Domain/Construct/Subconstruct prefix (nav items, etc.)
    }

    return constructs;
}

export async function getRdocMatrix(): Promise<RdocMatrix> {
    if (cachedMatrix && cachedMatrix.constructs.length > 0) return cachedMatrix;

    // Try reading from disk cache
    try {
        const raw = fs.readFileSync(CACHE_PATH, "utf-8");
        const parsed = JSON.parse(raw) as Partial<RdocMatrix>;
        if (parsed.constructs && parsed.constructs.length > 0) {
            cachedMatrix = parsed as RdocMatrix;
            return cachedMatrix;
        }
    } catch {
        // file missing or invalid JSON — will fetch
    }

    // Fetch and parse
    try {
        const res = await fetch(RDOC_URL, {
            signal: AbortSignal.timeout(20000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RdocMatrixBot/1.0)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const constructs = parseRdocHtml(html);

        const matrix: RdocMatrix = {
            fetchedAt: new Date().toISOString(),
            constructs,
        };

        // Write to disk cache
        try {
            fs.writeFileSync(CACHE_PATH, JSON.stringify(matrix, null, 2), "utf-8");
        } catch (e) {
            console.warn("[rdocMatrix] Could not write cache:", e instanceof Error ? e.message : String(e));
        }

        cachedMatrix = matrix;
        return matrix;
    } catch (err) {
        console.warn("[rdocMatrix] Fetch failed, returning empty matrix:", err instanceof Error ? err.message : String(err));
        return { fetchedAt: new Date().toISOString(), constructs: [] };
    }
}

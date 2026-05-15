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

// Order matches the NIMH page navigation
const DOMAIN_ORDER = [
    "Negative Valence Systems",
    "Positive Valence Systems",
    "Cognitive Systems",
    "Social Processes",
    "Arousal and Regulatory Systems",
    "Sensorimotor Systems",
];

let cachedMatrix: RdocMatrix | null = null;

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRdocHtml(html: string): RdocConstruct[] {
    const constructs: RdocConstruct[] = [];

    // Each domain section is wrapped in a div with class "rdoc-tree-full"
    // The domain name appears in the nav; constructs appear in h2 headings
    // within sections that also carry domain context.
    //
    // Structure observed:
    //   <section data-cms-taxonid="188"> (Negative Valence)
    //     <h2 class="rdoc-tree-full__nunits-heading ...">Threat (Acute)</h2>
    //     <div class="rdoc-unit">
    //       <h3 class="rdoc-unit__heading rdoc-unit__heading--unit-name">Self-Reports</h3>
    //       <span class="rdoc-unit__el">PHQ-9</span>
    //       ...
    //     </div>
    //     ...
    //   </section>
    //
    // Domain taxon IDs from nav (approximate order):
    //   188 → Negative Valence, 199 → Positive Valence, 211 → Cognitive,
    //   226 → Social, 487 → Arousal/Regulatory, last → Sensorimotor

    // Map taxonid prefix → domain name using nav links
    const taxonDomainMap = new Map<string, string>();
    const navRe = /<li[^>]*data-cms-taxonid="(\d+)"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;
    let navM: RegExpExecArray | null;
    while ((navM = navRe.exec(html)) !== null) {
        const label = stripTags(navM[2]).trim();
        const matched = DOMAIN_ORDER.find(
            (d) => d.toLowerCase() === label.toLowerCase()
        );
        if (matched) taxonDomainMap.set(navM[1], matched);
    }

    // Split HTML into per-section chunks by taxonid
    // Each section starts with something like <div ... data-cms-taxonid="NNN" ...>
    // or <section data-cms-taxonid="NNN">
    const sectionRe = /data-cms-taxonid="(\d+)"/g;
    const sectionPositions: Array<{ taxonid: string; pos: number }> = [];
    let sm: RegExpExecArray | null;
    while ((sm = sectionRe.exec(html)) !== null) {
        sectionPositions.push({ taxonid: sm[1], pos: sm.index });
    }

    // Pair each domain taxonid with its slice of HTML
    const domainSections: Array<{ domain: string; chunk: string }> = [];
    for (let di = 0; di < sectionPositions.length; di++) {
        const { taxonid, pos } = sectionPositions[di];
        const domain = taxonDomainMap.get(taxonid);
        if (!domain) continue;
        const end = di + 1 < sectionPositions.length ? sectionPositions[di + 1].pos : html.length;
        domainSections.push({ domain, chunk: html.slice(pos, end) });
    }

    // If we didn't find domain sections by taxonid (page structure may differ),
    // fall back: use construct-level taxonids and infer domain from DOMAIN_ORDER index
    if (domainSections.length === 0) {
        // Parse all constructs globally and assign domains by position
        const allConstructs = parseConstructsFromHtml(html, "Unknown Domain");
        // Rough heuristic: distribute evenly across domains (not ideal but graceful)
        allConstructs.forEach((c) => constructs.push(c));
        return constructs;
    }

    for (const { domain, chunk } of domainSections) {
        const dc = parseConstructsFromHtml(chunk, domain);
        dc.forEach((c) => constructs.push(c));
    }

    return constructs;
}

function parseConstructsFromHtml(html: string, domain: string): RdocConstruct[] {
    const constructs: RdocConstruct[] = [];

    // Match each construct block: from an h2.rdoc-tree-full__nunits-heading to the next one (or end)
    const constructBlockRe =
        /<h2[^>]*class="[^"]*rdoc-tree-full__nunits-heading[^"]*"[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*class="[^"]*rdoc-tree-full__nunits-heading|$)/gi;

    let cm: RegExpExecArray | null;
    while ((cm = constructBlockRe.exec(html)) !== null) {
        const constructName = stripTags(cm[1]).trim();
        if (!constructName) continue;
        const body = cm[2];

        const units = parseUnits(body);
        constructs.push({
            id: slugify(constructName),
            domain,
            construct: constructName,
            units,
        });
    }

    return constructs;
}

function parseUnits(html: string): RdocUnit[] {
    const units: RdocUnit[] = [];

    // Split into unit blocks by h3.rdoc-unit__heading--unit-name
    const unitBlockRe =
        /<h3[^>]*class="[^"]*rdoc-unit__heading--unit-name[^"]*"[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[^>]*class="[^"]*rdoc-unit__heading|$)/gi;

    let um: RegExpExecArray | null;
    while ((um = unitBlockRe.exec(html)) !== null) {
        const unitName = stripTags(um[1]).trim();
        if (!unitName) continue;
        const body = um[2];

        const elements: string[] = [];
        const elRe = /<span[^>]*class="[^"]*rdoc-unit__el[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
        let em: RegExpExecArray | null;
        while ((em = elRe.exec(body)) !== null) {
            const el = stripTags(em[1]).trim();
            if (el) elements.push(el);
        }

        units.push({ name: unitName, elements });
    }

    return units;
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

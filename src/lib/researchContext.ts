import "server-only";
import fs from "fs/promises";
import path from "path";

const CONTEXT_DIR = path.join(process.cwd(), "research-context");

/**
 * Load the IMPACT-MH mission context markdown.
 * Falls back gracefully if the file is missing.
 */
export async function loadMissionContext(): Promise<string> {
  try {
    const filePath = path.join(CONTEXT_DIR, "impact-mh-mission.md");
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "IMPACT-MH is a mental health data repository that aggregates data from clinical research sites across the US.";
  }
}

/**
 * Load site-specific context for a given site name.
 * Converts the site name to a safe filename (lowercase, spaces→hyphens).
 * Falls back gracefully if the file is missing.
 */
export async function loadSiteContext(siteName: string): Promise<string | null> {
  try {
    const safeName = siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filePath = path.join(CONTEXT_DIR, "sites", `${safeName}.md`);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Load context for multiple sites, returning only those that have files.
 */
export async function loadSitesContext(siteNames: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await Promise.all(
    siteNames.map(async (site) => {
      const ctx = await loadSiteContext(site);
      if (ctx) results[site] = ctx;
    })
  );
  return results;
}

import type { DataStructure } from "@/types";

// NDA's public data dictionary only ever lists structures it has published —
// there is no "Draft" value returned from it. So "published in NDA" is
// equivalent to "shortName appears in this list"; a structure's absence is
// what actually means Draft, not any per-structure status field.

interface NdaPublishedCache {
  shortNames: Set<string>;
  timestamp: number;
}

let cache: NdaPublishedCache | null = null;
const CLIENT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (server proxy also caches, longer)

export async function fetchNdaStructures(): Promise<DataStructure[]> {
  const response = await fetch("/api/v1/nda-structures");
  if (!response.ok) {
    throw new Error(`Failed to fetch NDA structures: ${response.status}`);
  }
  const data = (await response.json()) as unknown;
  return Array.isArray(data) ? (data as DataStructure[]) : [];
}

export function buildNdaPublishedShortNames(
  structures: DataStructure[],
): Set<string> {
  const shortNames = new Set<string>();
  structures.forEach((structure) => {
    if (structure.shortName) {
      shortNames.add(structure.shortName.toLowerCase());
    }
  });
  return shortNames;
}

export async function getNdaPublishedShortNames(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.timestamp < CLIENT_CACHE_DURATION) {
    return cache.shortNames;
  }
  const structures = await fetchNdaStructures();
  const shortNames = buildNdaPublishedShortNames(structures);
  cache = { shortNames, timestamp: now };
  return shortNames;
}

export function isDraftStructure(
  shortName: string | undefined | null,
  ndaPublishedShortNames: Set<string>,
): boolean {
  if (!shortName) return true;
  return !ndaPublishedShortNames.has(shortName.toLowerCase());
}

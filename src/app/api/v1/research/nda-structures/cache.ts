// Shared in-memory cache for nda-structures route
export let cache: unknown = null;
export let cacheTimestamp = 0;
// NDA's published data dictionary changes rarely; cache longer than the
// IMPACT-MH data-structures proxy to keep request volume to NDA low and
// avoid re-triggering their rate limiting.
export const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export function clearCache(): void {
  cache = null;
  cacheTimestamp = 0;
}

export function setCache(data: unknown): void {
  cache = data;
  cacheTimestamp = Date.now();
}

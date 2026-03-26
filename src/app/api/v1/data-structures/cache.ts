// Shared in-memory cache for data-structures route
export let cache: unknown = null;
export let cacheTimestamp = 0;
export const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function clearCache(): void {
  cache = null;
  cacheTimestamp = 0;
}

export function setCache(data: unknown): void {
  cache = data;
  cacheTimestamp = Date.now();
}

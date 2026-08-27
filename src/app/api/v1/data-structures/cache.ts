// Shared in-memory cache for data-structures route
export let cache: unknown = null;
export let cacheTimestamp = 0;
// Matches the client-side polling interval (see HomePage.tsx / DataCategorySearch.tsx)
// so polling actually gets fresh data instead of a stale cached copy.
export const CACHE_DURATION = 60 * 1000; // 60 seconds

export function clearCache(): void {
  cache = null;
  cacheTimestamp = 0;
}

export function setCache(data: unknown): void {
  cache = data;
  cacheTimestamp = Date.now();
}

/**
 * API endpoints and configuration constants
 */

// IMPACT-MH API base URL
export const IMPACT_API_BASE = "https://nda.impact-mh.org/api/v1";

// IMPACT-MH API endpoints
export const DATA_STRUCTURES = "/data-structures";
export const DATA_TAGS = "/tags";

// NDA API endpoints
export const NDA_API_BASE = "https://nda.nih.gov/api";
export const NDA_DATA_STRUCTURES = `${NDA_API_BASE}/datadictionary/datastructure`;
export const NDA_DATA_ELEMENT = `${NDA_API_BASE}/datadictionary/datastructure/dataElement`;

// NDA Elasticsearch API endpoints
export const NDA_SEARCH_BASE = "https://nda.nih.gov/api/search";
export const NDA_SEARCH_FULL = (index, types, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.size) queryParams.set("size", params.size);
    if (params.from) queryParams.set("from", params.from);
    if (params.ddsize) queryParams.set("ddsize", params.ddsize);
    if (params.highlight !== undefined)
        queryParams.set("highlight", params.highlight);
    if (params.site) {
        params.site.forEach((s) => queryParams.append("site", s));
    }
    const queryString = queryParams.toString();
    const queryPart = queryString ? `?${queryString}` : "";
    return `${NDA_SEARCH_BASE}/${index}/${types}/full${queryPart}`;
};
export const NDA_SEARCH_AUTOCOMPLETE = (index, types, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.size) queryParams.set("size", params.size);
    if (params.site) {
        params.site.forEach((s) => queryParams.append("site", s));
    }
    const queryString = queryParams.toString();
    const queryPart = queryString ? `?${queryString}` : "";
    return `${NDA_SEARCH_BASE}/${index}/${types}/autocomplete${queryPart}`;
};

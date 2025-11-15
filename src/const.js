/**
 * API endpoints and configuration constants
 */

// IMPACT-MH Data Portal (use proxy route to handle SSL certificates)
export const DATA_PORTAL = "/api/spinup/dataStructures";

// Direct URLs (commented out - have SSL certificate issues):
// export const DATA_PORTAL = "https://spinup-002b0f.spinup.yale.edu/api/dataStructures/database/";
// export const DATA_PORTAL = "https://api.impact-mh.org/impact/data-portal";

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

// Spinup API endpoints
export const SPINUP_API_BASE = "https://spinup-002b0f.spinup.yale.edu/api";
export const SPINUP_API_PROXY = "/api/spinup";

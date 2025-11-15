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

// Spinup API endpoints
export const SPINUP_API_BASE = "https://spinup-002b0f.spinup.yale.edu/api";
export const SPINUP_API_PROXY = "/api/spinup";

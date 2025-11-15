/**
 * Value standardization utilities for NDA data formats
 */

/**
 * Standardize handedness values to NDA format (L, R, B)
 * @param {any} value - The value to standardize
 * @returns {string} Standardized value (L, R, B, or original if not recognized)
 */
export function standardizeHandedness(value) {
    const handednessMap = {
        left: "L",
        l: "L",
        right: "R",
        r: "R",
        both: "B",
        ambidextrous: "B",
    };

    // Convert to lowercase for consistent matching
    const lowerValue = value?.toString().toLowerCase();
    return handednessMap[lowerValue] || value;
}

/**
 * Standardize boolean values to numeric format (0, 1)
 * @param {any} value - The value to standardize
 * @returns {string} Standardized value (0, 1, or original if not recognized)
 */
export function standardizeBinary(value) {
    const binaryMap = {
        true: "1",
        false: "0",
        t: "1",
        f: "0",
        TRUE: "1",
        FALSE: "0",
        True: "1",
        False: "0",
    };

    // Try direct match first
    if (value in binaryMap) return binaryMap[value];

    // Try lowercase match
    const lowerValue = value?.toString().toLowerCase();
    return binaryMap[lowerValue] || value;
}


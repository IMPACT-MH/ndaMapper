/**
 * Value range parsing and validation utilities
 */

/**
 * Parse a value range string into a structured object
 * @param {string} rangeStr - Value range string (e.g., "0::9999; -777; -999" or "Y;N")
 * @returns {object|null} Parsed range object or null if invalid
 */
export function parseValueRange(rangeStr) {
    if (!rangeStr) return null;

    // Handle numeric ranges with special values (e.g., "0::9999; -777; -999")
    if (rangeStr.includes("::")) {
        const parts = rangeStr.split(";").map((p) => p.trim());
        const rangePart = parts.find((p) => p.includes("::"));
        const [min, max] = rangePart.split("::").map(Number);

        // Get any special values
        const specialValues = parts
            .filter((p) => !p.includes("::"))
            .map((p) => p.trim());

        return {
            type: "range",
            min,
            max,
            values: specialValues.length > 0 ? specialValues : null,
            original: rangeStr,
        };
    }

    // Handle categorical values (e.g., "Y;N")
    if (rangeStr.includes(";")) {
        const values = rangeStr.split(";").map((v) => v.trim());
        return {
            type: "enum",
            values,
            original: rangeStr,
        };
    }

    return {
        type: "unknown",
        original: rangeStr,
    };
}

/**
 * Check if a value falls within the expected range
 * @param {any} value - The value to validate
 * @param {object} range - The parsed range object
 * @returns {boolean} True if value is valid, false otherwise
 */
export function isValueInRange(value, range) {
    if (!range) return true;
    if (!value || value.toString().trim() === "") return true;

    // Convert value to string for initial processing
    const strValue = value.toString().trim();

    switch (range.type) {
        case "range": {
            // Convert special values to numbers for comparison
            const numValue = Number(strValue);

            // Special values check first (-777, -999 etc)
            if (range.values) {
                const specialNums = range.values.map((v) => Number(v));
                if (specialNums.includes(numValue)) {
                    return true;
                }
            }

            // Then check numeric range
            return (
                !isNaN(numValue) &&
                numValue >= range.min &&
                numValue <= range.max
            );
        }
        case "enum":
            return range.values.includes(strValue);
        default:
            return true;
    }
}


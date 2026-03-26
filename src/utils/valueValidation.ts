/**
 * Value range parsing and validation utilities
 */

import type { ParsedValueRange } from "@/types";

/**
 * Parse a value range string into a structured object
 */
export function parseValueRange(rangeStr: string): ParsedValueRange | null {
  if (!rangeStr) return null;

  // Handle numeric ranges with special values (e.g., "0::9999; -777; -999")
  if (rangeStr.includes("::")) {
    const parts = rangeStr.split(";").map((p) => p.trim());
    const rangePart = parts.find((p) => p.includes("::"))!;
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
 */
export function isValueInRange(value: unknown, range: ParsedValueRange | null): boolean {
  if (!range) return true;
  if (!value || String(value).trim() === "") return true;

  const strValue = String(value).trim();

  switch (range.type) {
    case "range": {
      const numValue = Number(strValue);

      if (range.values) {
        const specialNums = range.values.map((v) => Number(v));
        if (specialNums.includes(numValue)) {
          return true;
        }
      }

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

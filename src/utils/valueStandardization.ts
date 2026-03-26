/**
 * Value standardization utilities for NDA data formats
 */

/**
 * Standardize handedness values to NDA format (L, R, B)
 */
export function standardizeHandedness(value: unknown): string {
  const handednessMap: Record<string, string> = {
    left: "L",
    l: "L",
    right: "R",
    r: "R",
    both: "B",
    ambidextrous: "B",
  };

  const lowerValue = String(value ?? "").toLowerCase();
  return handednessMap[lowerValue] ?? String(value ?? "");
}

/**
 * Standardize boolean values to numeric format (0, 1)
 */
export function standardizeBinary(value: unknown): string {
  const binaryMap: Record<string, string> = {
    true: "1",
    false: "0",
    t: "1",
    f: "0",
    TRUE: "1",
    FALSE: "0",
    True: "1",
    False: "0",
  };

  const strValue = String(value ?? "");

  // Try direct match first
  if (strValue in binaryMap) return binaryMap[strValue];

  // Try lowercase match
  const lowerValue = strValue.toLowerCase();
  return binaryMap[lowerValue] ?? strValue;
}

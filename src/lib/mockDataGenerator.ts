import "server-only";
import { v4 as uuidv4 } from "uuid";
import type { DataElement, DataStructure, MockDataset } from "@/types";

// Special NDA missing-data codes
const SPECIAL_VALUES = [-777, -999];
const SPECIAL_VALUE_PROBABILITY = 0.04; // 4% chance of a special value

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): number {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

function parseValueRange(valueRange: string): {
  type: "range" | "enum" | "unknown";
  min?: number;
  max?: number;
  values?: string[];
} {
  if (!valueRange || valueRange.trim() === "") return { type: "unknown" };

  // Split on semicolons to get all parts
  const parts = valueRange
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  // Check if any part is a numeric range (e.g., "0::27")
  const rangePart = parts.find((p) => p.includes("::"));
  if (rangePart) {
    const [minStr, maxStr] = rangePart.split("::");
    const min = parseFloat(minStr.trim());
    const max = parseFloat(maxStr.trim());
    if (!isNaN(min) && !isNaN(max)) {
      return { type: "range", min, max };
    }
  }

  // Check for enum values (non-range parts that look like categories)
  // e.g., "M; F; O" or "Yes; No"
  const nonRangeParts = parts.filter((p) => !p.includes("::"));
  if (nonRangeParts.length >= 2) {
    // Check if these look like categorical values (not all numbers with special meaning)
    const isEnum = nonRangeParts.some((p) => {
      const n = parseFloat(p);
      return isNaN(n) || !SPECIAL_VALUES.includes(n);
    });
    if (isEnum) {
      return {
        type: "enum",
        values: nonRangeParts.map((p) => {
          // Handle "value = label" format — extract just the value
          return p.split("=")[0].trim();
        }),
      };
    }
  }

  return { type: "unknown" };
}

function generateValueForElement(element: DataElement): unknown {
  // Special values with low probability
  if (Math.random() < SPECIAL_VALUE_PROBABILITY) {
    return SPECIAL_VALUES[Math.floor(Math.random() * SPECIAL_VALUES.length)];
  }

  const valueRange = element.valueRange ?? "";
  const parsed = parseValueRange(valueRange);
  const isFloat =
    element.type?.toLowerCase() === "float" ||
    element.type?.toLowerCase() === "double";

  if (parsed.type === "range" && parsed.min !== undefined && parsed.max !== undefined) {
    return isFloat
      ? randomFloat(parsed.min, parsed.max)
      : randomInt(parsed.min, parsed.max);
  }

  if (parsed.type === "enum" && parsed.values && parsed.values.length > 0) {
    return parsed.values[Math.floor(Math.random() * parsed.values.length)];
  }

  // Fallback by type
  const typeLower = (element.type ?? "").toLowerCase();
  if (typeLower === "integer" || typeLower === "int") {
    return randomInt(0, 100);
  }
  if (typeLower === "float" || typeLower === "double") {
    return randomFloat(0, 100);
  }
  if (typeLower === "string" || typeLower === "text") {
    return "placeholder";
  }
  if (typeLower === "date") {
    const year = randomInt(2015, 2024);
    const month = String(randomInt(1, 12)).padStart(2, "0");
    const day = String(randomInt(1, 28)).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return randomInt(0, 10);
}

/**
 * Generate N synthetic rows for a DataStructure.
 * Always includes required NDA fields: subjectkey, src_subject_id, interview_age, sex.
 */
export function generateMockDataset(
  structure: DataStructure,
  n = 50
): MockDataset {
  const elements = structure.dataElements ?? [];

  // Build the schema — required fields first, then the rest
  const requiredFields = ["subjectkey", "src_subject_id", "interview_age", "sex"];
  const elementNames = elements.map((e) => e.name.toLowerCase());
  const missingRequired = requiredFields.filter(
    (f) => !elementNames.includes(f)
  );

  const syntheticRequiredElements: DataElement[] = missingRequired.map((f) => ({
    name: f,
    type:
      f === "interview_age"
        ? "integer"
        : f === "sex"
        ? "string"
        : "string",
    valueRange:
      f === "interview_age"
        ? "60::300"
        : f === "sex"
        ? "M;F"
        : "",
    description: `Required NDA field: ${f}`,
  }));

  const fullSchema = [...syntheticRequiredElements, ...elements];

  const sexOptions = ["M", "F"];
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < n; i++) {
    const row: Record<string, unknown> = {};

    // Always generate required fields deterministically
    row["subjectkey"] = `NDAR_${uuidv4().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    row["src_subject_id"] = `SUBJ${String(i + 1).padStart(4, "0")}`;
    row["interview_age"] = randomInt(60, 300); // age in months
    row["sex"] = sexOptions[Math.floor(Math.random() * sexOptions.length)];

    // Generate values for other elements
    for (const element of elements) {
      const nameLower = element.name.toLowerCase();
      if (requiredFields.includes(nameLower)) {
        // Already generated above
        row[element.name] = row[nameLower];
        continue;
      }
      row[element.name] = generateValueForElement(element);
    }

    rows.push(row);
  }

  return { rows, schema: fullSchema, structure };
}

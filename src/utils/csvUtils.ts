/**
 * CSV parsing utilities
 */

/**
 * Parse a CSV line properly handling quoted values
 */
export function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let currentCell = "";
  let isInQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // If we see a quote right after a quote, it's an escaped quote
      if (i + 1 < line.length && line[i + 1] === '"') {
        currentCell += '"';
        i++; // Skip next quote
        continue;
      }
      // Toggle quote state
      isInQuotes = !isInQuotes;
      continue;
    }

    if (char === "," && !isInQuotes) {
      // End of cell
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  // Push the last cell
  cells.push(currentCell.trim());

  return cells;
}

/**
 * Parse CSV text into rows
 */
export function parseCSV(text: string): string[][] {
  const lines = text.split("\n").filter((line) => line.trim());
  return lines.map((line) => parseCSVLine(line));
}

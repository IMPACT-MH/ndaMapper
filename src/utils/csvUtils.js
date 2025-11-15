/**
 * CSV parsing utilities
 */

/**
 * Parse a CSV line properly handling quoted values
 * @param {string} line - The CSV line to parse
 * @returns {string[]} Array of cell values
 */
export function parseCSVLine(line) {
    const cells = [];
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
 * @param {string} text - CSV text content
 * @returns {string[][]} Array of rows, each row is an array of cells
 */
export function parseCSV(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    return lines.map((line) => parseCSVLine(line));
}


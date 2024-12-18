"use client";

import { useState, useEffect } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle } from "lucide-react";

// Helper function to standardize handedness values
const standardizeHandedness = (value) => {
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
};

// Helper function to standardize boolean values to numeric
const standardizeBinary = (value) => {
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
};

const CSVValidator = ({
    dataElements,
    onStructureSearch,
    initialCsvFile = null,
    initialHeaders = null,
    structureShortName = null,
    onHeadersChange = null, // CSV headers from validation get passed to the table
}) => {
    const [validationResults, setValidationResults] = useState(null);
    const [isValidating, setIsValidating] = useState(false);
    const [currentFile, setCurrentFile] = useState(initialCsvFile);
    const [selectedMappings, setSelectedMappings] = useState({});
    const [ignoredFields, setIgnoredFields] = useState(new Set());
    const [csvContent, setCsvContent] = useState(null);
    const [valueErrors, setValueErrors] = useState([]);
    const [transformationCounts, setTransformationCounts] = useState({
        handedness: 0,
        binary: 0,
    });

    // Initial standardization before validation
    const standardizeValues = (headers, rows) => {
        let handednessCount = 0;
        let binaryCount = 0;

        // First standardize the values
        const standardizedRows = rows.map((row, rowIndex) => {
            if (rowIndex === 0) return row; // Skip header

            return row.map((value, colIndex) => {
                const header = headers[colIndex];

                // Always standardize handedness
                if (header === "handedness") {
                    const standardized = standardizeHandedness(value);
                    if (standardized !== value) {
                        console.log(
                            `Standardized handedness: ${value} -> ${standardized}`
                        );
                        handednessCount++;
                    }
                    return standardized;
                }

                // For boolean/binary fields
                if (header.endsWith("_flag") || header.includes("boolean")) {
                    const standardized = standardizeBinary(value);
                    if (standardized !== value) {
                        console.log(
                            `Standardized boolean: ${value} -> ${standardized}`
                        );
                        binaryCount++;
                    }
                    return standardized;
                }

                return value;
            });
        });

        setTransformationCounts({
            handedness: handednessCount,
            binary: binaryCount,
        });

        return standardizedRows;
    };

    useEffect(() => {
        if (initialCsvFile && dataElements) {
            validateCSV(initialCsvFile);
            setCurrentFile(initialCsvFile);
        }
    }, [initialCsvFile, dataElements]);

    const calculateSimilarity = (str1, str2) => {
        const track = Array(str2.length + 1)
            .fill(null)
            .map(() => Array(str1.length + 1).fill(null));
        for (let i = 0; i <= str1.length; i += 1) {
            track[0][i] = i;
        }
        for (let j = 0; j <= str2.length; j += 1) {
            track[j][0] = j;
        }
        for (let j = 1; j <= str2.length; j += 1) {
            for (let i = 1; i <= str1.length; i += 1) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                track[j][i] = Math.min(
                    track[j][i - 1] + 1,
                    track[j - 1][i] + 1,
                    track[j - 1][i - 1] + indicator
                );
            }
        }
        return (
            1 -
            track[str2.length][str1.length] / Math.max(str1.length, str2.length)
        );
    };

    const findSimilarFields = (field) => {
        const allFields = dataElements.map((el) => ({
            name: el.name,
            aliases: el.aliases || [],
        }));

        // First do exact matches with 100% similarity
        const exactMatches = allFields
            .filter((el) => el.name === field || el.aliases.includes(field))
            .map((el) => ({
                name: el.name,
                similarity: 1,
                aliases: el.aliases,
            }));

        if (exactMatches.length > 0) return exactMatches;

        // Only if no exact matches, try Levenshtein
        return allFields
            .map((el) => ({
                name: el.name,
                similarity: Math.max(
                    calculateSimilarity(field, el.name),
                    ...el.aliases.map((alias) =>
                        calculateSimilarity(field, alias)
                    )
                ),
                aliases: el.aliases,
            }))
            .filter((item) => item.similarity > 0.6 && item.name !== field)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);
    };
    const parseValueRange = (rangeStr) => {
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
    };

    const isValueInRange = (value, range) => {
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
    };

    const validateValues = (headers, rows, mappings) => {
        const errors = [];
        const valueRanges = {};

        // Pre-process all value ranges
        dataElements.forEach((element) => {
            if (element.valueRange) {
                valueRanges[element.name] = parseValueRange(element.valueRange);
            }
        });

        // First standardize the values
        let standardizedRows = rows.map((row, rowIndex) => {
            if (rowIndex === 0) return row; // Skip header
            return row.map((value, colIndex) => {
                const header = headers[colIndex];
                const mappedField = mappings[header] || header;
                const range = valueRanges[mappedField];

                // Standardize based on field type
                if (
                    range?.values?.includes("R") &&
                    range?.values?.includes("L")
                ) {
                    return standardizeHandedness(value);
                }
                if (
                    range?.values?.includes("0") &&
                    range?.values?.includes("1")
                ) {
                    return standardizeBinary(value);
                }
                return value;
            });
        });

        // Then validate
        standardizedRows.slice(1).forEach((row, rowIndex) => {
            headers.forEach((header, colIndex) => {
                const value = row[colIndex];
                const mappedField = mappings[header] || header;
                const range = valueRanges[mappedField];

                if (range && !isValueInRange(value, range)) {
                    errors.push({
                        row: rowIndex + 2,
                        column: header,
                        mappedField,
                        value,
                        expectedRange: range.original,
                    });
                }
            });
        });

        return errors;
    };

    const handleMappingChange = (originalField, mappedField) => {
        setSelectedMappings((prev) => {
            const newMappings = { ...prev };
            if (mappedField) {
                newMappings[originalField] = mappedField;
            } else {
                delete newMappings[originalField];
            }
            return newMappings;
        });

        setValidationResults((prev) => ({
            ...prev,
            validFields: prev.validFields + (mappedField ? 1 : -1),
            unknownFields: prev.unknownFields.filter(
                (f) => f !== originalField
            ),
        }));
    };

    const handleIgnoreField = (field) => {
        setIgnoredFields((prev) => {
            const newIgnored = new Set(prev);
            if (newIgnored.has(field)) {
                newIgnored.delete(field);
            } else {
                newIgnored.add(field);
            }
            return newIgnored;
        });

        setValidationResults((prev) => ({
            ...prev,
            totalFields: prev.totalFields + (ignoredFields.has(field) ? 1 : -1),
            // Remove the line that was modifying validFields
        }));
    };

    // Modify downloadSubmissionTemplate to use standardized values
    const downloadSubmissionTemplate = () => {
        if (!csvContent) return;

        // Filter out ignored columns and get remaining headers
        const validHeaders = csvContent[0].filter(
            (header) => !ignoredFields.has(header)
        );

        // For each row, only include columns that aren't ignored
        const validData = csvContent.map((row) =>
            row.filter((_, index) => !ignoredFields.has(csvContent[0][index]))
        );

        // Create CSV with single shortName in first row, then headers, then data
        const newCSV = [
            structureShortName || "", // Single value in first row
            validHeaders.join(","), // Headers as second row
            ...validData.slice(1).map((row) => row.join(",")), // Data rows
        ].join("\n");

        const blob = new Blob([newCSV], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${structureShortName}_template.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    // Helper function to parse CSV lines properly handling quotes
    const parseCSVLine = (line) => {
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
    };

    const validateCSV = async (file) => {
        setCurrentFile(file);
        setIsValidating(true);
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const lines = text.split("\n").filter((line) => line.trim());

                // Parse each line properly handling quotes
                const rows = lines.map((line) => parseCSVLine(line));

                // Check if first row is a shortname (single value, no commas)
                const firstRow = rows[0];
                const isSubmissionTemplate = firstRow.length === 1;

                // Get the actual headers row based on file format
                const headers = isSubmissionTemplate ? rows[1] : rows[0];

                // Call the callback with the headers
                if (onHeadersChange) {
                    onHeadersChange(headers);
                }

                // If this is a submission template and we have an expected shortname
                if (
                    isSubmissionTemplate &&
                    structureShortName &&
                    firstRow[0] !== structureShortName
                ) {
                    setValidationResults({
                        error: `Unexpected structure shortname. Found "${firstRow[0]}", expected "${structureShortName}"`,
                    });
                    setIsValidating(false);
                    return;
                }

                // For submission templates, exclude the shortname row from data rows
                const dataRows = isSubmissionTemplate
                    ? rows.slice(2)
                    : rows.slice(1);

                // Standardize values before validation
                const standardizedRows = standardizeValues(headers, [
                    headers,
                    ...dataRows,
                ]);
                setCsvContent(standardizedRows);

                if (dataElements) {
                    const requiredFields = dataElements
                        .filter((el) => el.required === "Required")
                        .map((el) => el.name);

                    const recommendedFields = dataElements
                        .filter((el) => el.required === "Recommended")
                        .map((el) => el.name);

                    const missingRequired = requiredFields.filter(
                        (field) => !headers.includes(field)
                    );
                    const missingRecommended = recommendedFields.filter(
                        (field) => !headers.includes(field)
                    );
                    const unknownFields = headers.filter(
                        (header) =>
                            !requiredFields.includes(header) &&
                            !recommendedFields.includes(header)
                    );

                    const valueValidationErrors = validateValues(
                        headers,
                        [headers, ...dataRows],
                        selectedMappings
                    );
                    setValueErrors(valueValidationErrors);

                    const suggestions = unknownFields.map((field) => ({
                        field,
                        similarFields: findSimilarFields(field),
                    }));

                    const results = {
                        totalFields: headers.length,
                        validFields: headers.filter(
                            (h) =>
                                requiredFields.includes(h) ||
                                recommendedFields.includes(h)
                        ).length,
                        missingRequired,
                        missingRecommended,
                        unknownFields,
                        suggestions: suggestions.filter(
                            (s) => s.similarFields.length > 0
                        ),
                        // Separate validity checks
                        hasAllRequiredFields: missingRequired.length === 0,
                        hasValidRanges: valueValidationErrors.length === 0,
                        isValid:
                            missingRequired.length === 0 &&
                            unknownFields.filter((f) => !ignoredFields.has(f))
                                .length === 0 &&
                            valueValidationErrors.length === 0,
                        headers,
                        valueErrors: valueValidationErrors,
                        transformations: transformationCounts,
                        isSubmissionTemplate,
                        detectedShortname: isSubmissionTemplate
                            ? firstRow[0]
                            : null,
                    };

                    setValidationResults(results);
                }
            } catch (error) {
                console.error("Validation error:", error);
                setValidationResults({
                    error: "Failed to parse CSV file. Please ensure it's properly formatted.",
                });
            } finally {
                setIsValidating(false);
            }
        };

        reader.onerror = () => {
            setValidationResults({
                error: "Failed to read file. Please try again.",
            });
            setIsValidating(false);
        };

        reader.readAsText(file);
    };

    useEffect(() => {
        if (csvContent && dataElements) {
            const valueValidationErrors = validateValues(
                csvContent[0],
                csvContent,
                selectedMappings
            );
            setValueErrors(valueValidationErrors);
            setValidationResults((prev) =>
                prev ? { ...prev, valueErrors: valueValidationErrors } : null
            );
        }
    }, [selectedMappings]);

    const renderTransformationSummary = () => {
        const { handedness, binary } = validationResults.transformations;
        const unfixableValues = valueErrors.reduce((acc, error) => {
            // Group by field and value to get unique problems
            const key = `${error.column}_${error.value}`;
            if (!acc[key]) {
                acc[key] = {
                    field: error.column,
                    value: error.value,
                    count: 1,
                };
            } else {
                acc[key].count++;
            }
            return acc;
        }, {});

        // Only show if we have any transformations or unfixable values
        if (
            handedness === 0 &&
            binary === 0 &&
            Object.keys(unfixableValues).length === 0
        )
            return null;

        return (
            <div className="bg-gray-50 p-4 rounded">
                <h4 className="font-medium text-gray-800 mb-2">
                    Data Validation Summary
                </h4>
                <div className="space-y-1">
                    {/* Show successful transformations */}
                    {handedness > 0 && (
                        <p className="text-green-700">
                            ✓ Standardized {handedness} handedness values to NDA
                            format
                        </p>
                    )}
                    {binary > 0 && (
                        <p className="text-green-700">
                            ✓ Converted {binary} boolean values to 0/1 format
                        </p>
                    )}

                    {/* Show values that couldn't be automatically fixed */}
                    {Object.values(unfixableValues).map(
                        ({ field, value, count }) => (
                            <p
                                key={`${field}_${value}`}
                                className="text-orange-700"
                            >
                                ⚠ Found {count} instances of invalid value "
                                {value}" in {field}
                            </p>
                        )
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Validate CSV</h3>
                {validationResults && !validationResults.error && (
                    <div className="flex items-center space-x-2">
                        {validationResults.hasAllRequiredFields &&
                        validationResults.hasValidRanges &&
                        validationResults.totalFields ===
                            validationResults.validFields ? (
                            <div className="flex items-center text-green-600">
                                <CheckCircle className="w-5 h-5 mr-2" />
                                <span className="font-medium">
                                    CSV is valid!
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center text-red-600">
                                <XCircle className="w-5 h-5 mr-2" />
                                <span className="font-medium">
                                    {validationResults.unknownFields.length > 0
                                        ? "Unknown fields need mapping"
                                        : !validationResults.hasValidRanges
                                        ? "Invalid values detected"
                                        : "Missing required fields"}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                    type="file"
                    accept=".csv"
                    onChange={(e) =>
                        e.target.files?.[0] && validateCSV(e.target.files[0])
                    }
                    className="hidden"
                    id="csv-upload"
                />
                <label
                    htmlFor="csv-upload"
                    className="cursor-pointer flex flex-col items-center space-y-2"
                >
                    {currentFile ? (
                        <>
                            <div className="flex items-center text-blue-600">
                                <CheckCircle className="w-6 h-6 mr-2" />
                                <span>{currentFile.name}</span>
                            </div>
                            <span className="text-sm text-gray-500">
                                Click to upload a different file
                            </span>
                        </>
                    ) : (
                        <>
                            <Upload className="w-8 h-8 text-gray-400" />
                            <span className="text-sm text-gray-600">
                                Click to upload or drag and drop your CSV file
                            </span>
                            <span className="text-xs text-gray-500">
                                CSV files only
                            </span>
                        </>
                    )}
                </label>
            </div>

            {validationResults?.isSubmissionTemplate && (
                <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                        <h4 className="font-medium text-blue-700">
                            Submission Template Detected
                        </h4>
                        <p className="text-blue-600 text-sm mt-1">
                            Found structure shortname in first row:{" "}
                            <span className="font-mono">
                                {validationResults.detectedShortname}
                            </span>
                        </p>
                    </div>
                </div>
            )}

            {isValidating && (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-sm text-gray-600 mt-2">
                        Validating CSV...
                    </p>
                </div>
            )}

            {validationResults && !validationResults.error && (
                <div className="space-y-4">
                    {/* <div className="flex items-center space-x-2">
                        {validationResults.hasAllRequiredFields &&
                        validationResults.hasValidRanges &&
                        validationResults.totalFields ===
                            validationResults.validFields ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <span className="font-medium">
                            {validationResults.hasAllRequiredFields &&
                            validationResults.hasValidRanges &&
                            validationResults.totalFields ===
                                validationResults.validFields
                                ? "CSV is valid!"
                                : validationResults.unknownFields.length > 0
                                ? "CSV has unknown fields that need to be removed or mapped."
                                : !validationResults.hasValidRanges
                                ? "CSV contains values outside allowed ranges."
                                : "CSV is missing required fields."}
                        </span>
                    </div> */}

                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gray-50 p-4 rounded">
                            <div className="text-sm text-gray-600">
                                Total Fields
                            </div>
                            <div className="text-2xl font-semibold">
                                {validationResults.totalFields}
                            </div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded">
                            <div className="text-sm text-gray-600">
                                Valid Fields
                            </div>
                            <div className="text-2xl font-semibold">
                                {validationResults.validFields}
                            </div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded">
                            <div className="text-sm text-gray-600">
                                Unknown Fields
                            </div>
                            <div className="text-2xl font-semibold">
                                {
                                    validationResults.unknownFields.filter(
                                        (field) => !ignoredFields.has(field)
                                    ).length
                                }
                            </div>
                        </div>
                    </div>

                    {renderTransformationSummary()}

                    {valueErrors.length > 0 && (
                        <div className="bg-orange-50 p-4 rounded">
                            <h4 className="font-medium text-orange-800 mb-2 flex items-center">
                                <AlertCircle className="w-5 h-5 mr-2" />
                                Value Range Violations ({valueErrors.length})
                            </h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {valueErrors.map((error, index) => (
                                    <div
                                        key={index}
                                        className="bg-orange-100 p-3 rounded text-sm"
                                    >
                                        <div className="font-medium text-orange-900">
                                            Row {error.row}, Column &quot;
                                            {error.column}&quot;
                                            {error.mappedField !==
                                                error.column &&
                                                ` (mapped to "${error.mappedField}")`}
                                        </div>
                                        <div className="text-orange-800">
                                            Value &quot;{error.value}&quot; is
                                            outside expected range:{" "}
                                            {error.expectedRange}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {validationResults.missingRequired.length > 0 && (
                        <div className="bg-red-50 p-4 rounded">
                            <h4 className="font-medium text-red-800 mb-2">
                                Missing Required Fields
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {validationResults.missingRequired.map(
                                    (field) => (
                                        <span
                                            key={field}
                                            className="bg-red-100 text-red-800 text-sm px-2 py-1 rounded"
                                        >
                                            {field}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                    {validationResults.suggestions?.length > 0 &&
                        validationResults.suggestions.filter(
                            ({ field }) => !ignoredFields.has(field)
                        ).length > 0 && (
                            <div className="bg-blue-50 p-4 rounded">
                                <h4 className="font-medium text-blue-800 mb-2">
                                    Suggested Field Mappings
                                </h4>
                                <div className="space-y-2">
                                    {validationResults.suggestions
                                        .filter(
                                            ({ field }) =>
                                                !ignoredFields.has(field)
                                        )
                                        .map(({ field, similarFields }) => (
                                            <div
                                                key={field}
                                                className="bg-blue-100 p-3 rounded"
                                            >
                                                <p className="text-blue-800 font-mono mb-1">
                                                    {field}
                                                </p>
                                                <div className="pl-4 space-y-1">
                                                    {similarFields.map(
                                                        (similar) => (
                                                            <div
                                                                key={
                                                                    similar.name
                                                                }
                                                                className="flex items-center justify-between"
                                                            >
                                                                <div className="flex items-center">
                                                                    <input
                                                                        type="radio"
                                                                        name={`mapping-${field}`}
                                                                        id={`map-${field}-${similar.name}`}
                                                                        checked={
                                                                            selectedMappings[
                                                                                field
                                                                            ] ===
                                                                            similar.name
                                                                        }
                                                                        onChange={() =>
                                                                            handleMappingChange(
                                                                                field,
                                                                                similar.name
                                                                            )
                                                                        }
                                                                        className="mr-2"
                                                                    />
                                                                    <label
                                                                        htmlFor={`map-${field}-${similar.name}`}
                                                                        className="flex items-center"
                                                                    >
                                                                        <span className="text-blue-600 font-mono">
                                                                            →{" "}
                                                                            {
                                                                                similar.name
                                                                            }
                                                                        </span>
                                                                        <span className="text-blue-500 text-sm ml-2">
                                                                            (
                                                                            {Math.round(
                                                                                similar.similarity *
                                                                                    100
                                                                            )}
                                                                            %
                                                                            match)
                                                                        </span>
                                                                    </label>
                                                                </div>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                    {validationResults.unknownFields.length > 0 && (
                        <div className="bg-gray-50 p-4 rounded">
                            <h4 className="font-medium text-gray-800 mb-2">
                                Unknown Fields
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {validationResults.unknownFields
                                    .filter((field) => !selectedMappings[field])
                                    .map((field) => (
                                        <span
                                            key={field}
                                            className={`
                            bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded
                            cursor-pointer transition-colors
                            ${
                                ignoredFields.has(field)
                                    ? "opacity-50 line-through"
                                    : ""
                            }
                        `}
                                            onClick={() =>
                                                handleIgnoreField(field)
                                            }
                                            title={
                                                ignoredFields.has(field)
                                                    ? "Click to un-ignore"
                                                    : "Click to ignore"
                                            }
                                        >
                                            {field}
                                        </span>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Download button */}
                    <div className="mt-4 pt-4 border-t">
                        <button
                            onClick={downloadSubmissionTemplate}
                            disabled={false} // Remove mapping check since ignored fields are valid
                            className="px-4 py-2 rounded text-white bg-blue-500 hover:bg-blue-600"
                        >
                            Download Submission Template{" "}
                            {valueErrors.length > 0
                                ? `(${valueErrors.length} value errors)`
                                : ""}
                        </button>
                        {valueErrors.length > 0 && (
                            <p className="mt-2 text-sm text-orange-600">
                                Warning: The CSV contains values that don&apos;t
                                match the expected ranges.
                            </p>
                        )}
                    </div>

                    {/* {validationResults.missingRecommended.length > 0 && (
                        <div className="bg-yellow-50 p-4 rounded">
                            <h4 className="font-medium text-yellow-800 mb-2">
                                Missing Recommended Fields
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {validationResults.missingRecommended.map(
                                    (field) => (
                                        <span
                                            key={field}
                                            className="bg-yellow-100 text-yellow-800 text-sm px-2 py-1 rounded"
                                        >
                                            {field}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>
                    )} */}
                </div>
            )}

            {validationResults?.error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {validationResults.error}
                </div>
            )}
        </div>
    );
};

export default CSVValidator;

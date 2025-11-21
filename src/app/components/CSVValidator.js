"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import {
    standardizeHandedness,
    standardizeBinary,
} from "@/utils/valueStandardization";
import { parseValueRange, isValueInRange } from "@/utils/valueValidation";
import { parseCSVLine } from "@/utils/csvUtils";

const CSVValidator = ({
    dataElements,
    onStructureSearch,
    initialCsvFile = null,
    initialHeaders = null,
    structureShortName = null,
    onHeadersChange = null, // CSV headers from validation get passed to the table
    // New state props
    validatorState = {
        selectedMappings: {},
        setSelectedMappings: () => {},
        ignoredFields: new Set(),
        setIgnoredFields: () => {},
        validationResults: null,
        setValidationResults: () => {},
        valueErrors: [],
        setValueErrors: () => {},
        transformationCounts: { handedness: 0, binary: 0 },
        setTransformationCounts: () => {},
    },
    onFileChange, // New prop to handle file changes
}) => {
    const [isValidating, setIsValidating] = useState(false);
    const [currentFile, setCurrentFile] = useState(initialCsvFile);
    const [csvContent, setCsvContent] = useState(null);

    // Use state from props instead of local state
    const {
        selectedMappings,
        setSelectedMappings,
        ignoredFields,
        setIgnoredFields,
        validationResults,
        setValidationResults,
        valueErrors,
        setValueErrors,
        transformationCounts,
        setTransformationCounts,
    } = validatorState;

    // Initial standardization before validation
    const standardizeValues = useCallback((headers, rows) => {
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
    }, [setTransformationCounts]);

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

    const findSimilarFields = useCallback((field) => {
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

        return allFields
            .map((el) => {
                // Split target field into parts
                const targetParts = el.name.split("_");

                // For exact matches at start or end
                if (
                    el.name === field ||
                    el.name.endsWith(field) ||
                    el.name.startsWith(field)
                ) {
                    return {
                        name: el.name,
                        similarity: 1,
                        aliases: el.aliases,
                    };
                }

                return {
                    name: el.name,
                    similarity: 0, // Default to no match
                    aliases: el.aliases,
                };
            })
            .filter((item) => {
                // Skip exact matches
                if (item.name === field) return false;

                // Only keep perfect matches
                return item.similarity > 0.95;
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);
    }, [dataElements]);

    const validateValues = useCallback((headers, rows, mappings) => {
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
    }, [dataElements]);

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

        // Get original headers and their indices
        const headers = csvContent[0];

        // Create a mapping of column index to mapped header name
        const headerMapping = {};
        headers.forEach((header, index) => {
            // If there's a mapping for this header, use it; otherwise use original
            headerMapping[index] = selectedMappings[header] || header;
        });

        // Filter out ignored columns and apply mappings to headers
        const validHeaderIndices = headers
            .map((_, index) => index)
            .filter((index) => !ignoredFields.has(headers[index]));

        const transformedHeaders = validHeaderIndices.map(
            (index) => headerMapping[index]
        );

        // For each data row, filter ignored columns (keeping order aligned with headers)
        const validData = csvContent
            .slice(1)
            .map((row) => validHeaderIndices.map((index) => row[index]));

        // Create CSV with shortName in first row, then mapped headers, then data
        const newCSV = [
            `${(structureShortName || "").slice(0, -2)},${(
                structureShortName || ""
            ).slice(-2)}`,
            transformedHeaders.join(","),
            ...validData.map((row) => row.join(",")),
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

    const validateCSV = useCallback(async (file) => {
        setCurrentFile(file);
        if (onFileChange) {
            onFileChange(file); // Propagate file change up
        }
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
                // Check if first row follows shortname,version format
                const isSubmissionTemplate =
                    firstRow.length <= 2 &&
                    firstRow.every((cell) => cell.trim() !== "");

                // Get the actual headers row based on file format
                const headers = isSubmissionTemplate ? rows[1] : rows[0];

                // Call the callback with the headers
                if (onHeadersChange) {
                    onHeadersChange(headers);
                }

                // If this is a submission template and we have an expected shortname
                if (isSubmissionTemplate && structureShortName) {
                    // Get the base name (e.g., "demographics" from "demographics02")
                    const expectedBaseName = structureShortName.replace(
                        /\d+$/,
                        ""
                    );

                    // Get the actual base name and version from the CSV
                    const [actualBaseName, actualVersion] = firstRow;

                    // Check if the base name matches and version is a number
                    if (
                        !actualBaseName.startsWith(expectedBaseName) ||
                        !/^\d+$/.test(actualVersion)
                    ) {
                        setValidationResults({
                            error: `Invalid structure shortname. Found "${actualBaseName},${actualVersion}". Should be "${expectedBaseName}" followed by a version number`,
                        });
                        setIsValidating(false);
                        return;
                    }
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
    }, [dataElements, selectedMappings, ignoredFields, transformationCounts, structureShortName, onHeadersChange, onFileChange, standardizeValues, validateValues, findSimilarFields, setValidationResults, setValueErrors]);

    useEffect(() => {
        if (initialCsvFile && dataElements) {
            validateCSV(initialCsvFile);
            setCurrentFile(initialCsvFile);
        }
    }, [initialCsvFile, dataElements, validateCSV]);

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
    }, [csvContent, dataElements, selectedMappings, validateValues, setValueErrors, setValidationResults]);

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
                                ⚠ Found {count} instances of invalid value &quot;
                                {value}&quot; in {field}
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

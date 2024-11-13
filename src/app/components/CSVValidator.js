"use client";

import { useState, useEffect } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const CSVValidator = ({
    dataElements,
    onStructureSearch,
    initialCsvFile = null,
    initialHeaders = null,
}) => {
    const [validationResults, setValidationResults] = useState(null);
    const [isValidating, setIsValidating] = useState(false);
    const [currentFile, setCurrentFile] = useState(initialCsvFile);
    const [selectedMappings, setSelectedMappings] = useState({});
    const [ignoredFields, setIgnoredFields] = useState(new Set());
    const [csvContent, setCsvContent] = useState(null);
    const [valueErrors, setValueErrors] = useState([]);

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

        const similarities = allFields
            .map((el) => ({
                name: el.name,
                similarity: Math.max(
                    calculateSimilarity(
                        field.toLowerCase(),
                        el.name.toLowerCase()
                    ),
                    ...el.aliases.map((alias) =>
                        calculateSimilarity(
                            field.toLowerCase(),
                            alias.toLowerCase()
                        )
                    )
                ),
                aliases: el.aliases,
            }))
            .filter((item) => item.similarity > 0.6 && item.name !== field)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);

        return similarities;
    };

    const parseValueRange = (rangeStr) => {
        if (!rangeStr) return null;

        if (rangeStr.includes("::")) {
            const [min, max] = rangeStr.split("::").map(Number);
            return { type: "range", min, max, original: rangeStr };
        }

        if (rangeStr.includes(";")) {
            const values = rangeStr.split(";").map((v) => v.trim());
            return { type: "enum", values, original: rangeStr };
        }

        return { type: "unknown", original: rangeStr };
    };

    const isValueInRange = (value, range) => {
        if (!range) return true;
        if (!value || value.toString().trim() === "") return true;

        switch (range.type) {
            case "range":
                const numValue = Number(value);
                return (
                    !isNaN(numValue) &&
                    numValue >= range.min &&
                    numValue <= range.max
                );
            case "enum":
                return range.values.includes(value.toString().trim());
            default:
                return true;
        }
    };

    const validateValues = (headers, rows, mappings) => {
        const errors = [];
        const valueRanges = {};

        dataElements.forEach((element) => {
            if (element.valueRange) {
                valueRanges[element.name] = parseValueRange(element.valueRange);
            }
        });

        rows.slice(1).forEach((row, rowIndex) => {
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
            validFields: prev.validFields + (ignoredFields.has(field) ? -1 : 1),
        }));
    };

    const downloadMappedCSV = () => {
        if (!csvContent) return;

        const originalHeaders = csvContent[0];
        const mappedHeaders = originalHeaders.map(
            (header) => selectedMappings[header] || header
        );

        const newCSV = [mappedHeaders, ...csvContent.slice(1)]
            .map((row) => row.join(","))
            .join("\n");

        const blob = new Blob([newCSV], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mapped_data.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const validateCSV = async (file) => {
        setIsValidating(true);
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const rows = text
                    .split("\n")
                    .filter((row) => row.trim())
                    .map((row) => row.split(",").map((cell) => cell.trim()));

                setCsvContent(rows);
                const headers = rows[0];

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
                        rows,
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
                        isValid:
                            missingRequired.length === 0 &&
                            unknownFields.length === 0,
                        headers,
                        valueErrors: valueValidationErrors,
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

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Validate CSV</h3>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span className="flex items-center">
                        <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
                        Required
                    </span>
                    <span className="flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1 text-yellow-500" />
                        Recommended
                    </span>
                </div>
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
                    <div className="flex items-center space-x-2">
                        {validationResults.isValid ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <span className="font-medium">
                            {validationResults.isValid
                                ? "CSV is valid! All required fields are present."
                                : "CSV is missing required fields."}
                        </span>
                    </div>
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
                                {validationResults.unknownFields.length}
                            </div>
                        </div>
                    </div>
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

                    {validationResults.suggestions?.length > 0 && (
                        <div className="bg-blue-50 p-4 rounded">
                            <h4 className="font-medium text-blue-800 mb-2">
                                Suggested Field Mappings
                            </h4>
                            <div className="space-y-2">
                                {validationResults.suggestions
                                    .filter(
                                        ({ field }) => !ignoredFields.has(field)
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
                                                            key={similar.name}
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
                                                                        % match)
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
                    {validationResults.missingRecommended.length > 0 && (
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
                    {/* Download button */}
                    <div className="mt-4 pt-4 border-t">
                        <button
                            onClick={downloadMappedCSV}
                            disabled={
                                Object.keys(selectedMappings).length === 0
                            }
                            className={`
            px-4 py-2 rounded text-white
            ${
                Object.keys(selectedMappings).length > 0
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-300 cursor-not-allowed"
            }
        `}
                        >
                            {Object.keys(selectedMappings).length > 0
                                ? `Download Mapped CSV ${
                                      valueErrors.length > 0
                                          ? `(${valueErrors.length} value errors)`
                                          : ""
                                  }`
                                : "Select field mappings to download"}
                        </button>
                        {valueErrors.length > 0 && (
                            <p className="mt-2 text-sm text-orange-600">
                                Warning: The CSV contains values that don&apos;t
                                match the expected ranges.
                            </p>
                        )}
                    </div>
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

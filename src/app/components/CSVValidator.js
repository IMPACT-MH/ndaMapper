"use client";

import { useState } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const CSVValidator = ({ dataElements }) => {
    const [validationResults, setValidationResults] = useState(null);
    const [isValidating, setIsValidating] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [structureSuggestions, setStructureSuggestions] = useState(null);

    // Calculate similarity between two strings (Levenshtein distance)
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

    // Find similar fields
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
            .filter((item) => item.similarity > 0.6 && item.name !== field) // Adjust threshold as needed
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);

        return similarities;
    };

    const validateCSV = async (file) => {
        setIsValidating(true);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split("\n");
                const headers = lines[0]
                    .trim()
                    .split(",")
                    .map((h) => h.trim());

                // Create map of required and recommended fields
                const requiredFields = dataElements
                    .filter((el) => el.required === "Required")
                    .map((el) => el.name);

                const recommendedFields = dataElements
                    .filter((el) => el.required === "Recommended")
                    .map((el) => el.name);

                // Validate headers
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

                // Find similar fields for unknown fields
                const suggestions = unknownFields.map((field) => ({
                    field,
                    similarFields: findSimilarFields(field),
                }));

                // Create validation results
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
                    isValid: missingRequired.length === 0,
                    headers,
                };

                setValidationResults(results);
            } catch (error) {
                console.error("Validation error:", error);
                setValidationResults({
                    error: "Failed to parse CSV file. Please ensure it's properly formatted.",
                });
            }
            setIsValidating(false);
        };

        reader.onerror = () => {
            setValidationResults({
                error: "Failed to read file. Please try again.",
            });
            setIsValidating(false);
        };

        reader.readAsText(file);
    };
    const findMatchingStructures = async (headers) => {
        setIsSearching(true);
        try {
            // Fetch all data structures
            const response = await fetch(
                "https://nda.nih.gov/api/datadictionary/v2/datastructure"
            );
            if (!response.ok)
                throw new Error("Failed to fetch data structures");
            const structures = await response.json();

            // For each structure, fetch its elements and calculate match score
            const structureScores = await Promise.all(
                structures.map(async (structure) => {
                    try {
                        const elementsResponse = await fetch(
                            `https://nda.nih.gov/api/datadictionary/datastructure/${structure.shortName}`
                        );
                        if (!elementsResponse.ok) return null;
                        const data = await elementsResponse.json();

                        // Calculate match score based on field similarity
                        let matchScore = 0;
                        let matchedFields = [];

                        headers.forEach((header) => {
                            const bestMatch = data.dataElements
                                .map((element) => ({
                                    fieldName: element.name,
                                    score: calculateSimilarity(
                                        header.toLowerCase(),
                                        element.name.toLowerCase()
                                    ),
                                    aliases: element.aliases || [],
                                }))
                                .reduce(
                                    (best, current) => {
                                        const aliasScore = current.aliases
                                            .map((alias) =>
                                                calculateSimilarity(
                                                    header.toLowerCase(),
                                                    alias.toLowerCase()
                                                )
                                            )
                                            .reduce(
                                                (max, score) =>
                                                    Math.max(max, score),
                                                0
                                            );
                                        const finalScore = Math.max(
                                            current.score,
                                            aliasScore
                                        );
                                        return finalScore > best.score
                                            ? { ...current, score: finalScore }
                                            : best;
                                    },
                                    { score: 0 }
                                );

                            if (bestMatch.score > 0.6) {
                                matchScore += bestMatch.score;
                                matchedFields.push({
                                    csvField: header,
                                    matchedField: bestMatch.fieldName,
                                    score: bestMatch.score,
                                });
                            }
                        });

                        // Calculate overall match percentage
                        const overallScore =
                            (matchScore / headers.length) * 100;

                        return {
                            structure,
                            score: overallScore,
                            matchedFields,
                            totalFields: data.dataElements.length,
                            matchedCount: matchedFields.length,
                        };
                    } catch (error) {
                        console.error(
                            `Error processing structure ${structure.shortName}:`,
                            error
                        );
                        return null;
                    }
                })
            );

            // Filter out nulls and sort by score
            const validScores = structureScores
                .filter((score) => score !== null && score.score > 30) // Adjust threshold as needed
                .sort((a, b) => b.score - a.score)
                .slice(0, 5); // Show top 5 matches

            setStructureSuggestions(validScores);
        } catch (error) {
            console.error("Structure search error:", error);
            setStructureSuggestions({
                error: "Failed to search for matching structures.",
            });
        } finally {
            setIsSearching(false);
        }
    };

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

            {/* File Upload */}
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
                    <Upload className="w-8 h-8 text-gray-400" />
                    <span className="text-sm text-gray-600">
                        Click to upload or drag and drop your CSV file
                    </span>
                    <span className="text-xs text-gray-500">
                        CSV files only
                    </span>
                </label>
            </div>

            {/* Validation Results */}
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
                                {validationResults.unknownFields.map(
                                    (field) => (
                                        <span
                                            key={field}
                                            className="bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded"
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
                                {validationResults.suggestions.map(
                                    ({ field, similarFields }) => (
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
                                                            className="flex items-center"
                                                        >
                                                            <span className="text-blue-600 font-mono">
                                                                → {similar.name}
                                                            </span>
                                                            <span className="text-blue-500 text-sm ml-2">
                                                                (
                                                                {Math.round(
                                                                    similar.similarity *
                                                                        100
                                                                )}
                                                                % match)
                                                            </span>
                                                            {similar.aliases
                                                                .length > 0 && (
                                                                <span className="text-blue-400 text-sm ml-2">
                                                                    (alias:{" "}
                                                                    {similar.aliases.join(
                                                                        ", "
                                                                    )}
                                                                    )
                                                                </span>
                                                            )}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    )}
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

"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

const CSVHeaderAnalyzer = ({ onStructureSelect }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const [headers, setHeaders] = useState(null);
    const [currentFile, setCurrentFile] = useState(null);

    const analyzeCSV = async (file) => {
        setCurrentFile(file); // Store the file
        setIsAnalyzing(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            // Inside analyzeCSV function
            // NOTE: This returns an array rather than JSON...lol NDA API
            try {
                // Parse CSV headers
                const text = e.target.result;
                const headers = text
                    .split("\n")[0]
                    .trim()
                    .split(",")
                    .map((h) => h.trim());

                setHeaders(headers);

                // Search for structures containing each header
                const searchPromises = headers.map(async (header) => {
                    try {
                        const response = await fetch(
                            `https://nda.nih.gov/api/datadictionary/datastructure/dataElement/${header}`
                        );
                        if (!response.ok) {
                            console.log(
                                `No matches found for field: ${header}`
                            );
                            return [];
                        }
                        const data = await response.json();
                        return Array.isArray(data) ? data : [];
                    } catch (error) {
                        console.log(
                            `Error fetching matches for field: ${header}`,
                            error
                        );
                        return [];
                    }
                });

                const headerResults = await Promise.all(searchPromises);

                // Count matches for each structure
                const structureCounts = {};
                headerResults.forEach((structures, index) => {
                    // Since `structures` is an array of strings, iterate directly over them
                    structures.forEach((structureName) => {
                        if (!structureCounts[structureName]) {
                            structureCounts[structureName] = {
                                name: structureName,
                                matchingFields: [],
                                matchCount: 0,
                            };
                        }
                        structureCounts[structureName].matchingFields.push(
                            headers[index]
                        );
                        structureCounts[structureName].matchCount++;
                    });
                });

                // Sort by number of matching fields
                const sortedResults = Object.values(structureCounts)
                    .sort((a, b) => b.matchCount - a.matchCount)
                    .map((result) => ({
                        ...result,
                        matchPercentage:
                            (result.matchCount / headers.length) * 100,
                    }));

                setResults(sortedResults.length > 0 ? sortedResults : null);

                setResults(Array.isArray(sortedResults) ? sortedResults : []);
            } catch (err) {
                console.error("Full error:", err);
                setError("Error analyzing CSV: " + err.message);
            } finally {
                setIsAnalyzing(false);
            }
        };

        reader.onerror = () => {
            setError("Failed to read file");
            setIsAnalyzing(false);
        };

        reader.readAsText(file);
    };

    return (
        <div className="space-y-4">
            {/* File Upload */}
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                    type="file"
                    accept=".csv"
                    onChange={(e) =>
                        e.target.files?.[0] && analyzeCSV(e.target.files[0])
                    }
                    className="hidden"
                    id="csv-upload"
                />
                <label
                    htmlFor="csv-upload"
                    className="cursor-pointer flex flex-col items-center space-y-2"
                >
                    <Upload className="w-12 h-12 text-gray-400" />
                    <div>
                        <span className="text-base text-gray-600">
                            Upload your CSV file
                        </span>
                        <span className="text-sm text-gray-500 block">
                            We'll analyze your column headers and find matching
                            structures
                        </span>
                    </div>
                </label>
            </div>

            {/* Loading State */}
            {isAnalyzing && (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-sm text-gray-600 mt-2">
                        Analyzing CSV headers and finding matches...
                    </p>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            {/* Results */}
            {results && headers && (
                <div className="space-y-4">
                    <div className="bg-white p-4 rounded-lg shadow">
                        <h3 className="font-medium text-gray-700 mb-2">
                            Detected Headers
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {headers.map((header, index) => (
                                <span
                                    key={index}
                                    className="px-2 py-1 bg-gray-100 rounded text-sm"
                                >
                                    {header}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg shadow">
                        <h3 className="font-medium text-gray-700 mb-4">
                            Matching Structures
                        </h3>
                        <div className="space-y-4">
                            {results && results.length > 0 ? (
                                results.map((result) => (
                                    // In CSVHeaderAnalyzer.js
                                    <div
                                        key={result.name}
                                        className="p-4 border rounded hover:bg-gray-50 cursor-pointer"
                                        onClick={() =>
                                            onStructureSelect(
                                                result.name,
                                                currentFile // Pass the actual file object
                                            )
                                        }
                                    >
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-mono text-lg text-blue-600">
                                                {result.name}
                                            </h4>
                                            <div className="text-right">
                                                <span className="text-sm font-medium">
                                                    {result.matchCount} of{" "}
                                                    {headers.length} fields
                                                </span>
                                                <div className="text-xs text-gray-500">
                                                    {result.matchPercentage.toFixed(
                                                        1
                                                    )}
                                                    % match
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {result.matchingFields.map(
                                                (field, index) => (
                                                    <span
                                                        key={index}
                                                        className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded"
                                                    >
                                                        {field}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p>No matching structures found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CSVHeaderAnalyzer;

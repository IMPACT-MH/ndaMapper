"use client";

import { useState } from "react";
import { Upload, AlertCircle, XCircle, CheckCircle } from "lucide-react";

const CSVHeaderAnalyzer = ({
    onStructureSelect,
    structureShortName = null,
}) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const [headers, setHeaders] = useState(null);
    const [currentFile, setCurrentFile] = useState(null);
    const [detectedShortname, setDetectedShortname] = useState(null);
    const [shortnameError, setShortnameError] = useState(null);

    const analyzeCSV = async (file) => {
        setCurrentFile(file);
        setIsAnalyzing(true);
        setError(null);
        setShortnameError(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const lines = text.split("\n").filter((line) => line.trim());

                // Check first line for shortname
                const firstLine = lines[0].trim().replace(/^"(.*)"$/, "$1");
                const potentialShortname = firstLine.includes(",")
                    ? null
                    : firstLine;

                // Validate shortname if provided
                if (structureShortName) {
                    if (!potentialShortname) {
                        setShortnameError(
                            "Expected structure shortname in first row"
                        );
                        setIsAnalyzing(false);
                        return;
                    }
                    if (potentialShortname !== structureShortName) {
                        setShortnameError(
                            `Expected shortname "${structureShortName}" but found "${potentialShortname}"`
                        );
                        setIsAnalyzing(false);
                        return;
                    }
                }

                // If first line is a single value, treat it as shortname and use second line for headers
                const headerLine = potentialShortname ? lines[1] : lines[0];

                if (!headerLine) {
                    setError("No headers found in CSV file");
                    setIsAnalyzing(false);
                    return;
                }

                const headers = headerLine
                    .split(",")
                    .map((h) => h.trim().replace(/^"(.*)"$/, "$1"))
                    .filter(Boolean);

                if (headers.length === 0) {
                    setError("No valid headers found in CSV file");
                    setIsAnalyzing(false);
                    return;
                }

                setHeaders(headers);
                setDetectedShortname(potentialShortname);

                // Search for structures containing each header
                const searchPromises = headers.map(async (header) => {
                    try {
                        const normalizedHeader = header
                            .toLowerCase()
                            .replace(/[_-]/g, "");

                        let response = await fetch(
                            `https://nda.nih.gov/api/datadictionary/datastructure/dataElement/${header}`
                        );

                        if (!response.ok) {
                            response = await fetch(
                                `https://nda.nih.gov/api/datadictionary/datastructure/dataElement/${normalizedHeader}`
                            );
                        }

                        if (!response.ok) {
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

                const sortedResults = Object.values(structureCounts)
                    .sort((a, b) => b.matchCount - a.matchCount)
                    .map((result) => ({
                        ...result,
                        matchPercentage:
                            (result.matchCount / headers.length) * 100,
                    }));

                setResults(sortedResults.length > 0 ? sortedResults : []);
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
                    {currentFile ? (
                        <>
                            <div className="flex items-center text-blue-600">
                                <CheckCircle className="w-6 h-6 mr-2" />

                                <span className="font-medium">
                                    {currentFile.name}
                                </span>
                            </div>
                            <span className="text-sm text-gray-500">
                                Click to upload a different file
                            </span>
                        </>
                    ) : (
                        <>
                            <Upload className="w-12 h-12 text-gray-400" />
                            <div>
                                <span className="text-base text-gray-600">
                                    Upload your CSV file
                                </span>
                                <span className="text-sm text-gray-500 block">
                                    {structureShortName
                                        ? `Expecting "${structureShortName}" structure`
                                        : "We'll analyze your column headers and find matching structures"}
                                </span>
                            </div>
                        </>
                    )}
                </label>
            </div>

            {isAnalyzing && (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-sm text-gray-600 mt-2">
                        Analyzing CSV headers and finding matches...
                    </p>
                </div>
            )}

            {shortnameError && (
                <div className="bg-red-50 p-4 rounded-lg flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                        <h4 className="font-medium text-red-700">
                            Structure Shortname Error
                        </h4>
                        <p className="text-red-600 text-sm mt-1">
                            {shortnameError}
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            {results && headers && !shortnameError && (
                <div className="space-y-4">
                    {detectedShortname && (
                        <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <h4 className="font-medium text-blue-700">
                                    Submission Template Detected
                                </h4>
                                <p className="text-blue-600 text-sm mt-1">
                                    Found data structure shortname in first row:{" "}
                                    <span className="font-mono">
                                        {detectedShortname}
                                    </span>
                                </p>
                            </div>
                        </div>
                    )}

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
                            {results.length > 0 ? (
                                results.map((result) => (
                                    <div
                                        key={result.name}
                                        className="p-4 border rounded hover:bg-gray-50 cursor-pointer"
                                        onClick={() =>
                                            onStructureSelect(
                                                result.name,
                                                currentFile
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

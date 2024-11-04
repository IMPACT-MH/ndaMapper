"use client";

import { useState } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const CSVValidator = ({ dataElements }) => {
    const [validationResults, setValidationResults] = useState(null);
    const [isValidating, setIsValidating] = useState(false);

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
                    {/* Summary */}
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

                    {/* Statistics */}
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

                    {/* Detailed Results */}
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

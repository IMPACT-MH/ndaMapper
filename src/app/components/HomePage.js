"use client";

import { useState, useEffect } from "react";
import DataStructureSearch from "./DataStructureSearch";
import CSVHeaderAnalyzer from "./CSVHeaderAnalyzer";
import DataElementSearch from "./DataElementSearch";

const Tabs = {
    STRUCTURE_SEARCH: "structure-search",
    FIELD_SEARCH: "field-search",
    ELEMENT_SEARCH: "element-search", // Added new tab
};

const HomePage = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [structures, setStructures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedStructure, setSelectedStructure] = useState(null);
    const [dataElements, setDataElements] = useState([]);
    const [loadingElements, setLoadingElements] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [activeTab, setActiveTab] = useState(Tabs.STRUCTURE_SEARCH);
    const [csvFile, setCsvFile] = useState(null);
    const [csvHeaders, setCsvHeaders] = useState(null);

    // State for CSVValidator
    const [selectedMappings, setSelectedMappings] = useState({});
    const [ignoredFields, setIgnoredFields] = useState(new Set());
    const [validationResults, setValidationResults] = useState(null);
    const [valueErrors, setValueErrors] = useState([]);
    const [transformationCounts, setTransformationCounts] = useState({
        handedness: 0,
        binary: 0,
    });

    const handleCsvAnalyzerResult = (shortName, file, headers) => {
        setSearchTerm(shortName);
        setCsvFile(file);
        setCsvHeaders(headers);
        setActiveTab(Tabs.STRUCTURE_SEARCH);
    };

    const handleClearSearch = () => {
        setSearchTerm("");
        setCsvFile(null); // Clear the CSV file
        setSelectedStructure(null); // Optional: also clear selected structure
    };

    useEffect(() => {
        if (searchTerm) {
            const debounceTimer = setTimeout(() => {
                fetchData();
            }, 300);
            return () => clearTimeout(debounceTimer);
        } else {
            setStructures([]);
        }
    }, [searchTerm]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Determine if this is a category search
            const isCategory = searchTerm.startsWith("category:");
            const searchValue = isCategory
                ? searchTerm.replace("category:", "")
                : searchTerm;

            // Use different API endpoints based on search type
            const endpoint = isCategory
                ? `https://nda.nih.gov/api/datadictionary/datastructure?category=${encodeURIComponent(
                      searchValue
                  )}`
                : `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${searchValue}`;

            const response = await fetch(endpoint);
            if (!response.ok) throw new Error("Failed to fetch data");
            const data = await response.json();

            // Only sort if it's a regular search, not a category search
            if (!isCategory) {
                const searchLower = searchValue.toLowerCase();
                const normalizedSearch = searchLower.replace(/[_-]/g, "");

                const sortedData = data.sort((a, b) => {
                    const aTitle = a.title?.toLowerCase() || "";
                    const bTitle = b.title?.toLowerCase() || "";
                    const aShortName = a.shortName
                        .toLowerCase()
                        .replace(/[_-]/g, "");
                    const bShortName = b.shortName
                        .toLowerCase()
                        .replace(/[_-]/g, "");

                    if (aShortName === normalizedSearch) return -1;
                    if (bShortName === normalizedSearch) return 1;

                    const aContainsSearch =
                        aShortName.includes(normalizedSearch);
                    const bContainsSearch =
                        bShortName.includes(normalizedSearch);

                    const aContainsTitle = aTitle.includes(searchLower);
                    const bContainsTitle = bTitle.includes(searchLower);

                    if (aContainsSearch && !bContainsSearch) return -1;
                    if (!aContainsSearch && bContainsSearch) return 1;
                    if (aContainsTitle && !bContainsTitle) return -1;
                    if (!aContainsTitle && bContainsTitle) return 1;

                    return 0;
                });
                setStructures(sortedData);
            } else {
                setStructures(data);
            }
        } catch (err) {
            setError("Error fetching data: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchDataElements = async (shortName) => {
        setLoadingElements(true);
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`
            );
            if (!response.ok) throw new Error("Failed to fetch data elements");
            const data = await response.json();

            // The data.dataElements array is already in the format we need
            const sortedElements = data.dataElements.sort(
                (a, b) => a.position - b.position
            );

            setDataElements(sortedElements);
        } catch (err) {
            console.error("Parsing error:", err);
            setError("Error fetching data elements: " + err.message);
        } finally {
            setLoadingElements(false);
        }
    };

    const handleStructureSearch = (shortName) => {
        setSearchTerm(shortName);
        // This will trigger the search due to the useEffect
    };

    const handleStructureSelect = (structure) => {
        setSelectedStructure(structure);
        if (structure) {
            // Only fetch elements if we have a structure
            fetchDataElements(structure.shortName);
        }
    };

    const resetValidationState = () => {
        setSelectedMappings({});
        setIgnoredFields(new Set());
        setValidationResults(null);
        setValueErrors([]);
        setTransformationCounts({ handedness: 0, binary: 0 });
    };

    const handleCsvFileChange = (file) => {
        setCsvFile(file);
        resetValidationState(); // Reset all validation state when a new file is uploaded
    };

    return (
        <div className="container mx-auto p-4 max-w-7xl">
            {/* Tabs */}
            <div className="mb-8">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab(Tabs.STRUCTURE_SEARCH)}
                            className={`
                                whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm
                                ${
                                    activeTab === Tabs.STRUCTURE_SEARCH
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }
                            `}
                        >
                            Data Structure Search
                        </button>
                        <button
                            onClick={() => setActiveTab(Tabs.FIELD_SEARCH)}
                            className={`
                                whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm
                                ${
                                    activeTab === Tabs.FIELD_SEARCH
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }
                            `}
                        >
                            Reverse Lookup by CSV
                        </button>
                        <button
                            onClick={() => setActiveTab(Tabs.ELEMENT_SEARCH)}
                            className={`
                                whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm
                                ${
                                    activeTab === Tabs.ELEMENT_SEARCH
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }
                            `}
                        >
                            Data Element Search
                        </button>
                    </nav>
                </div>
            </div>

            {activeTab === Tabs.STRUCTURE_SEARCH && (
                <DataStructureSearch
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    structures={structures}
                    loading={loading}
                    error={error}
                    selectedStructure={selectedStructure}
                    handleStructureSelect={handleStructureSelect}
                    dataElements={dataElements}
                    loadingElements={loadingElements}
                    handleStructureSearch={handleStructureSearch}
                    initialCsvFile={csvFile}
                    onFileChange={handleCsvFileChange}
                    onClear={handleClearSearch}
                    // Pass down CSV validator state
                    validatorState={{
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
                    }}
                />
            )}

            {activeTab === Tabs.FIELD_SEARCH && (
                <>
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4">
                            Find Data Structure from CSV
                        </h1>
                        <p className="text-gray-600">
                            Upload a CSV file to find matching data structures
                            based on your column headers.
                        </p>
                    </div>

                    <CSVHeaderAnalyzer
                        onStructureSelect={async (shortName, file) => {
                            resetValidationState(); // Reset state before setting new file
                            setSearchTerm(shortName);
                            setCsvFile(file);

                            try {
                                const response = await fetch(
                                    `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${shortName}`
                                );
                                if (!response.ok)
                                    throw new Error("Failed to fetch data");
                                const data = await response.json();

                                const structure = data.find(
                                    (s) => s.shortName === shortName
                                );
                                if (structure) {
                                    handleStructureSelect(structure);
                                }
                            } catch (err) {
                                setError(
                                    "Error fetching structure: " + err.message
                                );
                            }

                            setActiveTab(Tabs.STRUCTURE_SEARCH);
                        }}
                    />
                </>
            )}

            {activeTab === Tabs.ELEMENT_SEARCH && <DataElementSearch />}
        </div>
    );
};

export default HomePage;

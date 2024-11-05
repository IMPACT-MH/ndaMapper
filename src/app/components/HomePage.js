"use client";

import { useState, useEffect } from "react";
import DataStructureSearch from "./DataStructureSearch";
import CSVHeaderAnalyzer from "./CSVHeaderAnalyzer";

const Tabs = {
    STRUCTURE_SEARCH: "structure-search",
    FIELD_SEARCH: "field-search", // Changed from REVERSE_LOOKUP
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

    const handleCsvAnalyzerResult = (shortName, file, headers) => {
        setSearchTerm(shortName);
        setCsvFile(file);
        setCsvHeaders(headers);
        setActiveTab(Tabs.STRUCTURE_SEARCH);
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
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${searchTerm}`
            );
            if (!response.ok) throw new Error("Failed to fetch data");
            const data = await response.json();

            const sortedData = data.sort((a, b) => {
                const aTitle = a.title?.toLowerCase() || "";
                const bTitle = b.title?.toLowerCase() || "";
                const searchLower = searchTerm.toLowerCase();

                if (a.shortName.toLowerCase() === searchLower) return -1;
                if (b.shortName.toLowerCase() === searchLower) return 1;

                const aContainsSearch = aTitle.includes(searchLower);
                const bContainsSearch = bTitle.includes(searchLower);

                if (aContainsSearch && !bContainsSearch) return -1;
                if (!aContainsSearch && bContainsSearch) return 1;

                return 0;
            });

            setStructures(sortedData);
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
        setIsSearchFocused(false);
        fetchDataElements(structure.shortName);
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
                            onClick={() => setActiveTab(Tabs.REVERSE_LOOKUP)}
                            className={`
                                whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm
                                ${
                                    activeTab === Tabs.REVERSE_LOOKUP
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }
                            `}
                        >
                            Reverse Lookup by CSV
                        </button>
                    </nav>
                </div>
            </div>

            {activeTab === Tabs.STRUCTURE_SEARCH ? (
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
                    initialCsvFile={csvFile} // Pass it through
                />
            ) : (
                // Reverse Lookup Content
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
                            // First set these to handle the CSV part
                            setSearchTerm(shortName);
                            setCsvFile(file);

                            // Fetch the structure details and then select it
                            try {
                                const response = await fetch(
                                    `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${shortName}`
                                );
                                if (!response.ok)
                                    throw new Error("Failed to fetch data");
                                const data = await response.json();

                                // Find the exact match
                                const structure = data.find(
                                    (s) => s.shortName === shortName
                                );
                                if (structure) {
                                    handleStructureSelect(structure); // This will fetch the data elements too
                                }
                            } catch (err) {
                                setError(
                                    "Error fetching structure: " + err.message
                                );
                            }

                            // Finally switch the tab
                            setActiveTab(Tabs.STRUCTURE_SEARCH);
                        }}
                    />

                    {/* <CSVHeaderAnalyzer
                        onStructureSelect={async (shortName) => {
                            setSearchTerm(shortName);
                            setActiveTab(Tabs.STRUCTURE_SEARCH);

                            // Fetch the structure details first
                            try {
                                const response = await fetch(
                                    `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${shortName}`
                                );
                                if (!response.ok)
                                    throw new Error("Failed to fetch data");
                                const data = await response.json();

                                // Find the exact match
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
                        }}
                    /> */}
                </>
            )}
        </div>
    );
};

export default HomePage;

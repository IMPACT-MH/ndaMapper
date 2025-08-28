"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import DataStructureSearch from "./DataStructureSearch";
import CSVHeaderAnalyzer from "./CSVHeaderAnalyzer";
import DataElementSearch from "./DataElementSearch";
import DataCategorySearch from "./DataCategorySearch";
import { DATA_PORTAL } from "@/const";

const Tabs = {
    STRUCTURE_SEARCH: "structure-search",
    FIELD_SEARCH: "field-search",
    ELEMENT_SEARCH: "element-search",
    CATEGORY_SEARCH: "category-search",
};

const HomePage = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [structures, setStructures] = useState([]);
    const [totalStructureCount, setTotalStructureCount] = useState(0); // Track total results for context
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedStructure, setSelectedStructure] = useState(null);
    const [dataElements, setDataElements] = useState([]);
    const [loadingElements, setLoadingElements] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(Tabs.STRUCTURE_SEARCH);

    // Database filter state
    const [databaseFilterEnabled, setDatabaseFilterEnabled] = useState(true);
    const [databaseStructures, setDatabaseStructures] = useState([]);
    const [databaseName, setDatabaseName] = useState("IMPACT-MH");

    // Database elements state for DataElementSearch
    const [databaseElements, setDatabaseElements] = useState(new Map());
    const [loadingDatabaseElements, setLoadingDatabaseElements] =
        useState(false);

    // Database structures loading state
    const [loadingDatabaseStructures, setLoadingDatabaseStructures] =
        useState(false);

    // Load saved tab from localStorage after mount
    useEffect(() => {
        const savedTab = localStorage.getItem("activeTab");
        if (savedTab) {
            setActiveTab(savedTab);
        }
        setIsLoading(false);
    }, []);

    // Save tab to localStorage when it changes
    useEffect(() => {
        localStorage.setItem("activeTab", activeTab);
    }, [activeTab]);

    // Fetch database elements when filter is enabled
    useEffect(() => {
        if (databaseFilterEnabled && databaseElements.size === 0) {
            fetchDatabaseElements();
        }
    }, [databaseFilterEnabled, databaseElements.size]);

    // Fetch database structures when filter is enabled
    useEffect(() => {
        if (databaseFilterEnabled && databaseStructures.length === 0) {
            fetchDatabaseStructures();
        }
    }, [databaseFilterEnabled, databaseStructures.length]);

    const fetchDatabaseElements = async () => {
        setLoadingDatabaseElements(true);
        try {
            const response = await fetch(DATA_PORTAL);
            if (response.ok) {
                const data = await response.json();

                const allElements = new Map(); // Store full element objects

                if (
                    data &&
                    data.dataStructures &&
                    typeof data.dataStructures === "object"
                ) {
                    // Extract all unique elements from all structures
                    Object.values(data.dataStructures).forEach((structure) => {
                        if (
                            structure.dataElements &&
                            Array.isArray(structure.dataElements)
                        ) {
                            structure.dataElements.forEach((element) => {
                                if (element.name) {
                                    // Store full element object with lowercase name as key
                                    allElements.set(
                                        element.name.toLowerCase(),
                                        element
                                    );
                                }
                            });
                        }
                    });
                }

                console.log(
                    `Found ${allElements.size} unique database elements`
                );
                setDatabaseElements(allElements);
            } else {
                console.error(
                    "Failed to fetch database elements, status:",
                    response.status
                );
                setDatabaseElements(new Map());
            }
        } catch (error) {
            console.error("Error fetching database elements:", error);
            setDatabaseElements(new Map());
        } finally {
            setLoadingDatabaseElements(false);
        }
    };

    const fetchDatabaseStructures = async () => {
        setLoadingDatabaseStructures(true);
        try {
            const response = await fetch(DATA_PORTAL);
            if (response.ok) {
                const data = await response.json();

                let structureNames = [];

                // Handle the specific format: { dataStructures: { "aces01": {...}, "structure2": {...} } }
                if (
                    data &&
                    data.dataStructures &&
                    typeof data.dataStructures === "object"
                ) {
                    structureNames = Object.keys(data.dataStructures);
                } else {
                    console.warn("Unexpected API response format:", data);
                    setDatabaseStructures([]);
                    return;
                }

                console.log(
                    `Found ${structureNames.length} database structures:`,
                    structureNames
                );
                setDatabaseStructures(structureNames);
            } else {
                console.error(
                    "Failed to fetch database structures, status:",
                    response.status
                );
                setDatabaseStructures([]);
            }
        } catch (error) {
            console.error("Error fetching database structures:", error);
            setDatabaseStructures([]);
        } finally {
            setLoadingDatabaseStructures(false);
        }
    };

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

    const handleElementStructureSelect = async (structureName) => {
        setActiveTab(Tabs.STRUCTURE_SEARCH);
        setSearchTerm(structureName);

        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${structureName}`
            );
            if (response.ok) {
                const structures = await response.json();
                const exactMatch = structures.find(
                    (s) => s.shortName === structureName
                );
                if (exactMatch) {
                    handleStructureSelect(exactMatch);
                }
            }
        } catch (err) {
            console.error("Error fetching structure:", err);
        }
    };

    const handleElementDetailStructureSelect = async (structureName) => {
        setActiveTab(Tabs.STRUCTURE_SEARCH);
        // Don't update search term when coming from element detail view

        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${structureName}`
            );
            if (response.ok) {
                const structures = await response.json();
                const exactMatch = structures.find(
                    (s) => s.shortName === structureName
                );
                if (exactMatch) {
                    handleStructureSelect(exactMatch);
                }
            }
        } catch (err) {
            console.error("Error fetching structure:", err);
        }
    };

    const handleCategoryStructureSelect = async (structureName) => {
        setActiveTab(Tabs.STRUCTURE_SEARCH);
        setSearchTerm(structureName);

        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${structureName}`
            );
            if (response.ok) {
                const structures = await response.json();
                const exactMatch = structures.find(
                    (s) => s.shortName === structureName
                );
                if (exactMatch) {
                    handleStructureSelect(exactMatch);
                }
            }
        } catch (err) {
            console.error("Error fetching structure:", err);
        }
    };

    const handleCsvAnalyzerResult = (shortName, file, headers) => {
        setSearchTerm(shortName);
        setCsvFile(file);
        setCsvHeaders(headers);
        setActiveTab(Tabs.STRUCTURE_SEARCH);
    };

    const handleClearSearch = () => {
        setSearchTerm("");
        setCsvFile(null);
        setSelectedStructure(null);
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
    }, [searchTerm, databaseFilterEnabled, databaseStructures]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // If database filter is enabled and we have database structures, search within those first
            if (databaseFilterEnabled && databaseStructures.length > 0) {
                await fetchDatabaseFilteredData();
            } else {
                await fetchAllData();
            }
        } catch (err) {
            setError("Error fetching data: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchDatabaseFilteredData = async () => {
        // Filter database structures by search term
        const searchLower = searchTerm.toLowerCase();
        const normalizedSearch = searchLower.replace(/[_-]/g, "");

        // First, filter database structures that match the search term
        const matchingDbStructures = databaseStructures.filter(
            (dbStructure) => {
                const dbStructureLower = dbStructure.toLowerCase();
                const normalizedDbStructure = dbStructureLower.replace(
                    /[_-]/g,
                    ""
                );

                return (
                    dbStructureLower.includes(searchLower) ||
                    normalizedDbStructure.includes(normalizedSearch) ||
                    searchTerm.startsWith("category:")
                );
            }
        );

        if (
            matchingDbStructures.length === 0 &&
            !searchTerm.startsWith("category:")
        ) {
            setStructures([]);
            setTotalStructureCount(0);
            return;
        }

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
        const allData = await response.json();

        // Store total count before filtering
        setTotalStructureCount(allData.length);

        // Filter the NDA results to only include structures that exist in our database
        const filteredData = allData.filter((structure) => {
            const structureNameLower = structure.shortName.toLowerCase();
            const databaseStructuresLower = databaseStructures.map((name) =>
                name.toLowerCase()
            );
            return databaseStructuresLower.includes(structureNameLower);
        });

        // Sort the filtered results
        if (!isCategory) {
            const sortedData = filteredData.sort((a, b) => {
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

                const aContainsSearch = aShortName.includes(normalizedSearch);
                const bContainsSearch = bShortName.includes(normalizedSearch);

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
            setStructures(filteredData);
        }
    };

    const fetchAllData = async () => {
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

        // Set total count for context
        setTotalStructureCount(data.length);

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

                const aContainsSearch = aShortName.includes(normalizedSearch);
                const bContainsSearch = bShortName.includes(normalizedSearch);

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
    };

    const fetchDataElements = async (shortName) => {
        setLoadingElements(true);
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`
            );
            if (!response.ok) throw new Error("Failed to fetch data elements");
            const data = await response.json();

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
    };

    const handleStructureSelect = (structure) => {
        setSelectedStructure(structure);
        if (structure) {
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
        resetValidationState();
    };

    return (
        <div className="container mx-auto p-4 max-w-7xl">
            <div className={isLoading ? "invisible" : "visible"}>
                {/* Tabs navigation */}
                <div className="mb-8">
                    <div className="border-b border-gray-200">
                        <nav
                            className="-mb-px flex justify-between items-center"
                            aria-label="Tabs"
                        >
                            <div className="flex space-x-8">
                                <button
                                    onClick={() =>
                                        setActiveTab(Tabs.CATEGORY_SEARCH)
                                    }
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.CATEGORY_SEARCH
                                            ? "border-blue-500 text-blue-600"
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                                >
                                    Data Dictionary
                                </button>
                                {/* <div className="text-gray-400 text-sm pb-4 -mx-2">
                                    →
                                </div> */}
                                <button
                                    onClick={() =>
                                        setActiveTab(Tabs.STRUCTURE_SEARCH)
                                    }
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.STRUCTURE_SEARCH
                                            ? "border-blue-500 text-blue-600"
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                                >
                                    Data Structures
                                </button>
                                {/* <div className="text-gray-400 text-sm pb-4 -mx-2">
                                    →
                                </div> */}
                                <button
                                    onClick={() =>
                                        setActiveTab(Tabs.ELEMENT_SEARCH)
                                    }
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.ELEMENT_SEARCH
                                            ? "border-blue-500 text-blue-600"
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                                >
                                    Data Elements
                                </button>
                                <div className="text-gray-400 text-sm pb-4 mx-2">
                                    |
                                </div>
                                <button
                                    onClick={() =>
                                        setActiveTab(Tabs.FIELD_SEARCH)
                                    }
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.FIELD_SEARCH
                                            ? "border-green-500 text-green-600"
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                                >
                                    Reverse Lookup by CSV
                                </button>
                            </div>

                            {/* NDA Logo */}
                            <div className="flex items-center transform -translate-y-2">
                                <div className="w-12 h-12 relative">
                                    <Image
                                        src="/nda.png"
                                        alt="NDA Logo"
                                        width={48}
                                        height={48}
                                        className="object-contain"
                                    />
                                </div>
                            </div>
                        </nav>
                    </div>
                </div>
            </div>

            {/* Tab content */}
            <div
                className={
                    activeTab === Tabs.STRUCTURE_SEARCH ? "block" : "hidden"
                }
            >
                <DataStructureSearch
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    structures={structures}
                    totalStructureCount={totalStructureCount}
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
                    // Pass database filter props
                    databaseFilterEnabled={databaseFilterEnabled}
                    setDatabaseFilterEnabled={setDatabaseFilterEnabled}
                    databaseStructures={databaseStructures}
                    databaseName={databaseName}
                    loadingDatabaseStructures={loadingDatabaseStructures}
                    databaseElements={databaseElements}
                    onSwitchToElementSearch={(elementName) => {
                        setSearchTerm(elementName);
                        setActiveTab(Tabs.ELEMENT_SEARCH);
                    }}
                />
            </div>

            <div
                className={
                    activeTab === Tabs.CATEGORY_SEARCH ? "block" : "hidden"
                }
            >
                <DataCategorySearch
                    onStructureSelect={handleCategoryStructureSelect}
                    // Pass database filter props
                    databaseFilterEnabled={databaseFilterEnabled}
                    setDatabaseFilterEnabled={setDatabaseFilterEnabled}
                    databaseStructures={databaseStructures}
                    databaseName={databaseName}
                    loadingDatabaseStructures={loadingDatabaseStructures}
                />
            </div>

            <div
                className={activeTab === Tabs.FIELD_SEARCH ? "block" : "hidden"}
            >
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-4">
                        Find Data Structure from CSV
                    </h1>
                    <p className="text-gray-600">
                        Upload a CSV file to find matching data structures based
                        on your column headers.
                    </p>
                </div>

                <CSVHeaderAnalyzer
                    onStructureSelect={async (shortName, file) => {
                        resetValidationState();
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
            </div>

            <div
                className={
                    activeTab === Tabs.ELEMENT_SEARCH ? "block" : "hidden"
                }
            >
                <DataElementSearch
                    onStructureSelect={handleElementStructureSelect}
                    onElementDetailStructureSelect={
                        handleElementDetailStructureSelect
                    }
                    // Pass database filter props
                    databaseFilterEnabled={databaseFilterEnabled}
                    setDatabaseFilterEnabled={setDatabaseFilterEnabled}
                    databaseElements={databaseElements}
                    setDatabaseElements={setDatabaseElements}
                    loadingDatabaseElements={loadingDatabaseElements}
                    setLoadingDatabaseElements={setLoadingDatabaseElements}
                    databaseName={databaseName}
                    initialSearchTerm={searchTerm}
                />
            </div>
        </div>
    );
};

export default HomePage;

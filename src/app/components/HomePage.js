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

    // Database connection error state
    const [databaseConnectionError, setDatabaseConnectionError] =
        useState(null);

    // Tags state for custom tag searches
    const [structureDataTypeTags, setStructureDataTypeTags] = useState({});
    const apiBaseUrl = "/api/spinup";

    // Browser history integration for tabs
    useEffect(() => {
        // Check if there's a tab in the URL hash or history state
        const hash = window.location.hash.replace("#", "");
        const urlTab = Object.values(Tabs).find((tab) => hash === tab);

        // Check history state
        const historyState = window.history.state;
        const stateTab = historyState?.tab;

        // Priority: history state > URL hash > localStorage > default
        const initialTab =
            stateTab ||
            urlTab ||
            localStorage.getItem("activeTab") ||
            Tabs.STRUCTURE_SEARCH;

        if (initialTab && Object.values(Tabs).includes(initialTab)) {
            setActiveTab(initialTab);
            // Update URL hash if not already set
            if (!urlTab && initialTab !== Tabs.STRUCTURE_SEARCH) {
                window.history.replaceState(
                    { tab: initialTab },
                    "",
                    `#${initialTab}`
                );
            }
        }

        setIsLoading(false);
    }, []);

    // Handle browser back/forward buttons
    useEffect(() => {
        const handlePopState = (event) => {
            const state = event.state;
            if (state?.tab && Object.values(Tabs).includes(state.tab)) {
                setActiveTab(state.tab);
            } else {
                // Check URL hash
                const hash = window.location.hash.replace("#", "");
                const urlTab = Object.values(Tabs).find((tab) => hash === tab);
                if (urlTab) {
                    setActiveTab(urlTab);
                } else {
                    // Default to structure search
                    setActiveTab(Tabs.STRUCTURE_SEARCH);
                }
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Save tab to localStorage and update browser history when it changes
    useEffect(() => {
        if (isLoading) return; // Don't update on initial load

        localStorage.setItem("activeTab", activeTab);

        // Update URL hash
        const newHash =
            activeTab === Tabs.STRUCTURE_SEARCH ? "" : `#${activeTab}`;
        const newUrl = window.location.pathname + (newHash || "");

        // Push to history (but don't push on initial load)
        if (window.history.state?.tab !== activeTab) {
            window.history.pushState({ tab: activeTab }, "", newUrl);
        }
    }, [activeTab, isLoading]);

    // Fetch database elements when filter is enabled
    // Fetch database data once when filter is enabled (optimized - single fetch for both)
    useEffect(() => {
        if (
            databaseFilterEnabled &&
            databaseElements.size === 0 &&
            databaseStructures.length === 0
        ) {
            fetchDatabaseData();
        }
    }, [
        databaseFilterEnabled,
        databaseElements.size,
        databaseStructures.length,
    ]);

    // Optimized: Fetch database data once and use for both elements and structures
    const fetchDatabaseData = async () => {
        setLoadingDatabaseElements(true);
        setLoadingDatabaseStructures(true);
        setDatabaseConnectionError(null); // Clear any previous errors
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(DATA_PORTAL, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();

                if (
                    data &&
                    data.dataStructures &&
                    typeof data.dataStructures === "object"
                ) {
                    // Extract structure names
                    const structureNames = Object.keys(data.dataStructures);
                    setDatabaseStructures(structureNames);

                    // Extract all unique elements from all structures
                    const allElements = new Map();
                    Object.values(data.dataStructures).forEach((structure) => {
                        if (
                            structure.dataElements &&
                            Array.isArray(structure.dataElements)
                        ) {
                            structure.dataElements.forEach((element) => {
                                if (element.name) {
                                    allElements.set(
                                        element.name.toLowerCase(),
                                        element
                                    );
                                }
                            });
                        }
                    });

                    console.log(
                        `Found ${allElements.size} unique database elements and ${structureNames.length} structures`
                    );
                    setDatabaseElements(allElements);
                    setDatabaseConnectionError(null); // Clear error on success
                } else {
                    console.warn("Unexpected API response format:", data);
                    setDatabaseStructures([]);
                    setDatabaseElements(new Map());
                    setDatabaseFilterEnabled(false);
                    setDatabaseConnectionError(
                        "Unable to connect to database."
                    );
                }
            } else {
                console.error(
                    "Failed to fetch database data, status:",
                    response.status
                );
                setDatabaseStructures([]);
                setDatabaseElements(new Map());
                setDatabaseFilterEnabled(false);
                setDatabaseConnectionError("Unable to connect to API.");
            }
        } catch (error) {
            if (error.name === "AbortError") {
                console.error("Database data fetch timed out after 30 seconds");
                setDatabaseConnectionError("Unable to connect to API.");
            } else {
                console.error("Error fetching database data:", error);
                setDatabaseConnectionError("Unable to connect to API.");
            }
            setDatabaseStructures([]);
            setDatabaseElements(new Map());
            setDatabaseFilterEnabled(false);
        } finally {
            setLoadingDatabaseElements(false);
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
        setActiveTab(Tabs.CATEGORY_SEARCH);
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
                    searchTerm.startsWith("category:") ||
                    searchTerm.startsWith("datatype:")
                );
            }
        );

        if (
            matchingDbStructures.length === 0 &&
            !searchTerm.startsWith("category:") &&
            !searchTerm.startsWith("datatype:")
        ) {
            setStructures([]);
            setTotalStructureCount(0);
            return;
        }

        // Determine if this is a category or data type search
        const isCategory = searchTerm.startsWith("category:");
        const isDataType = searchTerm.startsWith("datatype:");
        const searchValue = isCategory
            ? searchTerm.replace("category:", "")
            : isDataType
            ? searchTerm.replace("datatype:", "")
            : searchTerm;

        // For category or data type searches, check if it's a custom tag first
        let allData = [];
        if (isCategory || isDataType) {
            // Fetch tags to check if this is a custom tag
            try {
                const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
                if (tagsResponse.ok) {
                    const allTags = await tagsResponse.json();
                    const customTag = allTags.find((tag) => {
                        if (isCategory) {
                            // Category tags have tagType === "Category" or empty string
                            return (
                                (tag.tagType === "Category" ||
                                    !tag.tagType ||
                                    tag.tagType === "") &&
                                tag.name === searchValue
                            );
                        } else {
                            // Data type tags have tagType === "Data Type"
                            return (
                                tag.tagType === "Data Type" &&
                                tag.name === searchValue
                            );
                        }
                    });

                    if (customTag) {
                        // This is a custom tag - fetch structures with this tag
                        const dsResponse = await fetch(
                            `${apiBaseUrl}/tags/${customTag.id}/dataStructures`
                        );
                        if (dsResponse.ok) {
                            const dsData = await dsResponse.json();
                            const taggedStructures =
                                dsData.dataStructures || [];

                            // Get list of shortNames to filter by
                            const taggedShortNames = new Set(
                                taggedStructures.map((ds) =>
                                    ds.shortName?.toLowerCase()
                                )
                            );

                            // Fetch all structures from NDA at once (much faster than individual calls)
                            const allStructuresResponse = await fetch(
                                "https://nda.nih.gov/api/datadictionary/datastructure"
                            );
                            if (allStructuresResponse.ok) {
                                const allStructuresData =
                                    await allStructuresResponse.json();
                                // Filter to only structures that match our tagged shortNames
                                allData = allStructuresData.filter(
                                    (structure) =>
                                        taggedShortNames.has(
                                            structure.shortName?.toLowerCase()
                                        )
                                );
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn("Error checking custom tags:", err);
                // Fall through to NDA API search
            }
        }

        // If we didn't get data from custom tags, use NDA API
        if (allData.length === 0) {
            // Use different API endpoints based on search type
            let endpoint;
            if (isCategory) {
                endpoint = `https://nda.nih.gov/api/datadictionary/datastructure?category=${encodeURIComponent(
                    searchValue
                )}`;
            } else if (isDataType) {
                endpoint = `https://nda.nih.gov/api/datadictionary/datastructure?dataType=${encodeURIComponent(
                    searchValue
                )}`;
            } else {
                endpoint = `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${searchValue}`;
            }

            const response = await fetch(endpoint);
            if (!response.ok) {
                // If category or data type search fails, return empty results gracefully
                if (isCategory || isDataType) {
                    setStructures([]);
                    setTotalStructureCount(0);
                    return;
                }
                throw new Error("Failed to fetch data");
            }
            allData = await response.json();

            // Handle empty results for category/data type searches
            if (
                (isCategory || isDataType) &&
                (!allData || allData.length === 0)
            ) {
                setStructures([]);
                setTotalStructureCount(0);
                return;
            }
        }

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
        if (!isCategory && !isDataType) {
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
        // Determine if this is a category or data type search
        const isCategory = searchTerm.startsWith("category:");
        const isDataType = searchTerm.startsWith("datatype:");
        const searchValue = isCategory
            ? searchTerm.replace("category:", "")
            : isDataType
            ? searchTerm.replace("datatype:", "")
            : searchTerm;

        // For category or data type searches, check if it's a custom tag first
        if (isCategory || isDataType) {
            // Fetch tags to check if this is a custom tag
            try {
                const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
                if (tagsResponse.ok) {
                    const allTags = await tagsResponse.json();
                    const customTag = allTags.find((tag) => {
                        if (isCategory) {
                            // Category tags have tagType === "Category" or empty string
                            return (
                                (tag.tagType === "Category" ||
                                    !tag.tagType ||
                                    tag.tagType === "") &&
                                tag.name === searchValue
                            );
                        } else {
                            // Data type tags have tagType === "Data Type"
                            return (
                                tag.tagType === "Data Type" &&
                                tag.name === searchValue
                            );
                        }
                    });

                    if (customTag) {
                        // This is a custom tag - fetch structures with this tag
                        const dsResponse = await fetch(
                            `${apiBaseUrl}/tags/${customTag.id}/dataStructures`
                        );
                        if (dsResponse.ok) {
                            const dsData = await dsResponse.json();
                            const taggedStructures =
                                dsData.dataStructures || [];

                            // Get list of shortNames to filter by
                            const taggedShortNames = new Set(
                                taggedStructures.map((ds) =>
                                    ds.shortName?.toLowerCase()
                                )
                            );

                            // Fetch all structures from NDA at once (much faster than individual calls)
                            const allStructuresResponse = await fetch(
                                "https://nda.nih.gov/api/datadictionary/datastructure"
                            );
                            if (allStructuresResponse.ok) {
                                const allStructuresData =
                                    await allStructuresResponse.json();
                                // Filter to only structures that match our tagged shortNames
                                const validStructures =
                                    allStructuresData.filter((structure) =>
                                        taggedShortNames.has(
                                            structure.shortName?.toLowerCase()
                                        )
                                    );
                                setStructures(validStructures);
                                setTotalStructureCount(validStructures.length);
                                return;
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn("Error checking custom tags:", err);
                // Fall through to NDA API search
            }
        }

        // Use different API endpoints based on search type
        let endpoint;
        if (isCategory) {
            endpoint = `https://nda.nih.gov/api/datadictionary/datastructure?category=${encodeURIComponent(
                searchValue
            )}`;
        } else if (isDataType) {
            endpoint = `https://nda.nih.gov/api/datadictionary/datastructure?dataType=${encodeURIComponent(
                searchValue
            )}`;
        } else {
            endpoint = `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${searchValue}`;
        }

        const response = await fetch(endpoint);
        if (!response.ok) {
            // If category or data type search fails, return empty results gracefully
            if (isCategory || isDataType) {
                setStructures([]);
                setTotalStructureCount(0);
                return;
            }
            throw new Error("Failed to fetch data");
        }
        const data = await response.json();

        // Handle empty results for category/data type searches
        if ((isCategory || isDataType) && (!data || data.length === 0)) {
            setStructures([]);
            setTotalStructureCount(0);
            return;
        }

        // Set total count for context
        setTotalStructureCount(data.length);

        // Only sort if it's a regular search, not a category or data type search
        if (!isCategory && !isDataType) {
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
                    databaseConnectionError={databaseConnectionError}
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
                    databaseConnectionError={databaseConnectionError}
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
                    databaseConnectionError={databaseConnectionError}
                    initialSearchTerm={searchTerm}
                />
            </div>
        </div>
    );
};

export default HomePage;

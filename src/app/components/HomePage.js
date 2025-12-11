"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import DataStructureSearch from "./DataStructureSearch";
import CSVHeaderAnalyzer from "./CSVHeaderAnalyzer";
import DataElementSearch from "./DataElementSearch";
import DataCategorySearch from "./DataCategorySearch";
import { IMPACT_API_BASE, DATA_STRUCTURES } from "@/const";

const Tabs = {
    DICTIONARY: "data-dictionary",
    STRUCTURE: "data-structures",
    ELEMENT: "data-elements",
    REVERSE_LOOKUP: "reverse-lookup",
};

// Backwards compatibility for previously stored tab values
const normalizeTab = (tab) => {
    if (!tab) return null;
    switch (tab) {
        case "category-search":
            return Tabs.DICTIONARY;
        case "structure-search":
            return Tabs.STRUCTURE;
        case "element-search":
            return Tabs.ELEMENT;
        case "field-search":
            return Tabs.REVERSE_LOOKUP;
        default:
            return Object.values(Tabs).includes(tab) ? tab : null;
    }
};

const HomePage = () => {
    const [searchTerm, setSearchTerm] = useState(""); // For structure search
    const [elementSearchTerm, setElementSearchTerm] = useState(""); // For element search
    const [structures, setStructures] = useState([]);
    const [totalStructureCount, setTotalStructureCount] = useState(0); // Track total results for context
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedStructure, setSelectedStructure] = useState(null);
    const [dataElements, setDataElements] = useState([]);
    const [loadingElements, setLoadingElements] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(Tabs.DICTIONARY);

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
    const apiBaseUrl = "/api/v1";

    // Browser history integration for tabs
    useEffect(() => {
        // ALWAYS start on Data Dictionary on page load/refresh
        // Ignore URL hash, history state, and localStorage completely
        setActiveTab(Tabs.DICTIONARY);

        // Clear URL hash and history state to prevent any persistence
        if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname);
        } else if (window.history.state?.tab) {
            window.history.replaceState(null, "", window.location.pathname);
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
                    // Default to data dictionary search
                    setActiveTab(Tabs.DICTIONARY);
                }
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Update browser history when tab changes (for back/forward navigation only)
    useEffect(() => {
        if (isLoading) return; // Don't update on initial load

        // Only update history if not already on Data Dictionary (to avoid cluttering history)
        // This allows back/forward navigation but doesn't persist state on refresh
        if (activeTab !== Tabs.DICTIONARY) {
            const newHash = `#${activeTab}`;
            const newUrl = window.location.pathname + newHash;

            // Use replaceState instead of pushState to avoid creating history entries
            // This way refresh always goes back to DICTIONARY
            window.history.replaceState({ tab: activeTab }, "", newUrl);
        } else {
            // Clear hash when on DICTIONARY
            if (window.location.hash) {
                window.history.replaceState(null, "", window.location.pathname);
            }
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

            const response = await fetch(
                `${IMPACT_API_BASE}${DATA_STRUCTURES}`,
                {
                    signal: controller.signal,
                }
            );
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
                    setDatabaseConnectionError("Unable to connect to database");
                }
            } else {
                console.error(
                    "Failed to fetch database data, status:",
                    response.status
                );
                setDatabaseStructures([]);
                setDatabaseElements(new Map());
                setDatabaseFilterEnabled(false);
                setDatabaseConnectionError("Unable to connect to API");
            }
        } catch (error) {
            if (error.name === "AbortError") {
                console.error("Database data fetch timed out after 30 seconds");
                setDatabaseConnectionError("Unable to connect to API");
            } else {
                console.error("Error fetching database data:", error);
                setDatabaseConnectionError("Unable to connect to API");
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
        setActiveTab(Tabs.STRUCTURE);
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
        setActiveTab(Tabs.STRUCTURE);
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
        setActiveTab(Tabs.STRUCTURE);
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
        setActiveTab(Tabs.DICTIONARY);
    };

    const handleClearSearch = () => {
        setSearchTerm("");
        setCsvFile(null);
        setSelectedStructure(null);
    };

    const fetchDatabaseFilteredData = useCallback(async () => {
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

        // Filter the NDA results to only include structures that exist in our database
        const filteredData = allData.filter((structure) => {
            const structureNameLower = structure.shortName.toLowerCase();
            const databaseStructuresLower = databaseStructures.map((name) =>
                name.toLowerCase()
            );
            return databaseStructuresLower.includes(structureNameLower);
        });

        // Store total count - when database filter is enabled, this is the filtered count
        // When disabled, this would be allData.length, but we're in fetchDatabaseFilteredData
        // so we want the filtered count as the "total" for display purposes
        setTotalStructureCount(filteredData.length);

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
    }, [searchTerm, databaseStructures, apiBaseUrl]);

    const fetchAllData = useCallback(async () => {
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
    }, [searchTerm, apiBaseUrl]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // If database filter is enabled and we have database structures, search within those first
            if (databaseFilterEnabled && databaseStructures.length > 0) {
                // Inline call to avoid circular dependency
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
                    setLoading(false);
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
                                    return (
                                        (tag.tagType === "Category" ||
                                            !tag.tagType ||
                                            tag.tagType === "") &&
                                        tag.name === searchValue
                                    );
                                } else {
                                    return (
                                        tag.tagType === "Data Type" &&
                                        tag.name === searchValue
                                    );
                                }
                            });

                            if (customTag) {
                                const dsResponse = await fetch(
                                    `${apiBaseUrl}/tags/${customTag.id}/dataStructures`
                                );
                                if (dsResponse.ok) {
                                    const dsData = await dsResponse.json();
                                    const taggedStructures =
                                        dsData.dataStructures || [];
                                    const taggedShortNames = new Set(
                                        taggedStructures.map((ds) =>
                                            ds.shortName?.toLowerCase()
                                        )
                                    );
                                    const allStructuresResponse = await fetch(
                                        "https://nda.nih.gov/api/datadictionary/datastructure"
                                    );
                                    if (allStructuresResponse.ok) {
                                        const allStructuresData =
                                            await allStructuresResponse.json();
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
                    }
                }

                // If we didn't get data from custom tags, use NDA API
                if (allData.length === 0) {
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
                        if (isCategory || isDataType) {
                            setStructures([]);
                            setTotalStructureCount(0);
                            setLoading(false);
                            return;
                        }
                        throw new Error("Failed to fetch data");
                    }
                    allData = await response.json();

                    if (
                        (isCategory || isDataType) &&
                        (!allData || allData.length === 0)
                    ) {
                        setStructures([]);
                        setTotalStructureCount(0);
                        setLoading(false);
                        return;
                    }
                }

                // Filter the NDA results to only include structures that exist in our database
                const filteredData = allData.filter((structure) => {
                    const structureNameLower =
                        structure.shortName.toLowerCase();
                    const databaseStructuresLower = databaseStructures.map(
                        (name) => name.toLowerCase()
                    );
                    return databaseStructuresLower.includes(structureNameLower);
                });

                setTotalStructureCount(filteredData.length);

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
                    setStructures(filteredData);
                }
            } else {
                // Inline call to fetchAllData to avoid circular dependency
                const isCategory = searchTerm.startsWith("category:");
                const isDataType = searchTerm.startsWith("datatype:");
                const searchValue = isCategory
                    ? searchTerm.replace("category:", "")
                    : isDataType
                    ? searchTerm.replace("datatype:", "")
                    : searchTerm;

                if (isCategory || isDataType) {
                    try {
                        const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
                        if (tagsResponse.ok) {
                            const allTags = await tagsResponse.json();
                            const customTag = allTags.find((tag) => {
                                if (isCategory) {
                                    return (
                                        (tag.tagType === "Category" ||
                                            !tag.tagType ||
                                            tag.tagType === "") &&
                                        tag.name === searchValue
                                    );
                                } else {
                                    return (
                                        tag.tagType === "Data Type" &&
                                        tag.name === searchValue
                                    );
                                }
                            });

                            if (customTag) {
                                const dsResponse = await fetch(
                                    `${apiBaseUrl}/tags/${customTag.id}/dataStructures`
                                );
                                if (dsResponse.ok) {
                                    const dsData = await dsResponse.json();
                                    const taggedStructures =
                                        dsData.dataStructures || [];
                                    const taggedShortNames = new Set(
                                        taggedStructures.map((ds) =>
                                            ds.shortName?.toLowerCase()
                                        )
                                    );
                                    const allStructuresResponse = await fetch(
                                        "https://nda.nih.gov/api/datadictionary/datastructure"
                                    );
                                    if (allStructuresResponse.ok) {
                                        const allStructuresData =
                                            await allStructuresResponse.json();
                                        const validStructures =
                                            allStructuresData.filter(
                                                (structure) =>
                                                    taggedShortNames.has(
                                                        structure.shortName?.toLowerCase()
                                                    )
                                            );
                                        setStructures(validStructures);
                                        setTotalStructureCount(
                                            validStructures.length
                                        );
                                        setLoading(false);
                                        return;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        console.warn("Error checking custom tags:", err);
                    }
                }

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
                    if (isCategory || isDataType) {
                        setStructures([]);
                        setTotalStructureCount(0);
                        setLoading(false);
                        return;
                    }
                    throw new Error("Failed to fetch data");
                }
                const data = await response.json();

                if (
                    (isCategory || isDataType) &&
                    (!data || data.length === 0)
                ) {
                    setStructures([]);
                    setTotalStructureCount(0);
                    setLoading(false);
                    return;
                }

                setTotalStructureCount(data.length);

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
            }
        } catch (err) {
            setError("Error fetching data: " + err.message);
        } finally {
            setLoading(false);
        }
    }, [databaseFilterEnabled, databaseStructures, searchTerm, apiBaseUrl]);

    useEffect(() => {
        if (searchTerm) {
            const debounceTimer = setTimeout(() => {
                fetchData();
            }, 300);
            return () => clearTimeout(debounceTimer);
        } else {
            setStructures([]);
        }
    }, [searchTerm, fetchData]);

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
                                        setActiveTab(Tabs.DICTIONARY)
                                    }
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.DICTIONARY
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
                                    onClick={() => setActiveTab(Tabs.STRUCTURE)}
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.STRUCTURE
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
                                    onClick={() => setActiveTab(Tabs.ELEMENT)}
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.ELEMENT
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
                                        setActiveTab(Tabs.REVERSE_LOOKUP)
                                    }
                                    className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === Tabs.REVERSE_LOOKUP
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
            <div className={activeTab === Tabs.STRUCTURE ? "block" : "hidden"}>
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
                        setElementSearchTerm(elementName);
                        setActiveTab(Tabs.ELEMENT);
                    }}
                />
            </div>

            <div className={activeTab === Tabs.DICTIONARY ? "block" : "hidden"}>
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
                className={
                    activeTab === Tabs.REVERSE_LOOKUP ? "block" : "hidden"
                }
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

                        setActiveTab(Tabs.STRUCTURE);
                    }}
                />
            </div>

            <div className={activeTab === Tabs.ELEMENT ? "block" : "hidden"}>
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
                    initialSearchTerm={elementSearchTerm}
                    onClearInitialSearchTerm={() => setElementSearchTerm("")}
                />
            </div>
        </div>
    );
};

export default HomePage;

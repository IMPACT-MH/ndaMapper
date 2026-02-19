"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import DataStructureSearch from "./DataStructureSearch";
import CSVHeaderAnalyzer from "./CSVHeaderAnalyzer";
import DataElementSearch from "./DataElementSearch";
import DataCategorySearch from "./DataCategorySearch";
import { IMPACT_API_BASE, DATA_STRUCTURES } from "@/const";
import type {
  DataStructure,
  DataElement,
  CustomTag,
} from "@/types";

// Derive validator state types from DataStructureSearch to stay in sync with CSVValidator's local types
type _ValidatorStateProp = NonNullable<React.ComponentProps<typeof DataStructureSearch>["validatorState"]>;
type ValidationResults = _ValidatorStateProp["validationResults"];
type ValueError = _ValidatorStateProp["valueErrors"][number];
type TransformationCounts = _ValidatorStateProp["transformationCounts"];

const Tabs = {
    DICTIONARY: "data-dictionary",
    STRUCTURE: "data-structures",
    ELEMENT: "data-elements",
    REVERSE_LOOKUP: "reverse-lookup",
} as const;

type TabValue = typeof Tabs[keyof typeof Tabs];

// Backwards compatibility for previously stored tab values
const normalizeTab = (tab: string | null): TabValue | null => {
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
            return (Object.values(Tabs) as string[]).includes(tab)
                ? (tab as TabValue)
                : null;
    }
};

void normalizeTab; // defined for backwards-compatibility but not called at runtime

const HomePage = () => {
    const [searchTerm, setSearchTerm] = useState(""); // For structure search
    const [elementSearchTerm, setElementSearchTerm] = useState(""); // For element search
    const [structures, setStructures] = useState<DataStructure[]>([]);
    const [totalStructureCount, setTotalStructureCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedStructure, setSelectedStructure] = useState<DataStructure | null>(null);
    const [dataElements, setDataElements] = useState<DataElement[]>([]);
    const [loadingElements, setLoadingElements] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    void isSearchFocused;

    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabValue>(Tabs.DICTIONARY);

    // Database filter state
    const [databaseFilterEnabled, setDatabaseFilterEnabled] = useState(true);
    const [databaseStructures, setDatabaseStructures] = useState<string[]>([]);
    const [databaseSites, setDatabaseSites] = useState<string[]>([]);
    const [databaseName, setDatabaseName] = useState("IMPACT-MH");
    void databaseName;

    // Database elements state for DataElementSearch
    const [databaseElements, setDatabaseElements] = useState<Map<string, DataElement>>(new Map());
    const [loadingDatabaseElements, setLoadingDatabaseElements] =
        useState(false);

    // Database structures loading state
    const [loadingDatabaseStructures, setLoadingDatabaseStructures] =
        useState(false);

    // Database connection error state
    const [databaseConnectionError, setDatabaseConnectionError] =
        useState<string | null>(null);

    // Tags state for custom tag searches
    const [structureDataTypeTags, setStructureDataTypeTags] = useState<Record<string, CustomTag[]>>({});
    void structureDataTypeTags;
    void setStructureDataTypeTags;
    const apiBaseUrl = "/api/v1";

    // Browser history integration for tabs
    useEffect(() => {
        // ALWAYS start on Data Dictionary on page load/refresh
        setActiveTab(Tabs.DICTIONARY);

        if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname);
        } else if ((window.history.state as { tab?: string } | null)?.tab) {
            window.history.replaceState(null, "", window.location.pathname);
        }

        setIsLoading(false);
    }, []);

    // Handle browser back/forward buttons
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            const state = event.state as { tab?: string } | null;
            if (state?.tab && (Object.values(Tabs) as string[]).includes(state.tab)) {
                setActiveTab(state.tab as TabValue);
            } else {
                const hash = window.location.hash.replace("#", "");
                const urlTab = (Object.values(Tabs) as string[]).find((tab) => hash === tab);
                if (urlTab) {
                    setActiveTab(urlTab as TabValue);
                } else {
                    setActiveTab(Tabs.DICTIONARY);
                }
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Update browser history when tab changes (for back/forward navigation only)
    useEffect(() => {
        if (isLoading) return;

        if (activeTab !== Tabs.DICTIONARY) {
            const newHash = `#${activeTab}`;
            const newUrl = window.location.pathname + newHash;
            window.history.replaceState({ tab: activeTab }, "", newUrl);
        } else {
            if (window.location.hash) {
                window.history.replaceState(null, "", window.location.pathname);
            }
        }
    }, [activeTab, isLoading]);

    // Fetch database data once when filter is enabled
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
        setDatabaseConnectionError(null);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(
                `${IMPACT_API_BASE}${DATA_STRUCTURES}`,
                {
                    signal: controller.signal,
                }
            );
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json() as {
                    dataStructures: Record<string, DataStructure>;
                } | null;

                if (
                    data &&
                    data.dataStructures &&
                    typeof data.dataStructures === "object"
                ) {
                    const structureNames = Object.keys(data.dataStructures);
                    setDatabaseStructures(structureNames);

                    const allSites = new Set<string>();
                    Object.values(data.dataStructures).forEach((structure) => {
                        if (structure.submittedByProjects && Array.isArray(structure.submittedByProjects)) {
                            structure.submittedByProjects.forEach(site => allSites.add(site));
                        }
                    });
                    setDatabaseSites(Array.from(allSites).sort());

                    const allElements = new Map<string, DataElement>();
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
                    setDatabaseConnectionError(null);
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
            if (error instanceof Error && error.name === "AbortError") {
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

    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null);
    void csvHeaders;

    // State for CSVValidator
    const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({});
    const [ignoredFields, setIgnoredFields] = useState<Set<string>>(new Set());
    const [validationResults, setValidationResults] = useState<ValidationResults>(null);
    const [valueErrors, setValueErrors] = useState<ValueError[]>([]);
    const [transformationCounts, setTransformationCounts] = useState<TransformationCounts>({
        handedness: 0,
        binary: 0,
    });

    const handleElementStructureSelect = async (structureName: string) => {
        setActiveTab(Tabs.STRUCTURE);
        setSearchTerm(structureName);

        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${structureName}`
            );
            if (response.ok) {
                const fetchedStructures = await response.json() as DataStructure[];
                const exactMatch = fetchedStructures.find(
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

    const handleElementDetailStructureSelect = async (structureName: string) => {
        setActiveTab(Tabs.STRUCTURE);

        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${structureName}`
            );
            if (response.ok) {
                const fetchedStructures = await response.json() as DataStructure[];
                const exactMatch = fetchedStructures.find(
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

    const handleCategoryStructureSelect = async (structureName: string) => {
        setActiveTab(Tabs.STRUCTURE);
        setSearchTerm(structureName);

        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${structureName}`
            );
            if (response.ok) {
                const fetchedStructures = await response.json() as DataStructure[];
                const exactMatch = fetchedStructures.find(
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

    const handleCsvAnalyzerResult = (shortName: string, file: File, headers: string[]) => {
        void headers;
        setSearchTerm(shortName);
        setCsvFile(file);
        setCsvHeaders(headers);
        setActiveTab(Tabs.DICTIONARY);
    };
    void handleCsvAnalyzerResult;

    const handleClearSearch = () => {
        setSearchTerm("");
        setCsvFile(null);
        setSelectedStructure(null);
    };

    const fetchDatabaseFilteredData = useCallback(async () => {
        const searchLower = searchTerm.toLowerCase();
        const normalizedSearch = searchLower.replace(/[_-]/g, "");

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

        const isCategory = searchTerm.startsWith("category:");
        const isDataType = searchTerm.startsWith("datatype:");
        const searchValue = isCategory
            ? searchTerm.replace("category:", "")
            : isDataType
            ? searchTerm.replace("datatype:", "")
            : searchTerm;

        let allData: DataStructure[] = [];
        if (isCategory || isDataType) {
            try {
                const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
                if (tagsResponse.ok) {
                    const allTags = await tagsResponse.json() as CustomTag[];
                    const customTag = allTags.find((tag) => {
                        if (isCategory) {
                            return (
                                (tag.tagType === "Category" ||
                                    !tag.tagType ||
                                    (tag.tagType as string) === "") &&
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
                            const dsData = await dsResponse.json() as { dataStructures: DataStructure[] };
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
                                    await allStructuresResponse.json() as DataStructure[];
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

        if (allData.length === 0) {
            let endpoint: string;
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
                    return;
                }
                throw new Error("Failed to fetch data");
            }
            allData = await response.json() as DataStructure[];

            if (
                (isCategory || isDataType) &&
                (!allData || allData.length === 0)
            ) {
                setStructures([]);
                setTotalStructureCount(0);
                return;
            }
        }

        const filteredData = allData.filter((structure) => {
            const structureNameLower = structure.shortName.toLowerCase();
            const databaseStructuresLower = databaseStructures.map((name) =>
                name.toLowerCase()
            );
            return databaseStructuresLower.includes(structureNameLower);
        });

        setTotalStructureCount(filteredData.length);

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
                    const allTags = await tagsResponse.json() as CustomTag[];
                    const customTag = allTags.find((tag) => {
                        if (isCategory) {
                            return (
                                (tag.tagType === "Category" ||
                                    !tag.tagType ||
                                    (tag.tagType as string) === "") &&
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
                            const dsData = await dsResponse.json() as { dataStructures: DataStructure[] };
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
                                    await allStructuresResponse.json() as DataStructure[];
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
            }
        }

        let endpoint: string;
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
                return;
            }
            throw new Error("Failed to fetch data");
        }
        const data = await response.json() as DataStructure[];

        if ((isCategory || isDataType) && (!data || data.length === 0)) {
            setStructures([]);
            setTotalStructureCount(0);
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

    void fetchDatabaseFilteredData;
    void fetchAllData;

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (databaseFilterEnabled && databaseStructures.length > 0) {
                const searchLower = searchTerm.toLowerCase();
                const normalizedSearch = searchLower.replace(/[_-]/g, "");

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

                const isCategory = searchTerm.startsWith("category:");
                const isDataType = searchTerm.startsWith("datatype:");
                const searchValue = isCategory
                    ? searchTerm.replace("category:", "")
                    : isDataType
                    ? searchTerm.replace("datatype:", "")
                    : searchTerm;

                let allData: DataStructure[] = [];
                if (isCategory || isDataType) {
                    try {
                        const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
                        if (tagsResponse.ok) {
                            const allTags = await tagsResponse.json() as CustomTag[];
                            const customTag = allTags.find((tag) => {
                                if (isCategory) {
                                    return (
                                        (tag.tagType === "Category" ||
                                            !tag.tagType ||
                                            (tag.tagType as string) === "") &&
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
                                    const dsData = await dsResponse.json() as { dataStructures: DataStructure[] };
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
                                            await allStructuresResponse.json() as DataStructure[];
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

                if (allData.length === 0) {
                    let endpoint: string;
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
                    allData = await response.json() as DataStructure[];

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

                const filteredData = allData.filter((structure) => {
                    const structureNameLower =
                        structure.shortName.toLowerCase();
                    const databaseStructuresLower = databaseStructures.map(
                        (name) => name.toLowerCase()
                    );
                    return databaseStructuresLower.includes(structureNameLower);
                });

                setTotalStructureCount(filteredData.length);

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
                            const allTags = await tagsResponse.json() as CustomTag[];
                            const customTag = allTags.find((tag) => {
                                if (isCategory) {
                                    return (
                                        (tag.tagType === "Category" ||
                                            !tag.tagType ||
                                            (tag.tagType as string) === "") &&
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
                                    const dsData = await dsResponse.json() as { dataStructures: DataStructure[] };
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
                                            await allStructuresResponse.json() as DataStructure[];
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

                let endpoint: string;
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
                const data = await response.json() as DataStructure[];

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
            setError("Error fetching data: " + (err instanceof Error ? err.message : String(err)));
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

    const fetchDataElements = async (shortName: string) => {
        setLoadingElements(true);
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`
            );
            if (!response.ok) throw new Error("Failed to fetch data elements");
            const data = await response.json() as { dataElements: DataElement[] };

            const sortedElements = data.dataElements.sort(
                (a, b) => (a.position ?? 0) - (b.position ?? 0)
            );

            setDataElements(sortedElements);
        } catch (err) {
            console.error("Parsing error:", err);
            setError("Error fetching data elements: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setLoadingElements(false);
        }
    };

    const handleStructureSearch = (shortName: string) => {
        setSearchTerm(shortName);
    };

    const handleStructureSelect = (structure: DataStructure) => {
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
        setTransformationCounts({ handedness: 0, binary: 0 } as TransformationCounts);
    };

    const handleCsvFileChange = (file: File) => {
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
                                <a
                                    href="https://nda.nih.gov/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-12 h-12 relative block hover:opacity-80 transition-opacity"
                                    aria-label="Visit NDA website"
                                >
                                    <Image
                                        src="/nda.png"
                                        alt="NDA Logo"
                                        width={48}
                                        height={48}
                                        className="object-contain"
                                    />
                                </a>
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
                    databaseFilterEnabled={databaseFilterEnabled}
                    setDatabaseFilterEnabled={setDatabaseFilterEnabled}
                    databaseStructures={databaseStructures}
                    databaseSites={databaseSites}
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
                            const data = await response.json() as DataStructure[];

                            const structure = data.find(
                                (s) => s.shortName === shortName
                            );
                            if (structure) {
                                handleStructureSelect(structure);
                            }
                        } catch (err) {
                            setError(
                                "Error fetching structure: " + (err instanceof Error ? err.message : String(err))
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
                    isVisible={activeTab === Tabs.ELEMENT}
                />
            </div>
        </div>
    );
};

export default HomePage;

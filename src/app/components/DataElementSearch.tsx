"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Search, X, AlertCircle, Info, Database } from "lucide-react";
import { NDA_SEARCH_FULL } from "@/const";
import type { DataElement, DataStructure } from "@/types";

interface ElementStructureRef {
  shortName: string;
  title: string;
  category: string;
}

interface ElementSearchResult {
  name: string;
  type: string;
  description: string;
  notes?: string;
  valueRange?: string;
  size?: string | number;
  dataStructures: (string | ElementStructureRef)[];
  total_data_structures?: number;
  _score?: number;
  searchTerms?: string[];
  matchType?: string;
  inDatabase?: boolean;
  loading?: boolean;
}

// Extends DataStructure to include the legacy `name` field present in some API responses
interface DbStructureEntry extends DataStructure {
  name?: string;
}

interface NdaElementResult {
  name: string;
  type?: string;
  _score?: number;
  dataStructures?: Array<{
    shortName: string;
    title?: string;
    category?: string;
  }>;
}

interface DataElementSearchProps {
  onStructureSelect: (shortName: string) => void;
  onElementDetailStructureSelect: (shortName: string) => void;
  databaseFilterEnabled: boolean;
  setDatabaseFilterEnabled: (enabled: boolean) => void;
  databaseElements: Map<string, DataElement>;
  setDatabaseElements: React.Dispatch<React.SetStateAction<Map<string, DataElement>>>;
  loadingDatabaseElements: boolean;
  setLoadingDatabaseElements: React.Dispatch<React.SetStateAction<boolean>>;
  databaseName: string;
  databaseConnectionError: string | null;
  initialSearchTerm?: string | null;
  onClearInitialSearchTerm?: (() => void) | null;
  isVisible?: boolean;
}

const DataElementSearch = ({
    onStructureSelect,
    onElementDetailStructureSelect,
    databaseFilterEnabled,
    setDatabaseFilterEnabled,
    databaseElements,
    setDatabaseElements: _setDatabaseElements,
    loadingDatabaseElements,
    setLoadingDatabaseElements: _setLoadingDatabaseElements,
    databaseName,
    databaseConnectionError,
    initialSearchTerm,
    onClearInitialSearchTerm,
    isVisible = true,
}: DataElementSearchProps) => {
    void _setDatabaseElements;
    void _setLoadingDatabaseElements;

    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [element, setElement] = useState<ElementSearchResult | null>(null);
    const [matchingElements, setMatchingElements] = useState<ElementSearchResult[]>([]);
    const [isPartialSearch, setIsPartialSearch] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [totalElementCount, setTotalElementCount] = useState(0);
    const [dataStructuresMap, setDataStructuresMap] = useState<Record<string, DbStructureEntry>>({});
    const [hasProcessedInitialSearch, setHasProcessedInitialSearch] =
        useState(false);
    const [preferExactMatch, setPreferExactMatch] = useState(false);
    const preferExactMatchRef = useRef(false);
    void preferExactMatchRef;
    const isInitialMount = useRef(true);
    const [isMounted, setIsMounted] = useState(false);
    const previousInitialSearchTerm = useRef<string | null | undefined>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("elementSearchHistory");
            if (saved) {
                setRecentSearches(JSON.parse(saved) as string[]);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined" && isMounted) {
            localStorage.setItem(
                "elementSearchHistory",
                JSON.stringify(recentSearches)
            );
        }
    }, [recentSearches, isMounted]);

    // Fetch database structures map for projects info
    useEffect(() => {
        const fetchDataStructures = async () => {
            try {
                const response = await fetch("/api/v1/data-structures");
                const data = await response.json() as { dataStructures: DbStructureEntry[] | Record<string, DbStructureEntry> } | null;

                if (data && data.dataStructures) {
                    const map: Record<string, DbStructureEntry> = {};
                    const structures = Array.isArray(data.dataStructures)
                        ? data.dataStructures
                        : Object.values(data.dataStructures);

                    structures.forEach((structure) => {
                        const key =
                            structure.shortName?.toLowerCase() ||
                            structure.name?.toLowerCase();
                        if (key) {
                            map[key] = structure;
                            if (structure.shortName) {
                                map[structure.shortName] = structure;
                            }
                        }
                    });
                    setDataStructuresMap(map);
                }
            } catch (err) {
                console.error("Error fetching data structures:", err);
            }
        };

        fetchDataStructures();
    }, []);

    // Browser history integration
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handlePopState = (event: PopStateEvent) => {
            const state = event.state as {
                view?: string;
                element?: ElementSearchResult;
                results?: ElementSearchResult[];
            } | null;
            if (state) {
                if (state.view === "element" && state.element) {
                    setElement(state.element);
                    setIsPartialSearch(false);
                } else if (state.view === "results" && state.results) {
                    setMatchingElements(state.results);
                    setIsPartialSearch(true);
                    setElement(null);
                } else if (state.view === "search") {
                    setMatchingElements([]);
                    setIsPartialSearch(false);
                    setElement(null);
                }
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Function to push state to browser history
    const pushHistoryState = useCallback((
        view: "element" | "results" | "search",
        data: {
            element?: ElementSearchResult;
            results?: ElementSearchResult[];
            searchTerm?: string;
        }
    ) => {
        if (typeof window === "undefined") return;

        const state = { view, ...data };
        window.history.pushState(
            state,
            "",
            window.location.pathname + window.location.search
        );
    }, []);

    const updateRecentSearches = useCallback((newTerm: string) => {
        setRecentSearches((prev) => {
            if (!prev.includes(newTerm)) {
                return [newTerm, ...prev].slice(0, 10);
            }
            return prev;
        });
    }, []);

    const highlightSearchTerm = (text: string, searchTerms: string | string[]): React.ReactNode => {
        if (!text || !searchTerms?.length) return text;

        try {
            const terms = Array.isArray(searchTerms)
                ? searchTerms.filter(t => t && t.trim())
                : [searchTerms].filter(t => t && t.trim());

            if (terms.length === 0) return text;

            const pattern = terms
                .map((term) => term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("|");
            const regex = new RegExp(`(${pattern})`, "gi");

            const parts = text.split(regex);
            return parts.map((part, i) => {
                const isMatch = terms.some(
                    (term) => part.toLowerCase().includes(term.trim().toLowerCase())
                );
                return isMatch ? (
                    <span key={i} className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-sm font-medium inline-block">
                        {part}
                    </span>
                ) : (
                    part
                );
            });
        } catch (err) {
            console.error("Error highlighting text:", err);
            return text;
        }
    };

    const isElementInDatabase = useCallback(
        (elementName: string) => {
            return databaseElements.has(elementName.toLowerCase());
        },
        [databaseElements]
    );

    // Search within database elements for matching terms
    const searchDatabaseElements = useCallback(
        (term: string, exactMatch = false): ElementSearchResult[] => {
            const searchLower = term.toLowerCase();
            const matches: ElementSearchResult[] = [];

            for (const [elementName, elementData] of databaseElements) {
                let nameMatch = false;
                let descriptionMatch = false;
                let notesMatch = false;

                if (exactMatch) {
                    nameMatch = elementName.toLowerCase() === searchLower;
                } else {
                    nameMatch = elementName.includes(searchLower);
                    descriptionMatch = elementData.description
                        ?.toLowerCase()
                        .includes(searchLower) ?? false;
                    notesMatch = elementData.notes
                        ?.toLowerCase()
                        .includes(searchLower) ?? false;
                }

                if (nameMatch || descriptionMatch || notesMatch) {
                    matches.push({
                        name: elementData.name,
                        type: elementData.type || "String",
                        description:
                            elementData.description ||
                            "No description available",
                        notes: elementData.notes,
                        valueRange: elementData.valueRange,
                        _score: nameMatch ? 100 : descriptionMatch ? 50 : 25,
                        searchTerms: [term],
                        matchType: nameMatch
                            ? exactMatch
                                ? "exact"
                                : "name"
                            : descriptionMatch
                            ? "description"
                            : "notes",
                        inDatabase: true,
                        dataStructures: [],
                    });
                }
            }

            return matches.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
        },
        [databaseElements]
    );

    // Database search function that accepts a term directly (for recent searches)
    const searchDatabaseElementsWithTerm = useCallback(
        (term: string) => {
            return searchDatabaseElements(term, false);
        },
        [searchDatabaseElements]
    );

    // Helper function to get structures containing an element
    const getStructuresContainingElement = useCallback(
        (elementName: string): string[] => {
            if (!elementName || Object.keys(dataStructuresMap).length === 0) {
                return [];
            }

            const elementNameLower = elementName.toLowerCase();
            const structuresContainingElement: string[] = [];

            Object.values(dataStructuresMap).forEach((dbStructure) => {
                if (
                    dbStructure.dataElements &&
                    Array.isArray(dbStructure.dataElements)
                ) {
                    const hasElement = dbStructure.dataElements.some(
                        (el) => el.name?.toLowerCase() === elementNameLower
                    );
                    if (hasElement && dbStructure.shortName) {
                        structuresContainingElement.push(dbStructure.shortName);
                    }
                }
            });

            return structuresContainingElement;
        },
        [dataStructuresMap]
    );

    // Helper function to calculate boosted score for sorting
    const getBoostedScore = useCallback((el: ElementSearchResult) => {
        const baseScore = el._score || 0;
        const databaseBoost = el.inDatabase ? 1000 : 0;
        return baseScore + databaseBoost;
    }, []);

    // Helper function to try direct element fetch
    const tryDirectElementFetch = useCallback(async (elementName: string): Promise<ElementSearchResult | null> => {
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/dataelement/${encodeURIComponent(
                    elementName
                )}`
            );

            if (response.ok) {
                const elementData = await response.json() as ElementSearchResult;
                if (elementData && elementData.name) {
                    return elementData;
                }
            }
        } catch (error) {
            console.log("Direct element fetch failed:", error instanceof Error ? error.message : String(error));
        }
        return null;
    }, []);

    // Original handleSearch function for backward compatibility
    const handleSearch = () => handleSearchWithFilter();

    // Modified handleSearch function that accepts filter state as parameter
    const handleSearchWithFilter = async (customFilterEnabled: boolean | null = null) => {
        if (!searchTerm.trim()) return;

        const effectiveFilterEnabled =
            customFilterEnabled !== null
                ? customFilterEnabled
                : databaseFilterEnabled;

        setLoading(true);
        setError(null);
        setElement(null);
        setMatchingElements([]);
        setIsPartialSearch(false);

        try {
            if (effectiveFilterEnabled && databaseElements.size > 0) {
                if (preferExactMatch) {
                    const exactDatabaseMatch = searchDatabaseElements(
                        searchTerm.trim(),
                        true
                    );

                    if (exactDatabaseMatch.length > 0) {
                        const match = exactDatabaseMatch[0];
                        const structuresContainingElement =
                            getStructuresContainingElement(match.name);

                        const elementData: ElementSearchResult = {
                            ...match,
                            dataStructures: structuresContainingElement,
                            loading: false,
                        };
                        setElement(elementData);
                        setIsPartialSearch(false);
                        updateRecentSearches(searchTerm.trim());
                        pushHistoryState("element", {
                            element: elementData,
                        });
                        setLoading(false);
                        return;
                    }
                }

                const databaseMatches = searchDatabaseElements(
                    searchTerm.trim(),
                    false
                );

                if (databaseMatches.length > 0) {
                    setMatchingElements(databaseMatches);
                    setIsPartialSearch(true);
                    setTotalElementCount(databaseMatches.length);
                    updateRecentSearches(searchTerm.trim());

                    pushHistoryState("results", {
                        results: databaseMatches,
                        searchTerm: searchTerm.trim(),
                    });

                    setLoading(false);
                    return;
                } else {
                    const directElement = await tryDirectElementFetch(
                        searchTerm.trim()
                    );
                    if (directElement) {
                        setError(
                            `The element "${searchTerm}" exists in NDA but is not in your database. Try disabling the database filter to view it.`
                        );
                    } else {
                        setError(
                            `No data elements found containing "${searchTerm}" in your database. Try disabling the database filter to search all NDA elements.`
                        );
                    }
                    setLoading(false);
                    return;
                }
            }

            const searchQuery = searchTerm.trim();

            if (preferExactMatch) {
                const directElement = await tryDirectElementFetch(searchQuery);
                if (directElement) {
                    const inDb = isElementInDatabase(directElement.name);

                    const elementData: ElementSearchResult = {
                        ...directElement,
                        inDatabase: inDb,
                        searchTerms: [searchQuery],
                        matchType: "exact",
                    };

                    setElement(elementData);
                    setIsPartialSearch(false);
                    updateRecentSearches(searchQuery);

                    pushHistoryState("element", {
                        element: elementData,
                    });

                    setLoading(false);
                    return;
                }
            }

            if (searchQuery.length < 3) {
                setError(
                    "Search term must be at least 3 characters long for Elasticsearch"
                );
                setLoading(false);
                return;
            }

            const esQuery = searchQuery;

            const searchUrl = NDA_SEARCH_FULL("nda", "dataelement", {
                size: 1000,
                highlight: true,
                ddsize: 100,
            });

            const partialResponse = await fetch(searchUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain",
                },
                body: esQuery,
            });

            if (!partialResponse.ok) {
                const statusText =
                    partialResponse.statusText || "Unknown error";
                const status = partialResponse.status;

                if (status === 400) {
                    let errorMessage = "Bad Request";
                    try {
                        const clonedResponse = partialResponse.clone();
                        const errorText = await clonedResponse.text();
                        if (errorText) {
                            try {
                                const errorData = JSON.parse(errorText) as { message?: string; error?: string };
                                errorMessage =
                                    errorData.message ||
                                    errorData.error ||
                                    errorText;
                            } catch {
                                errorMessage = errorText;
                            }
                        }
                    } catch {
                        errorMessage = statusText;
                    }

                    if (searchQuery.length < 3) {
                        setError(
                            `Search term "${searchQuery}" is too short. Elasticsearch requires at least 3 characters.`
                        );
                        setLoading(false);
                        return;
                    }

                    setError(
                        `Search failed (400): ${errorMessage}. The query "${searchQuery}" may not be supported by the Elasticsearch API. Try a different search term or check the query syntax.`
                    );
                    setLoading(false);
                    return;
                }

                if (status === 500) {
                    setError(
                        `The search query "${searchTerm}" may be too broad or complex for the NDA API. Try using more specific search terms.`
                    );
                } else if (status === 429) {
                    setError(
                        "Too many requests. Please wait a moment and try again."
                    );
                } else if (status === 408 || status === 504) {
                    setError(
                        "Search request timed out. Try using more specific search terms."
                    );
                } else {
                    setError(
                        `Search failed (${status}: ${statusText}). Try using different search terms or check your connection.`
                    );
                }
                setLoading(false);
                return;
            }

            const searchResults = await partialResponse.json() as {
                datadict?: { results?: NdaElementResult[] };
            };

            if (!searchResults?.datadict?.results?.length) {
                if (effectiveFilterEnabled && databaseElements.size > 0) {
                    setError(
                        `No data elements found containing "${searchTerm}" in your database. Try disabling the database filter to search all NDA elements.`
                    );
                    setLoading(false);
                    return;
                } else if (
                    !effectiveFilterEnabled &&
                    databaseElements.size > 0
                ) {
                    const databaseMatches = searchDatabaseElements(
                        searchQuery,
                        false
                    );

                    if (databaseMatches.length > 0) {
                        setMatchingElements(databaseMatches);
                        setIsPartialSearch(true);
                        setTotalElementCount(databaseMatches.length);
                        updateRecentSearches(searchTerm.trim());

                        pushHistoryState("results", {
                            results: databaseMatches,
                            searchTerm: searchTerm.trim(),
                        });

                        setLoading(false);
                        return;
                    }
                }

                setError(`No data elements found containing "${searchTerm}"`);
                setLoading(false);
                return;
            }

            setTotalElementCount(searchResults.datadict.results.length);

            const elementDetails = await Promise.all(
                searchResults.datadict.results.map(async (result): Promise<ElementSearchResult | null> => {
                    try {
                        if (
                            !result ||
                            !result.name ||
                            typeof result.name !== "string"
                        ) {
                            console.warn("Invalid result object:", result);
                            return null;
                        }

                        let response: Response;
                        try {
                            response = await fetch(
                                `https://nda.nih.gov/api/datadictionary/dataelement/${result.name}`
                            );
                        } catch (fetchError) {
                            console.warn(
                                `Network error fetching details for ${result.name}:`,
                                fetchError instanceof Error ? fetchError.message : String(fetchError)
                            );
                            return null;
                        }

                        if (!response.ok) {
                            console.warn(
                                `Failed to fetch details for ${result.name}, status: ${response.status}`
                            );
                            return null;
                        }

                        let fullData: Partial<DataElement>;
                        try {
                            fullData = await response.json() as Partial<DataElement>;
                        } catch (jsonError) {
                            console.warn(
                                `Failed to parse JSON for ${result.name}:`,
                                jsonError instanceof Error ? jsonError.message : String(jsonError)
                            );
                            return null;
                        }

                        return {
                            name: result.name,
                            type: fullData.type || result.type || "Text",
                            description:
                                fullData.description ||
                                "No description available",
                            notes: fullData.notes,
                            valueRange: fullData.valueRange,
                            dataStructures:
                                result.dataStructures?.map((ds) => ({
                                    shortName: ds.shortName,
                                    title: ds.title || "",
                                    category: ds.category || "",
                                })) || [],
                            total_data_structures:
                                result.dataStructures?.length || 0,
                            _score: result._score,
                            searchTerms: [searchQuery],
                            matchType: result.name
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase())
                                ? "name"
                                : "description",
                            inDatabase: isElementInDatabase(result.name),
                        };
                    } catch (err) {
                        console.error(
                            `Error fetching details for ${result.name}:`,
                            err
                        );
                        return null;
                    }
                })
            );

            let validElements = elementDetails.filter((el): el is ElementSearchResult => el !== null);

            if (!effectiveFilterEnabled && databaseElements.size > 0) {
                const databaseMatches = searchDatabaseElements(
                    searchQuery,
                    false
                );

                const existingElementsMap = new Map<string, ElementSearchResult>();
                validElements.forEach((el) => {
                    existingElementsMap.set(el.name.toLowerCase(), el);
                });

                databaseMatches.forEach((dbMatch) => {
                    const key = dbMatch.name.toLowerCase();
                    if (!existingElementsMap.has(key)) {
                        existingElementsMap.set(key, dbMatch);
                        validElements.push(dbMatch);
                    } else {
                        const existing = existingElementsMap.get(key);
                        if (existing) {
                            existing.inDatabase = true;
                        }
                    }
                });
            }

            if (effectiveFilterEnabled && databaseElements.size > 0) {
                validElements = validElements.filter(
                    (el) => el.inDatabase
                );
            }

            validElements = validElements.sort((a, b) => {
                const searchLower = searchQuery.toLowerCase();
                const aExact = a.name.toLowerCase() === searchLower;
                const bExact = b.name.toLowerCase() === searchLower;

                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                const aBoosted = getBoostedScore(a);
                const bBoosted = getBoostedScore(b);
                return bBoosted - aBoosted;
            });

            setMatchingElements(validElements);
            setIsPartialSearch(true);
            updateRecentSearches(searchTerm.trim());

            pushHistoryState("results", {
                results: validElements,
                searchTerm: searchTerm.trim(),
            });
        } catch (err) {
            console.error("Search error:", err);

            if (err instanceof Error) {
                if (err.name === "TypeError" && err.message.includes("fetch")) {
                    setError(
                        "Network connection error. Please check your internet connection and try again."
                    );
                } else if (err.message.includes("JSON")) {
                    setError(
                        "Received invalid response from search API. Try a different search term or try again later."
                    );
                } else if (err.message.includes("timeout")) {
                    setError(
                        "Search request timed out. Try using more specific search terms."
                    );
                } else {
                    setError(`Search error: ${err.message}`);
                }
            } else {
                setError(`Search error: ${String(err)}`);
            }
        } finally {
            setLoading(false);
        }
    };

    // Search function that accepts a term directly (for recent searches)
    const handleSearchWithTerm = useCallback(
        async (term: string) => {
            if (!term.trim()) return;

            setLoading(true);
            setError(null);
            setElement(null);
            setMatchingElements([]);
            setIsPartialSearch(false);

            try {
                if (databaseFilterEnabled && databaseElements.size > 0) {
                    if (preferExactMatch) {
                        const exactDatabaseMatch = searchDatabaseElements(
                            term.trim(),
                            true
                        );

                        if (exactDatabaseMatch.length > 0) {
                            const match = exactDatabaseMatch[0];
                            const structuresContainingElement =
                                getStructuresContainingElement(match.name);

                            const elementData: ElementSearchResult = {
                                ...match,
                                dataStructures: structuresContainingElement,
                                loading: false,
                            };
                            setElement(elementData);
                            setIsPartialSearch(false);
                            updateRecentSearches(term.trim());
                            pushHistoryState("element", {
                                element: elementData,
                            });
                            setLoading(false);
                            return;
                        }
                    }

                    const databaseMatches = searchDatabaseElementsWithTerm(
                        term.trim()
                    );

                    if (databaseMatches.length > 0) {
                        setMatchingElements(databaseMatches);
                        setIsPartialSearch(true);
                        setTotalElementCount(databaseMatches.length);
                        updateRecentSearches(term.trim());

                        pushHistoryState("results", {
                            results: databaseMatches,
                            searchTerm: term.trim(),
                        });

                        setLoading(false);
                        return;
                    } else {
                        const directElement = await tryDirectElementFetch(
                            term.trim()
                        );
                        if (directElement) {
                            setError(
                                `The element "${term}" exists in NDA but is not in your database. Try disabling the database filter to view it.`
                            );
                        } else {
                            setError(
                                `No data elements found containing "${term}" in your database. Try disabling the database filter to search all NDA elements.`
                            );
                        }
                        setLoading(false);
                        return;
                    }
                }

                const searchQuery = term.trim();

                if (preferExactMatch) {
                    const directElement = await tryDirectElementFetch(searchQuery);
                    if (directElement) {
                        const inDb = isElementInDatabase(directElement.name);

                        const elementData: ElementSearchResult = {
                            ...directElement,
                            inDatabase: inDb,
                            searchTerms: [searchQuery],
                            matchType: "exact",
                        };

                        setElement(elementData);
                        setIsPartialSearch(false);
                        updateRecentSearches(searchQuery);

                        pushHistoryState("element", {
                            element: elementData,
                        });

                        setLoading(false);
                        return;
                    }
                }

                if (searchQuery.length < 3) {
                    setError(
                        "Search term must be at least 3 characters long for Elasticsearch"
                    );
                    setLoading(false);
                    return;
                }

                const esQuery = searchQuery;

                const searchUrl = NDA_SEARCH_FULL("nda", "dataelement", {
                    size: 1000,
                    highlight: true,
                    ddsize: 100,
                });

                const partialResponse = await fetch(searchUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "text/plain",
                    },
                    body: esQuery,
                });

                if (!partialResponse.ok) {
                    const statusText =
                        partialResponse.statusText || "Unknown error";
                    const status = partialResponse.status;

                    if (status === 400) {
                        let errorMessage = "Bad Request";
                        try {
                            const clonedResponse = partialResponse.clone();
                            const errorText = await clonedResponse.text();
                            if (errorText) {
                                try {
                                    const errorData = JSON.parse(errorText) as { message?: string; error?: string };
                                    errorMessage =
                                        errorData.message ||
                                        errorData.error ||
                                        errorText;
                                } catch {
                                    errorMessage = errorText;
                                }
                            }
                        } catch {
                            errorMessage = statusText;
                        }

                        if (searchQuery.length < 3) {
                            setError(
                                `Search term "${searchQuery}" is too short. Elasticsearch requires at least 3 characters.`
                            );
                            setLoading(false);
                            return;
                        }

                        setError(
                            `Search failed (400): ${errorMessage}. The query "${searchQuery}" may not be supported by the Elasticsearch API. Try a different search term or check the query syntax.`
                        );
                        setLoading(false);
                        return;
                    }

                    if (status === 500) {
                        setError(
                            `The search query "${term}" may be too broad or complex for the NDA API. Try using more specific search terms.`
                        );
                    } else if (status === 429) {
                        setError(
                            "Too many requests. Please wait a moment and try again."
                        );
                    } else if (status === 408 || status === 504) {
                        setError(
                            "Search request timed out. Try using more specific search terms."
                        );
                    } else {
                        setError(
                            `Search failed (${status}: ${statusText}). Try using different search terms or check your connection.`
                        );
                    }
                    setLoading(false);
                    return;
                }

                const searchResults = await partialResponse.json() as {
                    datadict?: { results?: NdaElementResult[] };
                };

                if (!searchResults?.datadict?.results?.length) {
                    if (databaseFilterEnabled && databaseElements.size > 0) {
                        setError(
                            `No data elements found containing "${term}" in your database. Try disabling the database filter to search all NDA elements.`
                        );
                        setLoading(false);
                        return;
                    } else if (
                        !databaseFilterEnabled &&
                        databaseElements.size > 0
                    ) {
                        const databaseMatches = searchDatabaseElements(
                            searchQuery,
                            false
                        );

                        if (databaseMatches.length > 0) {
                            setMatchingElements(databaseMatches);
                            setIsPartialSearch(true);
                            setTotalElementCount(databaseMatches.length);
                            updateRecentSearches(term.trim());

                            pushHistoryState("results", {
                                results: databaseMatches,
                                searchTerm: term.trim(),
                            });

                            setLoading(false);
                            return;
                        }
                    }

                    setError(`No data elements found containing "${term}"`);
                    setLoading(false);
                    return;
                }

                setTotalElementCount(searchResults.datadict.results.length);

                const elementDetails = await Promise.all(
                    searchResults.datadict.results.map(async (result): Promise<ElementSearchResult | null> => {
                        try {
                            if (
                                !result ||
                                !result.name ||
                                typeof result.name !== "string"
                            ) {
                                console.warn("Invalid result object:", result);
                                return null;
                            }

                            const response = await fetch(
                                `https://nda.nih.gov/api/datadictionary/dataelement/${result.name}`
                            );

                            if (!response.ok) {
                                console.warn(
                                    `Failed to fetch details for ${result.name}, status: ${response.status}`
                                );
                                return null;
                            }

                            const fullData = await response.json() as Partial<DataElement>;

                            return {
                                name: result.name,
                                type: fullData.type || result.type || "Text",
                                description:
                                    fullData.description ||
                                    "No description available",
                                notes: fullData.notes,
                                valueRange: fullData.valueRange,
                                dataStructures:
                                    result.dataStructures?.map((ds) => ({
                                        shortName: ds.shortName,
                                        title: ds.title || "",
                                        category: ds.category || "",
                                    })) || [],
                                total_data_structures:
                                    result.dataStructures?.length || 0,
                                _score: result._score,
                                searchTerms: [searchQuery],
                                matchType: result.name
                                    .toLowerCase()
                                    .includes(searchQuery.toLowerCase())
                                    ? "name"
                                    : "description",
                                inDatabase: isElementInDatabase(result.name),
                            };
                        } catch (err) {
                            console.error(
                                `Error fetching details for element:`,
                                err
                            );
                            return null;
                        }
                    })
                );

                let validElements = elementDetails.filter((el): el is ElementSearchResult => el !== null);

                if (!databaseFilterEnabled && databaseElements.size > 0) {
                    const databaseMatches = searchDatabaseElements(
                        searchQuery,
                        false
                    );

                    const existingElementsMap = new Map<string, ElementSearchResult>();
                    validElements.forEach((el) => {
                        existingElementsMap.set(el.name.toLowerCase(), el);
                    });

                    databaseMatches.forEach((dbMatch) => {
                        const key = dbMatch.name.toLowerCase();
                        if (!existingElementsMap.has(key)) {
                            existingElementsMap.set(key, dbMatch);
                            validElements.push(dbMatch);
                        } else {
                            const existing = existingElementsMap.get(key);
                            if (existing) {
                                existing.inDatabase = true;
                            }
                        }
                    });
                }

                if (databaseFilterEnabled && databaseElements.size > 0) {
                    validElements = validElements.filter(
                        (el) => el.inDatabase
                    );
                }

                validElements = validElements.sort((a, b) => {
                    const aExact =
                        a.name.toLowerCase() === searchQuery.toLowerCase();
                    const bExact =
                        b.name.toLowerCase() === searchQuery.toLowerCase();

                    if (aExact && !bExact) return -1;
                    if (!aExact && bExact) return 1;

                    const aBoosted = getBoostedScore(a);
                    const bBoosted = getBoostedScore(b);
                    return bBoosted - aBoosted;
                });

                setMatchingElements(validElements);
                setIsPartialSearch(true);
                updateRecentSearches(term.trim());

                pushHistoryState("results", {
                    results: validElements,
                    searchTerm: term.trim(),
                });
            } catch (err) {
                console.error("Search error:", err);

                if (err instanceof Error) {
                    if (err.name === "TypeError" && err.message.includes("fetch")) {
                        setError(
                            "Network connection error. Please check your internet connection and try again."
                        );
                    } else if (err.message.includes("JSON")) {
                        setError(
                            "Received invalid response from search API. Try a different search term or try again later."
                        );
                    } else if (err.message.includes("timeout")) {
                        setError(
                            "Search request timed out. Try using more specific search terms."
                        );
                    } else {
                        setError(`Search error: ${err.message}`);
                    }
                } else {
                    setError(`Search error: ${String(err)}`);
                }
            } finally {
                setLoading(false);
            }
        },
        [
            databaseFilterEnabled,
            databaseElements,
            searchDatabaseElements,
            updateRecentSearches,
            pushHistoryState,
            isElementInDatabase,
            searchDatabaseElementsWithTerm,
            dataStructuresMap,
            getStructuresContainingElement,
            tryDirectElementFetch,
            getBoostedScore,
            preferExactMatch,
        ]
    );

    // Clear search when tab becomes hidden (but preserve state for quick navigation)
    useEffect(() => {
        if (!isVisible) {
            // Only clear the display, but keep hasProcessedInitialSearch
        } else {
            if (previousInitialSearchTerm.current !== initialSearchTerm) {
                setHasProcessedInitialSearch(false);
                previousInitialSearchTerm.current = initialSearchTerm;
            }
        }
    }, [isVisible, initialSearchTerm]);

    // Handle initial search term from parent (only once when it changes)
    useEffect(() => {
        if (
            initialSearchTerm &&
            initialSearchTerm !== searchTerm &&
            !hasProcessedInitialSearch &&
            isVisible
        ) {
            setSearchTerm(initialSearchTerm);
            setHasProcessedInitialSearch(true);
            setPreferExactMatch(true);
            handleSearchWithTerm(initialSearchTerm);
        } else if (!initialSearchTerm && hasProcessedInitialSearch) {
            setHasProcessedInitialSearch(false);
            setPreferExactMatch(false);
        }
    }, [
        initialSearchTerm,
        searchTerm,
        handleSearchWithTerm,
        hasProcessedInitialSearch,
        isVisible,
    ]);

    // Auto-search when preferExactMatch changes (if there's a search term and results)
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        if (searchTerm.trim() && (element || matchingElements.length > 0 || isPartialSearch)) {
            handleSearch();
        }
    }, [preferExactMatch]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleSearch();
        }
    };

    const handleClear = () => {
        setSearchTerm("");
        setElement(null);
        setError(null);
        setMatchingElements([]);
        setIsPartialSearch(false);
        setTotalElementCount(0);
        setHasProcessedInitialSearch(false);
        if (onClearInitialSearchTerm) {
            onClearInitialSearchTerm();
        }
        pushHistoryState("search", {});
    };

    // Clear results when search term is cleared or becomes empty
    useEffect(() => {
        if (!searchTerm.trim() && !initialSearchTerm) {
            if (element || matchingElements.length > 0 || error) {
                setElement(null);
                setMatchingElements([]);
                setIsPartialSearch(false);
                setError(null);
                setTotalElementCount(0);
            }
        }
    }, [searchTerm, initialSearchTerm]);

    const handleRecentSearch = async (term: string) => {
        setSearchTerm(term);
        setMatchingElements([]);
        setIsPartialSearch(false);
        setElement(null);

        await handleSearchWithTerm(term);
    };

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">Data Elements</h1>
                <p className="text-gray-600 -mb-7">
                    Search the NDA Data Dictionary
                </p>

                {/* Database Filter Checkbox */}
                <div className="-mb-8">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={databaseFilterEnabled}
                            onChange={(e) => {
                                e.stopPropagation();
                                const newFilterState = e.target.checked;
                                setDatabaseFilterEnabled(newFilterState);

                                setMatchingElements([]);
                                setIsPartialSearch(false);
                                setElement(null);

                                if (searchTerm.trim()) {
                                    handleSearchWithFilter(newFilterState);
                                }
                            }}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 flex-shrink-0 self-center"
                        />
                        <div className="flex items-center space-x-2">
                            <div className="w-32 h-32 relative flex items-center justify-center self-center">
                                <Image
                                    src="/impact.png"
                                    alt="IMPACT Logo"
                                    width={128}
                                    height={128}
                                    className="object-contain"
                                />
                            </div>
                            {databaseConnectionError && (
                                <p className="text-sm text-red-600 ml-2">
                                    {databaseConnectionError}
                                </p>
                            )}
                            {loadingDatabaseElements && (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                            )}
                        </div>
                        {databaseFilterEnabled && databaseElements.size > 0 && (
                            <p className="text-xs text-gray-500 ml-2">
                                Filtering by {databaseElements.size} available
                                elements
                            </p>
                        )}
                    </label>
                </div>

                {/* Search Input */}
                <div className="relative mb-3">
                    <input
                        type="text"
                        className="w-full p-4 pl-12 pr-32 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Search element names and descriptions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <Search
                        className="absolute left-4 top-4 text-gray-400"
                        size={20}
                    />
                    {searchTerm && (
                        <button
                            onClick={handleClear}
                            className="absolute right-24 top-4 text-gray-400 hover:text-gray-600"
                            aria-label="Clear search"
                        >
                            <X size={16} />
                        </button>
                    )}
                    <button
                        onClick={handleSearch}
                        disabled={!searchTerm.trim() || loading}
                        className="absolute right-2 top-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-blue-300"
                    >
                        Search
                    </button>
                </div>

                {/* Search Mode Toggle */}
                <div className="mb-3 flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={preferExactMatch}
                            onChange={(e) => {
                                setPreferExactMatch(e.target.checked);
                            }}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-sm text-gray-700">
                            Prefer exact match (direct element lookup)
                        </span>
                    </label>
                    <span className="text-xs text-gray-500">
                        {preferExactMatch
                            ? "Searching for exact element names first"
                            : "Searching for phrase matches in names/descriptions"}
                    </span>
                </div>

                {recentSearches.length > 0 && (
                    <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm text-gray-500">
                                Recent searches:
                            </h3>
                            <button
                                onClick={() => {
                                    setRecentSearches([]);
                                    localStorage.removeItem(
                                        "elementSearchHistory"
                                    );
                                }}
                                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                            >
                                Clear all
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {recentSearches.map((term, index) => (
                                <div key={index} className="group relative">
                                    <button
                                        onClick={() => handleRecentSearch(term)}
                                        className="px-3 py-1 text-sm bg-gray-100 group-hover:bg-gray-200 rounded-full text-gray-700"
                                    >
                                        {term}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setRecentSearches(
                                                recentSearches.filter(
                                                    (_, i) => i !== index
                                                )
                                            );
                                        }}
                                        className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-200 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center text-xs text-gray-600"
                                        aria-label="Remove search term"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {loading && (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">
                        Searching for elements...
                    </p>
                </div>
            )}

            {error && (
                <div className="bg-red-50 p-4 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" />
                    <div>
                        <h4 className="font-medium text-red-800">Error</h4>
                        <p className="text-red-700">{error}</p>
                        {error.includes("not found in database") && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDatabaseFilterEnabled(false);
                                }}
                                className="mt-2 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                            >
                                Search All NDA Elements
                            </button>
                        )}
                    </div>
                </div>
            )}

            {isPartialSearch && matchingElements.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="bg-green-50 p-4 border-b border-green-100">
                        <h2 className="text-lg font-medium text-green-800">
                            Found {matchingElements.length} elements containing
                            &quot;{searchTerm}&quot;
                            {databaseFilterEnabled &&
                                totalElementCount > matchingElements.length &&
                                ` (${totalElementCount} total in NDA)`}
                        </h2>
                        <div className="flex items-center gap-4 mt-1">
                            <p className="text-sm text-green-700">
                                Results are sorted by relevance score
                            </p>
                            {databaseFilterEnabled &&
                                databaseElements.size > 0 && (
                                    <p className="text-sm text-blue-600">
                                        <Database className="w-3 h-3 inline mr-1" />
                                        {databaseName} filtered
                                    </p>
                                )}
                        </div>
                    </div>

                    <div className="divide-y">
                        {matchingElements.map((match, index) => (
                            <div
                                key={index}
                                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={async () => {
                                    setElement({ ...match, loading: true });
                                    setIsPartialSearch(false);

                                    if (
                                        databaseFilterEnabled &&
                                        match.inDatabase
                                    ) {
                                        const elementName =
                                            match.name?.toLowerCase();
                                        const structuresContainingElement: string[] = [];

                                        if (
                                            elementName &&
                                            Object.keys(dataStructuresMap)
                                                .length > 0
                                        ) {
                                            Object.values(
                                                dataStructuresMap
                                            ).forEach((dbStructure) => {
                                                if (
                                                    dbStructure.dataElements &&
                                                    Array.isArray(
                                                        dbStructure.dataElements
                                                    )
                                                ) {
                                                    const hasElement =
                                                        dbStructure.dataElements.some(
                                                            (el) =>
                                                                el.name?.toLowerCase() ===
                                                                elementName
                                                        );
                                                    if (
                                                        hasElement &&
                                                        dbStructure.shortName
                                                    ) {
                                                        structuresContainingElement.push(
                                                            dbStructure.shortName
                                                        );
                                                    }
                                                }
                                            });
                                        }

                                        const elementData: ElementSearchResult = {
                                            ...match,
                                            dataStructures:
                                                structuresContainingElement,
                                            loading: false,
                                        };
                                        setElement(elementData);
                                        pushHistoryState("element", {
                                            element: elementData,
                                        });
                                        return;
                                    }

                                    try {
                                        const response = await fetch(
                                            `https://nda.nih.gov/api/datadictionary/dataelement/${match.name}`
                                        );
                                        if (response.ok) {
                                            const fullData =
                                                await response.json() as ElementSearchResult;
                                            setElement(fullData);

                                            pushHistoryState("element", {
                                                element: fullData,
                                            });
                                        } else {
                                            throw new Error(
                                                "Failed to fetch element details"
                                            );
                                        }
                                    } catch (err) {
                                        console.error(
                                            "Error fetching element details:",
                                            err
                                        );
                                        setElement(match);

                                        pushHistoryState("element", {
                                            element: match,
                                        });
                                    }
                                }}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-mono text-blue-600 font-medium flex items-center gap-2">
                                            {match.matchType !== "exact" && (match.searchTerms || searchTerm) ? (
                                                highlightSearchTerm(
                                                    match.name,
                                                    match.searchTerms || [searchTerm]
                                                )
                                            ) : (
                                                match.name
                                            )}
                                            <span className="text-xs bg-blue-100 px-2 py-1 rounded text-blue-800">
                                                {match.type}
                                            </span>
                                            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                                                Score:{" "}
                                                {match._score?.toFixed(2)}
                                            </span>
                                            {match.matchType ===
                                                "description" && (
                                                <span className="text-xs bg-purple-100 px-2 py-1 rounded text-purple-800">
                                                    Found in description
                                                </span>
                                            )}
                                            {match.inDatabase && (
                                                <>
                                                    <div className="relative group">
                                                        <Database className="w-4 h-4 text-blue-500 cursor-help" />
                                                        <div className="absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                                            This element exists
                                                            in the IMPACT-MH
                                                            database
                                                        </div>
                                                    </div>
                                                    {(() => {
                                                        const allProjects =
                                                            new Set<string>();
                                                        const elementName =
                                                            match.name?.toLowerCase();

                                                        if (
                                                            elementName &&
                                                            Object.keys(
                                                                dataStructuresMap
                                                            ).length > 0
                                                        ) {
                                                            Object.values(
                                                                dataStructuresMap
                                                            ).forEach(
                                                                (
                                                                    dbStructure
                                                                ) => {
                                                                    if (
                                                                        dbStructure.dataElements &&
                                                                        Array.isArray(
                                                                            dbStructure.dataElements
                                                                        )
                                                                    ) {
                                                                        const hasElement =
                                                                            dbStructure.dataElements.some(
                                                                                (
                                                                                    el
                                                                                ) =>
                                                                                    el.name?.toLowerCase() ===
                                                                                    elementName
                                                                            );
                                                                        if (
                                                                            hasElement &&
                                                                            dbStructure.submittedByProjects
                                                                        ) {
                                                                            dbStructure.submittedByProjects.forEach(
                                                                                (
                                                                                    project
                                                                                ) => {
                                                                                    allProjects.add(
                                                                                        project
                                                                                    );
                                                                                }
                                                                            );
                                                                        }
                                                                    }
                                                                }
                                                            );
                                                        }

                                                        if (
                                                            match.dataStructures &&
                                                            match.dataStructures
                                                                .length > 0
                                                        ) {
                                                            match.dataStructures.forEach(
                                                                (structure) => {
                                                                    const sName = typeof structure === "string"
                                                                        ? structure
                                                                        : structure.shortName;
                                                                    const dbStructure =
                                                                        dataStructuresMap[sName] ||
                                                                        dataStructuresMap[sName?.toLowerCase()];
                                                                    if (
                                                                        dbStructure?.submittedByProjects
                                                                    ) {
                                                                        dbStructure.submittedByProjects.forEach(
                                                                            (
                                                                                project
                                                                            ) => {
                                                                                allProjects.add(
                                                                                    project
                                                                                );
                                                                            }
                                                                        );
                                                                    }
                                                                }
                                                            );
                                                        }

                                                        const projects =
                                                            Array.from(
                                                                allProjects
                                                            );
                                                        if (
                                                            projects.length > 0
                                                        ) {
                                                            return (
                                                                <div className="ml-2 flex flex-wrap gap-1">
                                                                    {projects.map(
                                                                        (
                                                                            project,
                                                                            idx
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    idx
                                                                                }
                                                                                className="text-xs px-2 py-0.5 bg-indigo-100 text-gray-700 rounded"
                                                                            >
                                                                                {
                                                                                    project
                                                                                }
                                                                            </span>
                                                                        )
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </>
                                            )}
                                        </h3>
                                    </div>
                                </div>

                                {match.description && (
                                    <p className="text-sm text-gray-700 mt-2">
                                        {highlightSearchTerm(
                                            match.description,
                                            match.searchTerms || [searchTerm]
                                        )}
                                    </p>
                                )}

                                {match.dataStructures?.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {match.dataStructures.map(
                                            (structure, idx) => {
                                                const sName = typeof structure === "string"
                                                    ? structure
                                                    : structure.shortName;
                                                const sTitle = typeof structure === "string"
                                                    ? undefined
                                                    : structure.title;
                                                return (
                                                    <span
                                                        key={idx}
                                                        className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 cursor-pointer hover:bg-gray-200 group relative"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onStructureSelect(sName);
                                                        }}
                                                    >
                                                        {sName}
                                                        {sTitle && (
                                                            <div className="absolute hidden group-hover:block bg-gray-800 text-white p-2 rounded shadow-lg text-xs -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap z-10">
                                                                {sTitle}
                                                            </div>
                                                        )}
                                                    </span>
                                                );
                                            }
                                        )}
                                    </div>
                                )}

                                {match.notes && (
                                    <div className="mt-2 text-xs text-gray-600">
                                        <span className="font-medium">
                                            Notes:{" "}
                                        </span>
                                        {highlightSearchTerm(
                                            match.notes,
                                            match.searchTerms || [searchTerm]
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Show message when no database results found */}
            {isPartialSearch &&
                matchingElements.length === 0 &&
                databaseFilterEnabled &&
                totalElementCount > 0 && (
                    <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
                        <div className="relative group">
                            <Database className="w-5 h-5 text-blue-500 mt-1 flex-shrink-0 cursor-help" />
                            <div className="absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                Database filter is enabled - showing only
                                IMPACT-MH elements
                            </div>
                        </div>
                        <div>
                            <h4 className="font-medium text-blue-800">
                                No Database Matches Found
                            </h4>
                            <p className="text-blue-700 mt-1">
                                Found {totalElementCount} elements in NDA
                                containing &quot;{searchTerm}&quot;, but none
                                are available in your database.
                            </p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDatabaseFilterEnabled(false);
                                    handleSearchWithFilter(false);
                                }}
                                className="mt-2 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                            >
                                Show All NDA Elements
                            </button>
                        </div>
                    </div>
                )}

            {element && !isPartialSearch && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="bg-blue-50 p-5 border-b border-blue-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-mono font-semibold text-blue-800">
                                    {element.name}
                                </h2>
                            </div>
                            {matchingElements.length > 0 && (
                                <button
                                    onClick={() => {
                                        setElement(null);
                                        setIsPartialSearch(true);
                                        pushHistoryState("results", {
                                            results: matchingElements,
                                            searchTerm: searchTerm,
                                        });
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 19l-7-7 7-7"
                                        />
                                    </svg>
                                    Back to Results
                                </button>
                            )}
                        </div>
                        <div className="flex items-center mt-2">
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                {element.type}
                                {element.size && <span> ({element.size})</span>}
                            </span>
                            <span className="text-sm text-gray-500 ml-3">
                                Found in {element.dataStructures?.length || 0}{" "}
                                data structures
                            </span>
                        </div>
                    </div>

                    <div className="p-5 space-y-6">
                        {/* Description */}
                        <div>
                            <h3 className="text-lg font-medium text-gray-800 mb-2">
                                Description
                            </h3>
                            <p className="text-gray-700">
                                {element.description ||
                                    "No description available"}
                            </p>
                        </div>

                        {/* Value Range */}
                        <div>
                            <h3 className="text-lg font-medium text-gray-800 mb-2">
                                Value Range
                            </h3>
                            {element.valueRange ? (
                                <div className="bg-gray-50 p-3 rounded font-mono text-sm">
                                    {element.valueRange}
                                </div>
                            ) : (
                                <p className="text-gray-500 italic">
                                    No value range specified
                                </p>
                            )}
                        </div>

                        {/* Notes */}
                        {element.notes && (
                            <div>
                                <h3 className="text-lg font-medium text-gray-800 mb-2">
                                    Notes
                                </h3>
                                <div className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-300">
                                    <p className="text-gray-800">
                                        {element.notes}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Data Structures section */}
                        <div>
                            <h3 className="text-lg font-medium text-gray-800 mb-2">
                                Used in Data Structures
                            </h3>
                            {element.loading ? (
                                <div className="bg-gray-50 p-3 rounded flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                                    <span className="text-gray-600">
                                        Loading data structures...
                                    </span>
                                </div>
                            ) : (
                                (() => {
                                    let structuresToShow =
                                        element.dataStructures || [];
                                    if (
                                        databaseFilterEnabled &&
                                        structuresToShow.length > 0
                                    ) {
                                        structuresToShow =
                                            structuresToShow.filter(
                                                (structure) => {
                                                    const structureName =
                                                        typeof structure ===
                                                        "string"
                                                            ? structure
                                                            : structure.shortName;
                                                    return (
                                                        dataStructuresMap[
                                                            structureName
                                                        ] ||
                                                        dataStructuresMap[
                                                            structureName?.toLowerCase()
                                                        ]
                                                    );
                                                }
                                            );
                                    }

                                    return structuresToShow.length > 0 ? (
                                        <div className="bg-gray-50 p-3 rounded max-h-64 overflow-y-auto">
                                            <ul className="space-y-1">
                                                {structuresToShow.map(
                                                    (structure, index) => {
                                                        const structureName =
                                                            typeof structure ===
                                                            "string"
                                                                ? structure
                                                                : structure.shortName;
                                                        return (
                                                            <li
                                                                key={index}
                                                                className="font-mono text-sm hover:bg-blue-50 p-1 rounded cursor-pointer text-blue-600 hover:text-blue-800 transition-colors"
                                                                onClick={() =>
                                                                    onElementDetailStructureSelect(
                                                                        structureName
                                                                    )
                                                                }
                                                            >
                                                                {structureName}
                                                            </li>
                                                        );
                                                    }
                                                )}
                                            </ul>
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 italic">
                                            {databaseFilterEnabled
                                                ? "Not found in any database structures"
                                                : "Not found in any data structures"}
                                        </p>
                                    );
                                })()
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!loading &&
                !error &&
                !element &&
                !isPartialSearch &&
                searchTerm && (
                    <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-500 mt-1 flex-shrink-0" />
                        <div>
                            <h4 className="font-medium text-blue-800">
                                Searching Tips
                            </h4>
                            <p className="text-blue-700 mt-1">
                                Enter a full or partial data element name and
                                press Enter or click Search.
                            </p>
                            <p className="text-sm text-blue-600 mt-2">
                                Common element names: subjectkey, gender, age,
                                visit_date, handedness
                            </p>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default DataElementSearch;

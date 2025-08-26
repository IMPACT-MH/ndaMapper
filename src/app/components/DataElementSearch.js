"use client";

import { useState, useEffect } from "react";
import { Search, X, AlertCircle, Info, Database } from "lucide-react";

const DataElementSearch = ({ onStructureSelect }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [element, setElement] = useState(null);
    const [matchingElements, setMatchingElements] = useState([]);
    const [isPartialSearch, setIsPartialSearch] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);

    // Database filter state
    const [databaseFilterEnabled, setDatabaseFilterEnabled] = useState(true);
    const [databaseElements, setDatabaseElements] = useState(new Map()); // Changed to Map to store full element objects
    const [loadingDatabaseElements, setLoadingDatabaseElements] =
        useState(false);
    const [totalElementCount, setTotalElementCount] = useState(0);

    useEffect(() => {
        const saved = localStorage.getItem("elementSearchHistory");
        if (saved) {
            setRecentSearches(JSON.parse(saved));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(
            "elementSearchHistory",
            JSON.stringify(recentSearches)
        );
    }, [recentSearches]);

    // Fetch database elements when filter is enabled
    useEffect(() => {
        if (databaseFilterEnabled && databaseElements.size === 0) {
            fetchDatabaseElements();
        }
    }, [databaseFilterEnabled, databaseElements.size]);

    const fetchDatabaseElements = async () => {
        setLoadingDatabaseElements(true);
        try {
            const response = await fetch(
                "https://spinup-002b0f.spinup.yale.edu/api/dataStructures/database"
            );
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

    const updateRecentSearches = (newTerm) => {
        if (!recentSearches.includes(newTerm)) {
            setRecentSearches((prev) => [newTerm, ...prev].slice(0, 10));
        }
    };

    const highlightSearchTerm = (text, searchTerms) => {
        if (!text || !searchTerms?.length) return text;

        try {
            const pattern = searchTerms
                .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("|");
            const regex = new RegExp(`(${pattern})`, "gi");

            const parts = text.split(regex);
            return parts.map((part, i) => {
                const isMatch = searchTerms.some(
                    (term) => part.toLowerCase() === term.toLowerCase()
                );
                return isMatch ? (
                    <span key={i} className="bg-yellow-200 font-medium">
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

    const isElementInDatabase = (elementName) => {
        return databaseElements.has(elementName.toLowerCase());
    };

    // Search within database elements for matching terms
    const searchDatabaseElements = (searchTerm) => {
        const searchLower = searchTerm.toLowerCase();
        const matches = [];

        for (const [elementName, elementData] of databaseElements) {
            // Check if search term appears in name or description
            const nameMatch = elementName.includes(searchLower);
            const descriptionMatch = elementData.description
                ?.toLowerCase()
                .includes(searchLower);
            const notesMatch = elementData.notes
                ?.toLowerCase()
                .includes(searchLower);

            if (nameMatch || descriptionMatch || notesMatch) {
                matches.push({
                    name: elementData.name,
                    type: elementData.type || "String",
                    description:
                        elementData.description || "No description available",
                    notes: elementData.notes,
                    valueRange: elementData.valueRange,
                    _score: nameMatch ? 100 : descriptionMatch ? 50 : 25, // Prioritize name matches
                    searchTerms: [searchTerm],
                    matchType: nameMatch
                        ? "name"
                        : descriptionMatch
                        ? "description"
                        : "notes",
                    inDatabase: true,
                    dataStructures: [], // We could enhance this later to include which structures contain this element
                });
            }
        }

        return matches.sort((a, b) => b._score - a._score);
    };

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError(null);
        setElement(null);
        setMatchingElements([]);
        setIsPartialSearch(false);

        try {
            // If database filter is enabled, first try searching within database elements
            if (databaseFilterEnabled && databaseElements.size > 0) {
                const databaseMatches = searchDatabaseElements(
                    searchTerm.trim()
                );

                if (databaseMatches.length > 0) {
                    // Found matches in database, show those
                    setMatchingElements(databaseMatches);
                    setIsPartialSearch(true);
                    setTotalElementCount(databaseMatches.length); // In this case, we only searched database
                    updateRecentSearches(searchTerm.trim());
                    setLoading(false);
                    return;
                }
            }

            // Use the NDA search API for partial matches
            const searchQuery = searchTerm.trim();

            // Add validation for very broad searches that might overwhelm the API
            if (searchQuery.length < 2) {
                setError("Search term must be at least 2 characters long");
                setLoading(false);
                return;
            }

            const partialResponse = await fetch(
                `https://nda.nih.gov/api/search/nda/dataelement/full?size=1000&highlight=true`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "text/plain",
                    },
                    body: searchQuery,
                }
            );

            if (!partialResponse.ok) {
                const statusText =
                    partialResponse.statusText || "Unknown error";
                const status = partialResponse.status;

                // Handle different types of API errors
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

            const searchResults = await partialResponse.json();

            if (!searchResults?.datadict?.results?.length) {
                if (databaseFilterEnabled && databaseElements.size > 0) {
                    setError(
                        `No data elements found containing "${searchTerm}" in your database. Try disabling the database filter to search all NDA elements.`
                    );
                } else {
                    setError(
                        `No data elements found containing "${searchTerm}"`
                    );
                }
                setLoading(false);
                return;
            }

            // Store total count before filtering
            setTotalElementCount(searchResults.datadict.results.length);

            // Get full details for each result
            const elementDetails = await Promise.all(
                searchResults.datadict.results.map(async (result) => {
                    try {
                        const response = await fetch(
                            `https://nda.nih.gov/api/datadictionary/dataelement/${result.name}`
                        );

                        if (!response.ok) {
                            throw new Error(
                                `Failed to fetch details for ${result.name}`
                            );
                        }

                        const fullData = await response.json();

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

            // Filter out null results
            let validElements = elementDetails.filter(Boolean);

            // Apply database filter if enabled
            if (databaseFilterEnabled && databaseElements.size > 0) {
                validElements = validElements.filter(
                    (element) => element.inDatabase
                );
            }

            // Sort by API's _score
            validElements = validElements.sort(
                (a, b) => (b._score || 0) - (a._score || 0)
            );

            setMatchingElements(validElements);
            setIsPartialSearch(true);
            updateRecentSearches(searchTerm.trim());
        } catch (err) {
            console.error("Search error:", err);

            // Handle different types of errors
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
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
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
    };

    const handleRecentSearch = async (term) => {
        setSearchTerm(term);
        await handleSearch();
    };

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">Data Element Search</h1>
                <p className="text-gray-600 mb-6">
                    Search for specific data elements to view their details,
                    value ranges, and associated data structures.
                </p>

                {/* Database Filter Checkbox */}
                <div className="mb-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={databaseFilterEnabled}
                            onChange={(e) => {
                                e.stopPropagation();
                                setDatabaseFilterEnabled(e.target.checked);
                                // Clear results when toggling filter to avoid confusion
                                if (isPartialSearch) {
                                    setMatchingElements([]);
                                    setIsPartialSearch(false);
                                }
                                if (element) {
                                    setElement(null);
                                }
                            }}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <div className="flex items-center space-x-2">
                            <Database className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-gray-700">
                                Show only elements available in database
                            </span>
                            {loadingDatabaseElements && (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                            )}
                        </div>
                    </label>
                    {databaseFilterEnabled && databaseElements.size > 0 && (
                        <p className="text-xs text-gray-500 mt-1 ml-7">
                            Filtering by {databaseElements.size} available
                            elements
                        </p>
                    )}
                </div>

                <div className="relative">
                    <input
                        type="text"
                        className="w-full p-4 pl-12 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="absolute right-16 top-4 text-gray-400 hover:text-gray-600"
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
                            "{searchTerm}"
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
                                        Database filtered
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
                                    try {
                                        const response = await fetch(
                                            `https://nda.nih.gov/api/datadictionary/dataelement/${match.name}`
                                        );
                                        if (response.ok) {
                                            const fullData =
                                                await response.json();
                                            setElement(fullData);
                                            setIsPartialSearch(false);
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
                                        setIsPartialSearch(false);
                                    }
                                }}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-mono text-blue-600 font-medium flex items-center gap-2">
                                            {match.name}
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
                                                <Database
                                                    className="w-4 h-4 text-blue-500"
                                                    title="Available in database"
                                                />
                                            )}
                                        </h3>
                                    </div>
                                </div>

                                {match.description && (
                                    <p className="text-sm text-gray-700 mt-2">
                                        {highlightSearchTerm(
                                            match.description,
                                            match.searchTerms
                                        )}
                                    </p>
                                )}

                                {match.dataStructures?.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {match.dataStructures.map(
                                            (structure, idx) => (
                                                <span
                                                    key={idx}
                                                    className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 cursor-pointer hover:bg-gray-200 group relative"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onStructureSelect(
                                                            structure.shortName
                                                        );
                                                    }}
                                                >
                                                    {structure.shortName}
                                                    {structure.title && (
                                                        <div className="absolute hidden group-hover:block bg-gray-800 text-white p-2 rounded shadow-lg text-xs -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap z-10">
                                                            {structure.title}
                                                        </div>
                                                    )}
                                                </span>
                                            )
                                        )}
                                    </div>
                                )}

                                {match.notes && (
                                    <div className="mt-2 text-xs text-gray-600">
                                        <span className="font-medium">
                                            Notes:{" "}
                                        </span>
                                        {match.notes}
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
                        <Database className="w-5 h-5 text-blue-500 mt-1 flex-shrink-0" />
                        <div>
                            <h4 className="font-medium text-blue-800">
                                No Database Matches Found
                            </h4>
                            <p className="text-blue-700 mt-1">
                                Found {totalElementCount} elements in NDA
                                containing "{searchTerm}", but none are
                                available in your database.
                            </p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDatabaseFilterEnabled(false);
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
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-mono font-semibold text-blue-800">
                                {element.name}
                            </h2>
                            {databaseFilterEnabled &&
                                isElementInDatabase(element.name) && (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                        <Database className="w-3 h-3" />
                                        <span>Available in Database</span>
                                    </div>
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
                            {element.dataStructures?.length > 0 ? (
                                <div className="bg-gray-50 p-3 rounded max-h-64 overflow-y-auto">
                                    <ul className="space-y-1">
                                        {element.dataStructures.map(
                                            (structure, index) => (
                                                <li
                                                    key={index}
                                                    className="font-mono text-sm hover:bg-blue-50 p-1 rounded cursor-pointer text-blue-600 hover:text-blue-800 transition-colors"
                                                    onClick={() =>
                                                        onStructureSelect(
                                                            structure
                                                        )
                                                    }
                                                >
                                                    {structure}
                                                </li>
                                            )
                                        )}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-gray-500 italic">
                                    Not found in any data structures
                                </p>
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

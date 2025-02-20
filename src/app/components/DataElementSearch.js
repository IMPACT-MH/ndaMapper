"use client";

import { useState, useEffect } from "react";
import { Search, X, AlertCircle, Info } from "lucide-react";

const DataElementSearch = ({ onStructureSelect }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [element, setElement] = useState(null);
    const [matchingElements, setMatchingElements] = useState([]);
    const [isPartialSearch, setIsPartialSearch] = useState(false);

    const [recentSearches, setRecentSearches] = useState([]);

    // Add state for results cache
    // Initialize cache from localStorage
    const [searchCache, setSearchCache] = useState(() => {
        try {
            const saved = localStorage.getItem("elementSearchCache");
            return saved ? JSON.parse(saved) : {};
        } catch (err) {
            return {};
        }
    });
    // Load from localStorage after mount
    useEffect(() => {
        const saved = localStorage.getItem("elementSearchHistory");
        if (saved) {
            setRecentSearches(JSON.parse(saved));
        }
    }, []);

    // Save cache whenever it updates
    useEffect(() => {
        localStorage.setItem("elementSearchCache", JSON.stringify(searchCache));
    }, [searchCache]);

    // Update localStorage whenever recentSearches changes
    useEffect(() => {
        localStorage.setItem(
            "elementSearchHistory",
            JSON.stringify(recentSearches)
        );
    }, [recentSearches]);

    // Modify the function to update searches
    const updateRecentSearches = (newTerm) => {
        if (!recentSearches.includes(newTerm)) {
            setRecentSearches((prev) => [newTerm, ...prev].slice(0, 10));
        }
    };

    // Helper function to highlight search term in text
    const highlightSearchTerm = (text, term) => {
        if (!text || !term) return text;

        try {
            const parts = text.split(new RegExp(`(${term})`, "i"));

            return parts.map((part, i) =>
                part.toLowerCase() === term.toLowerCase() ? (
                    <span key={i} className="bg-yellow-200 font-medium">
                        {part}
                    </span>
                ) : (
                    part
                )
            );
        } catch (err) {
            // Fallback in case regex fails
            console.error("Error highlighting text:", err);
            return text;
        }
    };

    // Optimized search function with timeouts and focused structure search
    // Inside DataElementSearch.js, update the loading state:
    const [loadingState, setLoadingState] = useState({
        isLoading: false,
        currentBatch: 0,
        totalBatches: 0,
        matchesFound: 0,
    });

    // Update the findElementsByPattern function to report progress
    // Function to check if text contains word with strict boundaries
    const containsWord = (text, word) => {
        const regex = new RegExp(`\\b${word}\\b`, "i");
        return regex.test(text);
    };

    const findElementsByPattern = async (term) => {
        const searchTerm = term.toLowerCase();
        const foundElements = new Map();
        const structureCache = new Map();

        setLoadingState((prev) => ({
            ...prev,
            isLoading: true,
            currentBatch: 0,
            totalBatches: 0,
            matchesFound: 0,
        }));

        try {
            // Initial parallel searches
            const searchPromises = [
                fetch(
                    `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${searchTerm}`
                ),
                fetch(
                    `https://nda.nih.gov/api/datadictionary/datastructure?category=cognitive_task`
                ),
            ];

            const responses = await Promise.all(searchPromises);
            const structureArrays = await Promise.all(
                responses.filter((res) => res.ok).map((res) => res.json())
            );

            // Deduplicate structures
            const uniqueStructures = [
                ...new Set(
                    structureArrays
                        .flat()
                        .filter(Boolean)
                        .map((s) => s.shortName)
                ),
            ];

            // Process in parallel batches
            const batchSize = 25;
            const batches = [];

            for (let i = 0; i < uniqueStructures.length; i += batchSize) {
                batches.push(uniqueStructures.slice(i, i + batchSize));
            }

            setLoadingState((prev) => ({
                ...prev,
                totalBatches: batches.length,
            }));

            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                const batch = batches[batchIndex];

                setLoadingState((prev) => ({
                    ...prev,
                    currentBatch: batchIndex + 1,
                    matchesFound: foundElements.size,
                }));

                const batchPromises = batch.map(async (shortName) => {
                    if (structureCache.has(shortName)) {
                        return {
                            shortName,
                            elements: structureCache.get(shortName),
                        };
                    }

                    try {
                        const response = await fetch(
                            `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`
                        );
                        if (!response.ok) return null;

                        const data = await response.json();
                        if (data.dataElements?.length < 1000) {
                            structureCache.set(shortName, data.dataElements);
                        }
                        return { shortName, elements: data.dataElements || [] };
                    } catch (err) {
                        return null;
                    }
                });

                const batchResults = (await Promise.all(batchPromises)).filter(
                    Boolean
                );

                batchResults.forEach(({ shortName, elements }) => {
                    elements.forEach((element) => {
                        const elementName = (element.name || "").toLowerCase();
                        const elementDesc = (
                            element.description || ""
                        ).toLowerCase();

                        // Prepare search words for both singular and plural
                        const searchWords = [searchTerm];
                        if (searchTerm.endsWith("s")) {
                            searchWords.push(searchTerm.slice(0, -1)); // Add singular form
                        } else {
                            searchWords.push(searchTerm + "s"); // Add plural form
                        }

                        // Only consider it a match if the word appears as a whole word
                        const nameMatch = searchWords.some((word) =>
                            containsWord(elementName, word)
                        );
                        const descMatch = searchWords.some((word) =>
                            containsWord(elementDesc, word)
                        );

                        if (nameMatch || descMatch) {
                            // If there's a match, log it for debugging
                            console.log(`Match found in ${shortName}:`, {
                                name: element.name,
                                description: element.description,
                                matchType: nameMatch ? "name" : "description",
                            });

                            foundElements.set(element.name, {
                                name: element.name,
                                type: element.type || "Unknown",
                                description:
                                    element.description ||
                                    "No description available",
                                structure: shortName,
                                matchType:
                                    nameMatch && descMatch
                                        ? "both"
                                        : nameMatch
                                        ? "name"
                                        : "description",
                                relevance: calculateRelevance(
                                    element,
                                    searchTerm,
                                    nameMatch && descMatch
                                        ? "both"
                                        : nameMatch
                                        ? "name"
                                        : "description"
                                ),
                            });
                        }
                    });
                });

                // Small delay between batches
                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 20));
                }
            }

            setLoadingState((prev) => ({ ...prev, isLoading: false }));

            return Array.from(foundElements.values()).sort(
                (a, b) => b.relevance - a.relevance
            );
        } catch (err) {
            console.error("Error in findElementsByPattern:", err);
            setLoadingState((prev) => ({ ...prev, isLoading: false }));
            return Array.from(foundElements.values());
        }
    };

    // Helper function to calculate result relevance
    const calculateRelevance = (element, searchTerm, matchType) => {
        let score = 0;

        // Base scores by match type
        if (matchType === "both") score += 100;
        else if (matchType === "name") score += 75;
        else if (matchType === "description") score += 25;

        // Bonus for exact matches
        if (element.name.toLowerCase() === searchTerm) score += 50;

        // Bonus for starts with
        if (element.name.toLowerCase().startsWith(searchTerm)) score += 25;

        // Smaller penalty for length difference
        const lengthDiff = Math.abs(element.name.length - searchTerm.length);
        score -= Math.min(lengthDiff, 10); // Cap the penalty

        return score;
    };

    const handlePartialSearch = async () => {
        if (!searchTerm.trim()) return;

        // Check cache first
        if (searchCache[searchTerm.trim()]) {
            setMatchingElements(searchCache[searchTerm.trim()]);
            setElement(null);
            setError(null);
            setIsPartialSearch(true);
            updateRecentSearches(searchTerm.trim());
            return;
        }

        setLoading(true);
        setError(null);
        setIsPartialSearch(true);
        setMatchingElements([]);
        setElement(null);

        try {
            // First try direct match for efficiency
            const directResponse = await fetch(
                `https://nda.nih.gov/api/datadictionary/dataelement/${searchTerm.trim()}`
            );

            if (directResponse.ok) {
                const data = await directResponse.json();
                setElement(data);
                setIsPartialSearch(false);
                updateRecentSearches(searchTerm.trim());
                setLoading(false);
                return;
            }

            // If no direct match, try pattern-based search
            const matchingElements = await findElementsByPattern(
                searchTerm.trim()
            );

            if (matchingElements.length === 0) {
                setError(`No data elements found containing "${searchTerm}"`);
                setLoading(false);
                return;
            }

            setMatchingElements(matchingElements);
            // Cache the results
            setSearchCache((prev) => ({
                ...prev,
                [searchTerm.trim()]: matchingElements,
            }));
            updateRecentSearches(searchTerm.trim());

            // Auto-select if only one result
            if (matchingElements.length === 1) {
                try {
                    const perfectMatch = await fetch(
                        `https://nda.nih.gov/api/datadictionary/dataelement/${matchingElements[0].name}`
                    );

                    if (perfectMatch.ok) {
                        const data = await perfectMatch.json();
                        setElement(data);
                        setIsPartialSearch(false);
                        updateRecentSearches(matchingElements[0].name);
                    }
                } catch (err) {
                    console.error("Error fetching single result:", err);
                }
            }
        } catch (err) {
            console.error("Search error:", err);
            setError(`Error searching for elements: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        await handlePartialSearch();
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
    };

    // Update handleRecentSearch to directly use cached results
    const handleRecentSearch = async (term) => {
        setSearchTerm(term);

        // If we have cached results, use them immediately
        if (searchCache[term]) {
            setMatchingElements(searchCache[term]);
            setIsPartialSearch(true);
            setElement(null);
            setError(null);
        }

        // Always trigger a new search to ensure fresh results
        await handlePartialSearch();
    };

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">Data Element Search</h1>
                <p className="text-gray-600 mb-6">
                    Search for specific data elements to view their details,
                    value ranges, and associated data structures.
                </p>
                <div className="relative">
                    <input
                        type="text"
                        className="w-full p-4 pl-12 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter full or partial element name or description..."
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
                    <div className="text-xs text-gray-500 mt-2 ml-1">
                        Search in both element names and descriptions - try
                        terms like "taps", "reaction time", "age", etc.
                    </div>
                </div>

                {/* Recent searches */}
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
                                            const newSearches =
                                                recentSearches.filter(
                                                    (_, i) => i !== index
                                                );
                                            setRecentSearches(newSearches);
                                            localStorage.setItem(
                                                "elementSearchHistory",
                                                JSON.stringify(newSearches)
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

            {loadingState.isLoading && (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">
                        Searching for elements...
                        {loadingState.totalBatches > 0 && (
                            <span className="block text-sm text-gray-500">
                                Processing batch {loadingState.currentBatch} of{" "}
                                {loadingState.totalBatches}
                                {loadingState.matchesFound > 0 && (
                                    <span>
                                        {" "}
                                        • Found {loadingState.matchesFound}{" "}
                                        matches so far
                                    </span>
                                )}
                            </span>
                        )}
                    </p>
                </div>
            )}

            {error && (
                <div className="bg-red-50 p-4 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" />
                    <div>
                        <h4 className="font-medium text-red-800">Error</h4>
                        <p className="text-red-700">{error}</p>
                        <div className="mt-3 text-sm bg-red-100 p-3 rounded">
                            <p className="font-medium">Suggestions:</p>
                            <ul className="list-disc ml-5 mt-1 space-y-1">
                                <li>Check spelling and try again</li>
                                <li>Element names are case-sensitive</li>
                                <li>
                                    Try removing any spaces or special
                                    characters
                                </li>
                                <li>
                                    Some common elements: subjectkey, gender,
                                    interview_age, interview_date
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Matching elements section (for partial search) */}
            {isPartialSearch && matchingElements.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="bg-green-50 p-4 border-b border-green-100">
                        <h2 className="text-lg font-medium text-green-800">
                            Found {matchingElements.length} elements containing
                            "{searchTerm}"
                        </h2>
                        <p className="text-sm text-green-700 mt-1">
                            Click on an element name to view its details
                        </p>
                    </div>

                    <div className="divide-y">
                        {matchingElements.map((match, index) => (
                            <div
                                key={index}
                                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={async () => {
                                    setSearchTerm(match.name);
                                    setIsPartialSearch(false); // Reset partial search state
                                    setMatchingElements([]); // Clear matching elements

                                    // Fetch and display the full element details
                                    try {
                                        const response = await fetch(
                                            `https://nda.nih.gov/api/datadictionary/dataelement/${match.name}`
                                        );
                                        if (response.ok) {
                                            const data = await response.json();
                                            setElement(data);

                                            // Update recent searches
                                            if (
                                                !recentSearches.includes(
                                                    match.name
                                                )
                                            ) {
                                                const newSearches = [
                                                    match.name,
                                                    ...recentSearches,
                                                ].slice(0, 10);
                                                setRecentSearches(newSearches);
                                                localStorage.setItem(
                                                    "elementSearchHistory",
                                                    JSON.stringify(newSearches)
                                                );
                                            }
                                        }
                                    } catch (err) {
                                        console.error(
                                            "Error fetching element details:",
                                            err
                                        );
                                    }
                                }}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-mono text-blue-600 font-medium">
                                            {match.name}
                                            <span className="ml-2 text-xs bg-blue-100 px-2 py-1 rounded text-blue-800">
                                                {match.type}
                                            </span>
                                            {match.matchType ===
                                                "description" && (
                                                <span className="ml-2 text-xs bg-purple-100 px-2 py-1 rounded text-purple-800">
                                                    Found in description
                                                </span>
                                            )}
                                            {match.matchType === "both" && (
                                                <span className="ml-2 text-xs bg-green-100 px-2 py-1 rounded text-green-800">
                                                    Matches name & description
                                                </span>
                                            )}
                                        </h3>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {match.structure}
                                    </span>
                                </div>

                                {/* Show description with highlighted search term */}
                                <p className="text-sm text-gray-700 mt-2">
                                    {match.matchType === "description" &&
                                    match.description
                                        ? highlightSearchTerm(
                                              match.description,
                                              searchTerm
                                          )
                                        : match.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {element && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="bg-blue-50 p-5 border-b border-blue-100">
                        <h2 className="text-2xl font-mono font-semibold text-blue-800">
                            {element.name}
                        </h2>
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
                            {element.dataStructures &&
                            element.dataStructures.length > 0 ? (
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

"use client";

import { useState } from "react";
import { Search, X, AlertCircle, Info } from "lucide-react";

const DataElementSearch = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [element, setElement] = useState(null);
    const [recentSearches, setRecentSearches] = useState([]);
    const [matchingElements, setMatchingElements] = useState([]);
    const [isPartialSearch, setIsPartialSearch] = useState(false);

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

    // 1. First get ALL cognitive task structures - these are most likely to contain test elements like "taps"
    const fetchCognitiveStructures = async () => {
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/datastructure?category=cognitive_task`
            );

            if (!response.ok) return [];
            return await response.json();
        } catch (err) {
            console.error("Error fetching cognitive structures:", err);
            return [];
        }
    };

    // 2. Get all elements for a specific structure
    const getElementsForStructure = async (shortName) => {
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`
            );

            if (!response.ok) return null;
            const data = await response.json();
            return data.dataElements || [];
        } catch (err) {
            console.error(`Error fetching elements for ${shortName}:`, err);
            return null;
        }
    };

    // Optimized search function with timeouts and focused structure search
    const findElementsByPattern = async (term) => {
        // Specific known prefixes likely to contain common elements like "taps"
        const criticalPrefixes = [
            "eefrt",
            "flanker",
            "dccs",
            "nback",
            "stroop",
        ];
        const searchTerm = term.toLowerCase();
        const foundElements = new Map();

        // Set a total search timeout
        const searchTimeout = setTimeout(() => {
            console.log("Search timeout reached - returning current results");
            return Array.from(foundElements.values());
        }, 15000); // 15 second timeout

        try {
            console.log("Starting search for:", searchTerm);

            // FIRST: If searching for "taps", prioritize eefrt structures
            if (searchTerm === "taps") {
                console.log(
                    "Taps search detected - prioritizing eefrt structures"
                );
                try {
                    const eefrtResponse = await fetch(
                        `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=eefrt`
                    );

                    if (eefrtResponse.ok) {
                        const eefrtStructures = await eefrtResponse.json();
                        console.log(
                            `Found ${eefrtStructures.length} eefrt structures`
                        );

                        // Process these structures immediately
                        for (const structure of eefrtStructures) {
                            const elements = await getElementsForStructure(
                                structure.shortName
                            );
                            if (!elements) continue;

                            console.log(
                                `Checking ${elements.length} elements in ${structure.shortName}`
                            );

                            elements.forEach((element) => {
                                const elementName = (
                                    element.name || ""
                                ).toLowerCase();
                                if (elementName.includes("taps")) {
                                    console.log(
                                        `Found taps element: ${element.name}`
                                    );
                                    foundElements.set(element.name, {
                                        name: element.name,
                                        type: element.type || "Unknown",
                                        description:
                                            element.description ||
                                            "No description available",
                                        structure: structure.shortName,
                                        matchType: "name",
                                    });
                                }
                            });
                        }

                        // Return early if we found matches
                        if (foundElements.size > 0) {
                            console.log(
                                `Found ${foundElements.size} matches in eefrt structures`
                            );
                            clearTimeout(searchTimeout);
                            return Array.from(foundElements.values());
                        }
                    }
                } catch (err) {
                    console.error("Error in eefrt priority search:", err);
                }
            }

            // SECOND: Get focused set of structures based on term
            const relevantPrefixes = criticalPrefixes.filter(
                (prefix) =>
                    searchTerm.includes(prefix) ||
                    prefix.includes(searchTerm.replace(/[_\-\s]/g, ""))
            );

            // Always include cognitive_task category
            const structurePromises = [
                fetch(
                    `https://nda.nih.gov/api/datadictionary/datastructure?category=cognitive_task`
                )
                    .then((res) => (res.ok ? res.json() : []))
                    .catch(() => []),
            ];

            // Add relevant prefix searches
            const prefixesToSearch =
                relevantPrefixes.length > 0
                    ? relevantPrefixes
                    : criticalPrefixes;

            prefixesToSearch.forEach((prefix) => {
                structurePromises.push(
                    fetch(
                        `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${prefix}`
                    )
                        .then((res) => (res.ok ? res.json() : []))
                        .catch(() => [])
                );
            });

            const structureResults = await Promise.all(structurePromises);
            const allStructures = structureResults.flat();

            // Deduplicate and limit to manageable number
            const uniqueStructures = Array.from(
                new Map(
                    allStructures.map((item) =>
                        item ? [item.shortName, item] : ["", null]
                    )
                ).values()
            ).filter(Boolean);

            console.log(`Processing ${uniqueStructures.length} structures`);

            // Limit to most relevant structures
            const maxStructures = 20;
            const limitedStructures = uniqueStructures.slice(0, maxStructures);

            // Process structures with smaller batch size for faster feedback
            const batchSize = 3;
            for (let i = 0; i < limitedStructures.length; i += batchSize) {
                // Check if we've been searching too long
                if (i > 0 && foundElements.size > 0) {
                    console.log(
                        `Found ${foundElements.size} matches, stopping further search`
                    );
                    break;
                }

                const batch = limitedStructures.slice(i, i + batchSize);
                console.log(
                    `Processing batch ${i / batchSize + 1}: ${batch
                        .map((s) => s.shortName)
                        .join(", ")}`
                );

                const batchPromises = batch.map((structure) =>
                    getElementsForStructure(structure.shortName)
                );

                try {
                    const batchResults = await Promise.all(batchPromises);

                    batchResults.forEach((elements, idx) => {
                        if (!elements || !batch[idx]) return;

                        console.log(
                            `Checking ${elements.length} elements in ${batch[idx].shortName}`
                        );

                        elements.forEach((element) => {
                            const elementName = (
                                element.name || ""
                            ).toLowerCase();
                            const elementDesc = (
                                element.description || ""
                            ).toLowerCase();

                            const normalizedName = elementName.replace(
                                /[_\-\s]/g,
                                ""
                            );
                            const normalizedSearch = searchTerm.replace(
                                /[_\-\s]/g,
                                ""
                            );

                            if (
                                normalizedName.includes(normalizedSearch) ||
                                elementDesc.includes(searchTerm)
                            ) {
                                const matchesName =
                                    normalizedName.includes(normalizedSearch);
                                const matchesDesc =
                                    elementDesc.includes(searchTerm);
                                let matchType = "unknown";

                                if (matchesName && matchesDesc)
                                    matchType = "both";
                                else if (matchesName) matchType = "name";
                                else if (matchesDesc) matchType = "description";

                                console.log(
                                    `Found match in ${matchType}: ${element.name}`
                                );

                                foundElements.set(element.name, {
                                    name: element.name,
                                    type: element.type || "Unknown",
                                    description:
                                        element.description ||
                                        "No description available",
                                    structure: batch[idx].shortName,
                                    matchType,
                                });
                            }
                        });
                    });
                } catch (err) {
                    console.error("Error processing batch:", err);
                }

                // Shorter delay between batches
                if (i + batchSize < limitedStructures.length) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
            }

            // Clear the timeout as we've finished normally
            clearTimeout(searchTimeout);

            // Return sorted results
            return Array.from(foundElements.values()).sort((a, b) => {
                // First by match type (name > both > description)
                const matchPriority = {
                    name: 0,
                    both: 1,
                    description: 2,
                    unknown: 3,
                };
                if (matchPriority[a.matchType] !== matchPriority[b.matchType]) {
                    return (
                        matchPriority[a.matchType] - matchPriority[b.matchType]
                    );
                }

                // Then for name matches, prefer starts-with
                if (a.matchType === "name" && b.matchType === "name") {
                    const startsWithA = a.name
                        .toLowerCase()
                        .startsWith(searchTerm);
                    const startsWithB = b.name
                        .toLowerCase()
                        .startsWith(searchTerm);
                    if (startsWithA && !startsWithB) return -1;
                    if (!startsWithA && startsWithB) return 1;
                }

                // Then by length (shorter is better)
                return a.name.length - b.name.length;
            });
        } catch (err) {
            console.error("Error in findElementsByPattern:", err);
            clearTimeout(searchTimeout);
            return Array.from(foundElements.values());
        }
    };

    const handlePartialSearch = async () => {
        if (!searchTerm.trim()) return;

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

                // Update recent searches
                if (!recentSearches.includes(searchTerm.trim())) {
                    setRecentSearches((prev) =>
                        [searchTerm.trim(), ...prev].slice(0, 10)
                    );
                }

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

                        // Update recent searches with the actual element name
                        if (
                            !recentSearches.includes(matchingElements[0].name)
                        ) {
                            setRecentSearches((prev) =>
                                [matchingElements[0].name, ...prev].slice(0, 10)
                            );
                        }
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

    const handleRecentSearch = (term) => {
        setSearchTerm(term);
        // Immediately search with this term
        setTimeout(() => handleSearch(), 0);
    };

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">Data Element Search</h1>
                <p className="text-gray-600 mb-6">
                    Search for specific data elements to view their details,
                    value ranges, and containing structures.
                </p>
                <div className="relative">
                    <input
                        type="text"
                        className="w-full p-4 pl-12 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter full or partial element name or description (e.g., taps, reaction time...)"
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
                        <h3 className="text-sm text-gray-500 mb-2">
                            Recent searches:
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {recentSearches.map((term, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleRecentSearch(term)}
                                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                                >
                                    {term}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {loading && (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">
                        Searching for element...
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
                                onClick={() => {
                                    setSearchTerm(match.name);
                                    setTimeout(() => handleSearch(), 0);
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

                        {/* Data Structures */}
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
                                                    className="font-mono text-sm hover:bg-gray-100 p-1 rounded"
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

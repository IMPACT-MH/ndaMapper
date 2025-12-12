"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
    Search,
    X,
    CheckCircle,
    ChevronLeft,
    FileText,
    Table,
    Database,
} from "lucide-react";
import CSVValidator from "./CSVValidator";
import DownloadStructureButton from "./DownloadStructureButton";
import DownloadTemplateButton from "./DownloadTemplateButton";
import useScrollDirection from "./useScrollDirection";

const DataStructureSearch = ({
    searchTerm,
    setSearchTerm,
    structures,
    totalStructureCount,
    loading,
    error,
    selectedStructure,
    handleStructureSelect,
    dataElements,
    loadingElements,
    handleStructureSearch,
    initialCsvFile,
    onFileChange,
    onClear,
    validatorState,
    // Database filter props
    databaseFilterEnabled,
    setDatabaseFilterEnabled,
    databaseStructures,
    databaseName,
    loadingDatabaseStructures,
    databaseElements,
    databaseConnectionError,
    onSwitchToElementSearch,
}) => {
    const [headers, setHeaders] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [structureTags, setStructureTags] = useState({});
    const [structureDataTypeTags, setStructureDataTypeTags] = useState({});
    const [isCurrentFilterCustomTag, setIsCurrentFilterCustomTag] =
        useState(false);
    const [removedCategories, setRemovedCategories] = useState({});
    const [availableCategories, setAvailableCategories] = useState(new Set());
    const [dataStructuresMap, setDataStructuresMap] = useState({});
    const apiBaseUrl = "/api/v1";

    // Clear headers when CSV file is removed
    useEffect(() => {
        if (!initialCsvFile) {
            setHeaders([]);
        }
    }, [initialCsvFile]);

    // Manage expansion state based on structure selection and search changes
    useEffect(() => {
        if (selectedStructure) {
            // Always expand when a structure is selected
            setIsExpanded(true);
        } else {
            // Only collapse when no structure is selected AND search term changes
            // This prevents collapsing when a structure is being selected
            setIsExpanded(false);
        }
    }, [selectedStructure]);

    // Check if current filter is a custom tag
    useEffect(() => {
        const checkIfCustomTag = async () => {
            if (
                !searchTerm.startsWith("category:") &&
                !searchTerm.startsWith("datatype:")
            ) {
                setIsCurrentFilterCustomTag(false);
                return;
            }

            const isCategory = searchTerm.startsWith("category:");
            const filterValue = isCategory
                ? searchTerm.replace("category:", "")
                : searchTerm.replace("datatype:", "");

            try {
                const response = await fetch(`${apiBaseUrl}/tags`);
                if (response.ok) {
                    const allTags = await response.json();
                    const customTag = allTags.find((tag) => {
                        if (isCategory) {
                            return (
                                (tag.tagType === "Category" ||
                                    !tag.tagType ||
                                    tag.tagType === "") &&
                                tag.name === filterValue
                            );
                        } else {
                            return (
                                tag.tagType === "Data Type" &&
                                tag.name === filterValue
                            );
                        }
                    });
                    setIsCurrentFilterCustomTag(!!customTag);
                } else {
                    setIsCurrentFilterCustomTag(false);
                }
            } catch (err) {
                console.warn("Error checking if filter is custom tag:", err);
                setIsCurrentFilterCustomTag(false);
            }
        };

        checkIfCustomTag();
    }, [searchTerm, apiBaseUrl]);

    // Fetch available categories and removed categories info
    useEffect(() => {
        const fetchCategoryInfo = async () => {
            try {
                // Fetch all structures to get available categories
                const response = await fetch(
                    "https://nda.nih.gov/api/datadictionary/datastructure"
                );
                if (response.ok) {
                    const data = await response.json();
                    const categories = new Set();
                    data.forEach((structure) => {
                        if (structure.categories) {
                            structure.categories.forEach((cat) =>
                                categories.add(cat)
                            );
                        }
                    });
                    setAvailableCategories(categories);
                }

                // Fetch removed categories from tags API
                const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
                if (tagsResponse.ok) {
                    const allTags = await tagsResponse.json();
                    const removedCategoriesMap = {};
                    const removedCategoryTags = allTags.filter(
                        (tag) => tag.tagType === "Removed Category"
                    );

                    for (const tag of removedCategoryTags) {
                        // Tag name format: "REMOVED_CATEGORY:structureShortName:categoryName"
                        const parts = tag.name.split(":");
                        if (parts.length >= 3) {
                            const structureShortName = parts[1];
                            const categoryName = parts.slice(2).join(":");
                            if (!removedCategoriesMap[structureShortName]) {
                                removedCategoriesMap[structureShortName] =
                                    new Set();
                            }
                            removedCategoriesMap[structureShortName].add(
                                categoryName
                            );
                        }
                    }
                    setRemovedCategories(removedCategoriesMap);
                }
            } catch (err) {
                console.error("Error fetching category info:", err);
            }
        };
        fetchCategoryInfo();
    }, [apiBaseUrl]);

    // Fetch database structures map for projects info
    useEffect(() => {
        const fetchDataStructures = async () => {
            try {
                const response = await fetch("/api/v1/data-structures");
                const data = await response.json();

                if (data && data.dataStructures) {
                    // Convert object/array to map keyed by shortName (case-insensitive)
                    const map = {};
                    const structures = Array.isArray(data.dataStructures)
                        ? data.dataStructures
                        : Object.values(data.dataStructures);

                    structures.forEach((structure) => {
                        const key =
                            structure.shortName?.toLowerCase() ||
                            structure.name?.toLowerCase();
                        if (key) {
                            map[key] = structure;
                            // Also store with original case for backwards compatibility
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

    // Fetch tags for selected structure
    useEffect(() => {
        if (!selectedStructure) return;

        const fetchTagsForStructure = async () => {
            try {
                const response = await fetch(`${apiBaseUrl}/tags`);
                if (!response.ok) return;
                const allTags = await response.json();

                if (!Array.isArray(allTags) || allTags.length === 0) return;

                // Filter out removed tags first
                const validTags = allTags.filter(
                    (tag) =>
                        tag.tagType !== "Removed Category" &&
                        tag.tagType !== "Removed Data Type" &&
                        !tag.name.startsWith("REMOVED_CATEGORY:") &&
                        !tag.name.startsWith("REMOVED_DATATYPE:")
                );

                // Fetch all tag structures in parallel (much faster)
                const tagStructurePromises = validTags.map(async (tag) => {
                    try {
                        const dsResponse = await fetch(
                            `${apiBaseUrl}/tags/${tag.id}/dataStructures`
                        );
                        if (dsResponse.ok) {
                            const dsData = await dsResponse.json();
                            return {
                                tag,
                                dataStructures: dsData.dataStructures || [],
                            };
                        }
                        return { tag, dataStructures: [] };
                    } catch (err) {
                        console.warn(
                            `Failed to fetch data structures for tag ${tag.name}:`,
                            err
                        );
                        return { tag, dataStructures: [] };
                    }
                });

                const tagStructures = await Promise.all(tagStructurePromises);

                // Find tags assigned to this structure
                const categoryTags = [];
                const dataTypeTags = [];
                const structureShortNameLower =
                    selectedStructure.shortName.toLowerCase();

                tagStructures.forEach(({ tag, dataStructures }) => {
                    const hasStructure = dataStructures.some(
                        (ds) =>
                            ds.shortName?.toLowerCase() ===
                            structureShortNameLower
                    );

                    if (hasStructure) {
                        if (tag.tagType === "Data Type") {
                            dataTypeTags.push(tag);
                        } else {
                            categoryTags.push(tag);
                        }
                    }
                });

                setStructureTags((prev) => ({
                    ...prev,
                    [selectedStructure.shortName]: categoryTags,
                }));
                setStructureDataTypeTags((prev) => ({
                    ...prev,
                    [selectedStructure.shortName]: dataTypeTags,
                }));
            } catch (err) {
                console.error("Error fetching tags:", err);
            }
        };

        fetchTagsForStructure();
    }, [selectedStructure, apiBaseUrl]);

    const resultsRef = useRef(null);
    const detailsRef = useRef(null);

    const showResultsHeader = useScrollDirection(resultsRef);
    const showDetailsHeader = useScrollDirection(detailsRef);

    const handleCategoryClick = async (category) => {
        // Collapse when changing search filters
        setIsExpanded(false);
        setSearchTerm(`category:${category}`);

        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const handleDataTypeClick = async (dataType) => {
        // Collapse when changing search filters
        setIsExpanded(false);
        setSearchTerm(`datatype:${dataType}`);

        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const handleElementDoubleClick = (elementName) => {
        // Switch to element search tab and search for this element
        // Don't modify the structure search term - keep it independent
        if (typeof onSwitchToElementSearch === "function") {
            onSwitchToElementSearch(elementName);
        }
    };

    return (
        <>
            <div className="flex flex-col h-screen">
                {/* Fixed header section */}
                <div className="flex-none">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4">
                            Data Structures
                        </h1>
                        <p className="text-gray-600 -mb-7">
                            Search the NDA Data Dictionary
                        </p>

                        {/* Database Filter Checkbox */}
                        <div className="-mb-8">
                            <label className="flex items-center space-x-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={databaseFilterEnabled}
                                    onChange={(e) =>
                                        setDatabaseFilterEnabled(
                                            e.target.checked
                                        )
                                    }
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
                                    {loadingDatabaseStructures && (
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                                    )}
                                </div>
                                {databaseFilterEnabled &&
                                    databaseStructures.length > 0 && (
                                        <p className="text-xs text-gray-500 ml-2">
                                            Filtering by{" "}
                                            {databaseStructures.length}{" "}
                                            available structures
                                        </p>
                                    )}
                            </label>
                        </div>

                        {/* Search Input */}
                        <div className="relative mb-3">
                            <input
                                type="text"
                                className="w-full p-4 pl-12 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Search for a data structure..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Search
                                className="absolute left-4 top-4 text-gray-400"
                                size={20}
                            />
                            {searchTerm && (
                                <button
                                    onClick={onClear}
                                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                                    aria-label="Clear search"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Scrollable content section */}
                <div className="flex-1 min-h-0">
                    {loading && (
                        <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-4 h-full">
                        {/* Results column - independently scrollable */}
                        {searchTerm && structures.length > 0 && (
                            <div
                                ref={resultsRef}
                                className={`transition-all duration-300 ease-in-out shrink-0 ${
                                    isExpanded ? "w-0 opacity-0" : "w-96"
                                }`}
                            >
                                <div className="bg-white rounded-lg shadow h-full overflow-y-auto">
                                    <div
                                        className={`sticky top-0 transition-transform duration-300 bg-white z-10 ${
                                            showResultsHeader
                                                ? "translate-y-0"
                                                : "-translate-y-full"
                                        }`}
                                    >
                                        <div className="p-4">
                                            <h2 className="text-xl font-semibold">
                                                Results ({structures.length}
                                                {databaseFilterEnabled &&
                                                    totalStructureCount >
                                                        structures.length &&
                                                    ` of ${totalStructureCount} total`}
                                                )
                                            </h2>
                                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                {searchTerm.startsWith(
                                                    "category:"
                                                ) && (
                                                    <span
                                                        className={`px-2 py-1 rounded-full text-xs inline-block ${
                                                            isCurrentFilterCustomTag
                                                                ? "bg-blue-100 text-blue-700"
                                                                : "bg-blue-100 text-blue-700"
                                                        }`}
                                                    >
                                                        {isCurrentFilterCustomTag && (
                                                            <span className="mr-1 text-orange-500">
                                                                ★
                                                            </span>
                                                        )}
                                                        {searchTerm.replace(
                                                            "category:",
                                                            ""
                                                        )}
                                                    </span>
                                                )}
                                                {searchTerm.startsWith(
                                                    "datatype:"
                                                ) && (
                                                    <span
                                                        className={`px-2 py-1 rounded-full text-xs inline-block ${
                                                            isCurrentFilterCustomTag
                                                                ? "bg-gray-100 text-gray-700"
                                                                : "bg-gray-100 text-gray-700"
                                                        }`}
                                                    >
                                                        {isCurrentFilterCustomTag && (
                                                            <span className="mr-1 text-orange-500">
                                                                ★
                                                            </span>
                                                        )}
                                                        {searchTerm.replace(
                                                            "datatype:",
                                                            ""
                                                        )}
                                                    </span>
                                                )}
                                                {databaseFilterEnabled &&
                                                    databaseStructures.length >
                                                        0 && (
                                                        <span className="text-sm text-blue-600">
                                                            <Database className="w-3 h-3 inline mr-1" />
                                                            {databaseName}{" "}
                                                            filtered
                                                        </span>
                                                    )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-2">
                                        {structures.map((structure) => (
                                            <div
                                                key={structure.shortName}
                                                className={`p-4 border rounded hover:bg-gray-50 cursor-pointer transition-colors ${
                                                    selectedStructure?.shortName ===
                                                    structure.shortName
                                                        ? "ring-2 ring-blue-500 bg-blue-50"
                                                        : ""
                                                }`}
                                                onClick={() => {
                                                    handleStructureSelect(
                                                        structure
                                                    );
                                                    // Immediate expansion for better UX
                                                    // Effect will also ensure it stays expanded
                                                    setIsExpanded(true);
                                                }}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <h3 className="font-mono text-lg font-medium text-blue-600 flex items-center">
                                                        {structure.shortName}
                                                        {databaseStructures
                                                            .map((name) =>
                                                                name.toLowerCase()
                                                            )
                                                            .includes(
                                                                structure.shortName.toLowerCase()
                                                            ) && (
                                                            <div className="relative group">
                                                                <Database className="w-4 h-4 ml-2 text-blue-500 cursor-help" />
                                                                <div className="absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                                                    This
                                                                    structure
                                                                    exists in
                                                                    the
                                                                    IMPACT-MH
                                                                    database
                                                                </div>
                                                            </div>
                                                        )}
                                                    </h3>
                                                    <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                                                        {structure.source ||
                                                            "NDA"}
                                                    </span>
                                                </div>
                                                <p className="text-base mt-2">
                                                    {structure.title}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Show message when no results found */}
                        {searchTerm && structures.length === 0 && !loading && (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center p-8">
                                    {databaseFilterEnabled &&
                                    databaseStructures.length > 0 ? (
                                        <>
                                            <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                                No Data Structure Matches Found
                                            </h3>
                                            <p className="text-gray-600 mb-4">
                                                No structures in your database
                                                match &quot;{searchTerm}&quot;.
                                            </p>
                                            <button
                                                onClick={() =>
                                                    setDatabaseFilterEnabled(
                                                        false
                                                    )
                                                }
                                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                            >
                                                Search All NDA Structures
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                                No Results Found
                                            </h3>
                                            <p className="text-gray-600">
                                                No structures match &quot;
                                                {searchTerm}&quot;.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Data Structure column - independently scrollable */}
                        {selectedStructure && (
                            <div
                                ref={detailsRef}
                                className={`transition-all duration-300 ease-in-out flex-grow overflow-y-auto ${
                                    isExpanded ? "w-full" : "w-3/5"
                                }`}
                            >
                                <div className="h-full">
                                    {/* Header Area */}
                                    {isExpanded && (
                                        <div
                                            className={`sticky top-0 z-10 bg-white shadow-sm transition-transform duration-300 ${
                                                showDetailsHeader
                                                    ? "translate-y-0"
                                                    : "-translate-y-full"
                                            }`}
                                        >
                                            <div className="flex items-center p-4">
                                                <button
                                                    onClick={() =>
                                                        setIsExpanded(false)
                                                    }
                                                    className="flex items-center text-blue-600 hover:text-blue-900 transition-colors"
                                                >
                                                    <ChevronLeft className="w-4 h-4 mr-1.5" />
                                                    <span className="text-sm font-medium">
                                                        Back to Search Results
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Content Area */}
                                    <div
                                        className="bg-white p-4 rounded-lg shadow cursor-pointer"
                                        onClick={() => {
                                            // Ensure expansion when clicking on detail area
                                            if (selectedStructure) {
                                                setIsExpanded(true);
                                            }
                                        }}
                                    >
                                        <div className="bg-white rounded-lg shadow">
                                            {/* Details content */}
                                            <div className="bg-white p-6 rounded-lg shadow">
                                                <div className="mb-8">
                                                    <div className="flex items-center gap-3">
                                                        <h1 className="text-2xl font-semibold">
                                                            {
                                                                selectedStructure.title
                                                            }
                                                        </h1>
                                                        {databaseFilterEnabled &&
                                                            databaseStructures
                                                                .map((name) =>
                                                                    name.toLowerCase()
                                                                )
                                                                .includes(
                                                                    selectedStructure.shortName.toLowerCase()
                                                                )}
                                                    </div>
                                                    {(() => {
                                                        const dbStructure =
                                                            dataStructuresMap[
                                                                selectedStructure
                                                                    .shortName
                                                            ] ||
                                                            dataStructuresMap[
                                                                selectedStructure.shortName?.toLowerCase()
                                                            ];
                                                        const projects =
                                                            dbStructure?.submittedByProjects ||
                                                            [];
                                                        if (
                                                            projects.length > 0
                                                        ) {
                                                            return (
                                                                <div className="mt-2 flex flex-wrap gap-2">
                                                                    {projects.map(
                                                                        (
                                                                            project,
                                                                            idx
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    idx
                                                                                }
                                                                                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
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
                                                </div>

                                                {selectedStructure ? (
                                                    <div className="space-y-8">
                                                        {/* Basic Info Section */}
                                                        <div className="grid grid-cols-2 gap-x-24">
                                                            <div>
                                                                <h3 className="font-medium text-gray-600 mb-2">
                                                                    Short Name
                                                                </h3>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="text-lg font-mono font-medium text-blue-600 flex items-center">
                                                                        {
                                                                            selectedStructure.shortName
                                                                        }
                                                                        {databaseStructures
                                                                            .map(
                                                                                (
                                                                                    name
                                                                                ) =>
                                                                                    name.toLowerCase()
                                                                            )
                                                                            .includes(
                                                                                selectedStructure.shortName.toLowerCase()
                                                                            ) && (
                                                                            <div className="relative group ml-2">
                                                                                <Database className="w-4 h-4 text-blue-500 cursor-help" />
                                                                                <div className="absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                                                                    This
                                                                                    structure
                                                                                    exists
                                                                                    in
                                                                                    the
                                                                                    IMPACT-MH
                                                                                    database
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <span className="px-3 py-1 rounded-full text-sm bg-gray-100 text-black-700">
                                                                        v
                                                                        {selectedStructure.shortName.slice(
                                                                            -1
                                                                        )}
                                                                        .0
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <h3 className="font-medium text-gray-600 mb-2">
                                                                    Status
                                                                </h3>
                                                                <span
                                                                    className={`px-3 py-1 rounded-full text-sm ${
                                                                        selectedStructure.status ===
                                                                        "Draft"
                                                                            ? "bg-yellow-100 text-yellow-700"
                                                                            : "bg-green-100 text-green-700"
                                                                    }`}
                                                                >
                                                                    {
                                                                        selectedStructure.status
                                                                    }
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Extended Info Section */}
                                                        <div className="grid grid-cols-2 gap-x-24">
                                                            <div>
                                                                <h3 className="font-medium text-gray-600 mb-2">
                                                                    Data Type
                                                                </h3>
                                                                {(() => {
                                                                    const customDataTypeTags =
                                                                        structureDataTypeTags[
                                                                            selectedStructure
                                                                                .shortName
                                                                        ] || [];
                                                                    if (
                                                                        customDataTypeTags.length >
                                                                        0
                                                                    ) {
                                                                        return (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {customDataTypeTags.map(
                                                                                    (
                                                                                        tag
                                                                                    ) => (
                                                                                        <span
                                                                                            key={
                                                                                                tag.id
                                                                                            }
                                                                                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm cursor-pointer hover:bg-gray-200 transition-colors"
                                                                                            onClick={(
                                                                                                e
                                                                                            ) => {
                                                                                                e.preventDefault();
                                                                                                e.stopPropagation();
                                                                                                handleDataTypeClick(
                                                                                                    tag.name
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            {
                                                                                                tag.name
                                                                                            }
                                                                                            <span className="ml-1 text-xs text-orange-500">
                                                                                                ★
                                                                                            </span>
                                                                                        </span>
                                                                                    )
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    } else {
                                                                        return (
                                                                            <span
                                                                                className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm inline-block cursor-pointer hover:bg-gray-200 transition-colors"
                                                                                onClick={(
                                                                                    e
                                                                                ) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    handleDataTypeClick(
                                                                                        selectedStructure.dataType
                                                                                    );
                                                                                }}
                                                                            >
                                                                                {selectedStructure.dataType ||
                                                                                    "Not specified"}
                                                                            </span>
                                                                        );
                                                                    }
                                                                })()}
                                                            </div>
                                                            <div>
                                                                <h3 className="font-medium text-gray-600 mb-2">
                                                                    Categories
                                                                </h3>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {(() => {
                                                                        const customCategoryTags =
                                                                            structureTags[
                                                                                selectedStructure
                                                                                    .shortName
                                                                            ] ||
                                                                            [];

                                                                        // Get removed categories for this structure
                                                                        const removedCategoriesForStructure =
                                                                            removedCategories[
                                                                                selectedStructure
                                                                                    .shortName
                                                                            ] ||
                                                                            new Set();

                                                                        // Get original categories (excluding removed ones)
                                                                        const originalCategories =
                                                                            (
                                                                                selectedStructure.categories ||
                                                                                []
                                                                            ).filter(
                                                                                (
                                                                                    category
                                                                                ) =>
                                                                                    !removedCategoriesForStructure.has(
                                                                                        category
                                                                                    )
                                                                            );

                                                                        // Create a set of original category names to avoid duplicates
                                                                        const originalCategoryNames =
                                                                            new Set(
                                                                                originalCategories
                                                                            );

                                                                        // Filter custom tags to exclude ones that match original category names
                                                                        const uniqueCustomTags =
                                                                            customCategoryTags.filter(
                                                                                (
                                                                                    tag
                                                                                ) =>
                                                                                    !originalCategoryNames.has(
                                                                                        tag.name
                                                                                    )
                                                                            );

                                                                        // Check if a tag is truly custom (not in NDA categories)
                                                                        const isTrulyCustomTag =
                                                                            (
                                                                                tagName
                                                                            ) => {
                                                                                return !availableCategories.has(
                                                                                    tagName
                                                                                );
                                                                            };

                                                                        // Combine original categories and unique custom tags
                                                                        const allCategories =
                                                                            [
                                                                                ...originalCategories.map(
                                                                                    (
                                                                                        cat
                                                                                    ) => ({
                                                                                        name: cat,
                                                                                        isCustom: false,
                                                                                        id: `original-${cat}`,
                                                                                    })
                                                                                ),
                                                                                ...uniqueCustomTags.map(
                                                                                    (
                                                                                        tag
                                                                                    ) => ({
                                                                                        name: tag.name,
                                                                                        isCustom: true,
                                                                                        isTrulyCustom:
                                                                                            isTrulyCustomTag(
                                                                                                tag.name
                                                                                            ),
                                                                                        id: tag.id,
                                                                                    })
                                                                                ),
                                                                            ];

                                                                        if (
                                                                            allCategories.length ===
                                                                            0
                                                                        ) {
                                                                            return (
                                                                                <span className="text-gray-500">
                                                                                    No
                                                                                    categories
                                                                                    specified
                                                                                </span>
                                                                            );
                                                                        }

                                                                        return allCategories.map(
                                                                            (
                                                                                item
                                                                            ) => (
                                                                                <span
                                                                                    key={
                                                                                        item.id
                                                                                    }
                                                                                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm cursor-pointer hover:bg-blue-200 transition-colors"
                                                                                    onClick={(
                                                                                        e
                                                                                    ) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        handleCategoryClick(
                                                                                            item.name
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    {
                                                                                        item.name
                                                                                    }
                                                                                    {item.isCustom &&
                                                                                        item.isTrulyCustom && (
                                                                                            <span className="ml-1 text-xs text-orange-500">
                                                                                                ★
                                                                                            </span>
                                                                                        )}
                                                                                </span>
                                                                            )
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Status & Downloads Section */}
                                                        <div className="bg-gray-50 rounded-lg p-6">
                                                            <div className="space-y-4">
                                                                <h3 className="font-medium text-gray-700">
                                                                    Downloads
                                                                </h3>
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <DownloadStructureButton
                                                                        shortName={
                                                                            selectedStructure.shortName
                                                                        }
                                                                    />
                                                                    <DownloadTemplateButton
                                                                        shortName={
                                                                            selectedStructure.shortName
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Validator Section */}
                                                        <div className="pt-6 border-t">
                                                            <CSVValidator
                                                                dataElements={
                                                                    dataElements
                                                                }
                                                                onStructureSearch={
                                                                    handleStructureSearch
                                                                }
                                                                initialCsvFile={
                                                                    initialCsvFile
                                                                }
                                                                structureShortName={
                                                                    selectedStructure?.shortName
                                                                }
                                                                onHeadersChange={
                                                                    setHeaders
                                                                }
                                                                validatorState={
                                                                    validatorState
                                                                }
                                                                onFileChange={
                                                                    onFileChange
                                                                }
                                                            />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-medium text-gray-700 mb-4">
                                                                Data Elements
                                                            </h3>
                                                            {loadingElements ? (
                                                                <div className="text-center py-4">
                                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                                                </div>
                                                            ) : (
                                                                <div className="overflow-x-auto">
                                                                    <table className="min-w-full divide-y divide-gray-200">
                                                                        <thead className="bg-gray-50">
                                                                            <tr>
                                                                                <th className="w-8 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                                    {/* Status column */}
                                                                                </th>
                                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                                    Name
                                                                                </th>
                                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                                    Type
                                                                                </th>
                                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                                    Required
                                                                                </th>
                                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                                    Description
                                                                                </th>
                                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                                    Value
                                                                                    Range
                                                                                </th>
                                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                                    Notes
                                                                                </th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                                            {dataElements.map(
                                                                                (
                                                                                    element,
                                                                                    index
                                                                                ) => {
                                                                                    const isIncluded =
                                                                                        headers.includes(
                                                                                            element.name
                                                                                        );
                                                                                    const isInDatabase =
                                                                                        databaseElements &&
                                                                                        databaseElements.has &&
                                                                                        databaseElements.has(
                                                                                            element.name.toLowerCase()
                                                                                        );

                                                                                    return (
                                                                                        <tr
                                                                                            key={
                                                                                                index
                                                                                            }
                                                                                            className="hover:bg-gray-50 cursor-pointer"
                                                                                            onClick={() =>
                                                                                                handleElementDoubleClick(
                                                                                                    element.name
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                                                <div className="flex items-center space-x-2">
                                                                                                    {isIncluded && (
                                                                                                        <CheckCircle
                                                                                                            className="w-4 h-4 text-green-500"
                                                                                                            title="Included in uploaded CSV"
                                                                                                        />
                                                                                                    )}
                                                                                                    {isInDatabase && (
                                                                                                        <div className="relative group">
                                                                                                            <Database className="w-4 h-4 text-blue-500 cursor-help" />
                                                                                                            <div className="absolute bottom-full left-0 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                                                                                                This
                                                                                                                element
                                                                                                                exists
                                                                                                                in
                                                                                                                the
                                                                                                                IMPACT-MH
                                                                                                                database
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                                                                                                {
                                                                                                    element.name
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                                                {
                                                                                                    element.type
                                                                                                }
                                                                                                {element.size && (
                                                                                                    <span className="text-gray-500 ml-1">
                                                                                                        (
                                                                                                        {
                                                                                                            element.size
                                                                                                        }

                                                                                                        )
                                                                                                    </span>
                                                                                                )}
                                                                                            </td>
                                                                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                                                <span
                                                                                                    className={`px-2 py-1 rounded-full text-xs ${
                                                                                                        element.required ===
                                                                                                        "Required"
                                                                                                            ? "bg-red-100 text-red-800"
                                                                                                            : "bg-gray-100 text-gray-800"
                                                                                                    }`}
                                                                                                >
                                                                                                    {
                                                                                                        element.required
                                                                                                    }
                                                                                                </span>
                                                                                            </td>
                                                                                            <td className="px-6 py-4 text-sm">
                                                                                                {
                                                                                                    element.description
                                                                                                }
                                                                                            </td>
                                                                                            <td className="px-6 py-4 text-sm font-mono">
                                                                                                {element.valueRange ||
                                                                                                    "-"}
                                                                                            </td>
                                                                                            <td className="px-6 py-4 text-sm">
                                                                                                {element.notes ||
                                                                                                    "-"}
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                }
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-gray-500 text-center py-4">
                                                        Select a structure to
                                                        view details
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default DataStructureSearch;

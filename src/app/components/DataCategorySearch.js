"use client";

import { useState, useEffect } from "react";
import { Search, X, Database, ChevronRight, ChevronDown } from "lucide-react";
import { DATA_PORTAL } from "@/const.js";
import CategoryTagManagement from "./CategoryTagManagement";

const DataCategorySearch = ({
    onStructureSelect,
    // Database filter props
    databaseFilterEnabled,
    setDatabaseFilterEnabled,
    databaseStructures,
    databaseName,
    loadingDatabaseStructures,
}) => {
    const [allStructures, setAllStructures] = useState([]);
    const [filteredStructures, setFilteredStructures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [structureTags, setStructureTags] = useState({});


    // Grouping and filtering states
    const [groupBy, setGroupBy] = useState("dataType"); // "category" or "dataType"
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [selectedFilters, setSelectedFilters] = useState({
        categories: new Set(),
        dataTypes: new Set(),
    });

    // Available filter options
    const [availableCategories, setAvailableCategories] = useState(new Set());
    const [availableDataTypes, setAvailableDataTypes] = useState(new Set());

    const handleTagsUpdate = (structureShortName, updatedTags) => {
        setStructureTags(prev => ({
            ...prev,
            [structureShortName]: updatedTags
    }   ));
    };

    const [dataStructuresMap, setDataStructuresMap] = useState({});
    const [isLoadingStructures, setIsLoadingStructures] = useState(false);

    const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
    const [isClinicalModalOpen, setIsClinicalModalOpen] = useState(false);
    const [modalStructure, setModalStructure] = useState(null);
    const [socialAssessments, setSocialAssessments] = useState([]);
    const [clinicalAssessments, setClinicalAssessments] = useState([]);
    const [selectedSocial, setSelectedSocial] = useState(new Set());
    const [selectedClinical, setSelectedClinical] = useState(new Set());
    const [modalSearchTerm, setModalSearchTerm] = useState("");
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState(null);

// Add this useEffect to fetch once
useEffect(() => {
  const fetchDataStructures = async () => {
    setIsLoadingStructures(true);
    try {
      const response = await fetch('https://spinup-002b0f.spinup.yale.edu/api/dataStructures/database');
      const data = await response.json();
      
      if (data && data.dataStructures) {
        setDataStructuresMap(data.dataStructures);
      }
    } catch (err) {
      console.error('Error fetching data structures:', err);
    } finally {
      setIsLoadingStructures(false);
    }
  };
  
  fetchDataStructures();
}, []);

    // Fetch all data structures on component mount
    useEffect(() => {
        fetchAllStructures();
    }, []);

    // Apply filtering when search term, filters, or database filter changes
    useEffect(() => {
        applyFilters();
    }, [
        allStructures,
        searchTerm,
        selectedFilters,
        databaseFilterEnabled,
        databaseStructures,
    ]);

    const [ndaCategories, setNdaCategories] = useState([]);
    const [ndaDataTypes, setNdaDataTypes] = useState([]);
    
    const fetchAllStructures = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                "https://nda.nih.gov/api/datadictionary/datastructure"
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch structures: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();

            // Process the data to extract categories and data types
            const categories = new Set();
            const dataTypes = new Set();

            data.forEach((structure) => {
                if (structure.categories) {
                    structure.categories.forEach((cat) => categories.add(cat));
                }
                if (structure.dataType) {
                    dataTypes.add(structure.dataType);
                }
            });

            setAllStructures(data);
            setAvailableCategories(categories);
            setAvailableDataTypes(dataTypes);
        } catch (err) {
            console.error("Error fetching structures:", err);
            setError(`Error loading data structures: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...allStructures];

        // Apply search term filter
        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (structure) =>
                    structure.shortName?.toLowerCase().includes(searchLower) ||
                    structure.title?.toLowerCase().includes(searchLower) ||
                    structure.categories?.some((cat) =>
                        cat.toLowerCase().includes(searchLower)
                    ) ||
                    structure.dataType?.toLowerCase().includes(searchLower)
            );
        }

        // Apply category filters
        if (selectedFilters.categories.size > 0) {
            filtered = filtered.filter((structure) =>
                structure.categories?.some((cat) =>
                    selectedFilters.categories.has(cat)
                )
            );
        }

        // Apply data type filters
        if (selectedFilters.dataTypes.size > 0) {
            filtered = filtered.filter((structure) =>
                selectedFilters.dataTypes.has(structure.dataType)
            );
        }

        // Apply database filter
        if (databaseFilterEnabled && databaseStructures.length > 0) {
            const databaseStructuresLower = databaseStructures.map((name) =>
                name.toLowerCase()
            );
            filtered = filtered.filter((structure) =>
                databaseStructuresLower.includes(
                    structure.shortName?.toLowerCase()
                )
            );
        }

        setFilteredStructures(filtered);
    };

    const groupStructures = (structures) => {
        const grouped = {};

        structures.forEach((structure) => {
            let groupKeys = [];

            if (groupBy === "category") {
                groupKeys = structure.categories || ["Uncategorized"];
            } else if (groupBy === "dataType") {
                groupKeys = [structure.dataType || "Unknown"];
            }

            groupKeys.forEach((key) => {
                if (!grouped[key]) {
                    grouped[key] = [];
                }
                grouped[key].push(structure);
            });
        });

        return grouped;
    };

    const toggleGroup = (groupName) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupName)) {
            newExpanded.delete(groupName);
        } else {
            newExpanded.add(groupName);
        }
        setExpandedGroups(newExpanded);
    };

    const toggleFilter = (type, value) => {
        setSelectedFilters((prev) => {
            const newFilters = { ...prev };
            const filterSet = new Set(newFilters[type]);

            if (filterSet.has(value)) {
                filterSet.delete(value);
            } else {
                filterSet.add(value);
            }

            newFilters[type] = filterSet;
            return newFilters;
        });
    };

    const clearAllFilters = () => {
        setSelectedFilters({
            categories: new Set(),
            dataTypes: new Set(),
        });
        setSearchTerm("");
    };

    const isStructureInDatabase = (shortName) => {
        if (!databaseStructures.length) return false;
        return databaseStructures
            .map((name) => name.toLowerCase())
            .includes(shortName?.toLowerCase());
    };

    // Pre-compute which categories and data types have structures in the database
    const categoriesInDatabase = new Set();
    const dataTypesInDatabase = new Set();

    if (databaseStructures.length > 0) {
        allStructures.forEach((structure) => {
            const isInDatabase = databaseStructures
                .map((name) => name.toLowerCase())
                .includes(structure.shortName.toLowerCase());

            if (isInDatabase) {
                structure.categories?.forEach((cat) =>
                    categoriesInDatabase.add(cat)
                );
                if (structure.dataType) {
                    dataTypesInDatabase.add(structure.dataType);
                }
            }
        });
    }

    const hasStructuresInDatabase = (categoryOrDataType) => {
        return (
            categoriesInDatabase.has(categoryOrDataType) ||
            dataTypesInDatabase.has(categoryOrDataType)
        );
    };

    const downloadApiAsCsv = async () => {
        try {
            // Fetch from both APIs
            const [impactResponse, ndaResponse] = await Promise.all([
                fetch(DATA_PORTAL),
                fetch("https://nda.nih.gov/api/datadictionary/datastructure"),
            ]);

            if (!impactResponse.ok) {
                throw new Error("Failed to fetch IMPACT-MH data");
            }
            if (!ndaResponse.ok) {
                throw new Error("Failed to fetch NDA data");
            }

            const impactData = await impactResponse.json();
            const ndaData = await ndaResponse.json();

            console.log("IMPACT API Response:", impactData);
            console.log("NDA API Response:", ndaData);

            // Create a map of NDA structures for quick lookup
            const ndaStructuresMap = {};
            ndaData.forEach((ndaStructure) => {
                ndaStructuresMap[ndaStructure.shortName] = ndaStructure;
            });

            // Flatten the JSON data into CSV format
            let flattenedData = [];

            if (impactData && typeof impactData === "object") {
                // Extract the dataStructures object
                const dataStructures = impactData.dataStructures || {};

                // Flatten each structure into a row
                Object.keys(dataStructures).forEach((structureName) => {
                    const impactStructure = dataStructures[structureName];
                    const ndaStructure = ndaStructuresMap[structureName];

                    // Create a row for this structure
                    const row = {
                        structureName: structureName,
                        categories: ndaStructure?.categories
                            ? ndaStructure.categories.join("; ")
                            : "",
                        dataType: ndaStructure?.dataType || "",
                        status: ndaStructure?.status || "",
                        title: ndaStructure?.title || "",
                        source: ndaStructure?.source || "NDA",
                        inImpactDatabase: "Yes",
                    };

                    flattenedData.push(row);
                });
            }

            // Convert flattened data to CSV format
            if (flattenedData && flattenedData.length > 0) {
                const headers = Object.keys(flattenedData[0]);
                const csvContent = [
                    headers.join(","),
                    ...flattenedData.map((row) =>
                        headers
                            .map((header) => {
                                const value = row[header];
                                // Handle arrays and other values
                                let stringValue;
                                if (value === null || value === undefined) {
                                    stringValue = "";
                                } else if (Array.isArray(value)) {
                                    stringValue = value.join("; ");
                                } else {
                                    stringValue = String(value);
                                }

                                // Escape quotes and wrap in quotes if contains comma or newline
                                const escapedValue = stringValue.replace(
                                    /"/g,
                                    '""'
                                );
                                return escapedValue.includes(",") ||
                                    escapedValue.includes("\n") ||
                                    escapedValue.includes('"')
                                    ? `"${escapedValue}"`
                                    : escapedValue;
                            })
                            .join(",")
                    ),
                ].join("\n");

                // Create and download the file
                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "impact-api-data.csv";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } else {
                alert("No data available to download");
            }
        } catch (error) {
            console.error("Error downloading CSV:", error);
            alert("Failed to download CSV: " + error.message);
        }
    };

    const groupedStructures = groupStructures(filteredStructures);
    const totalCount = filteredStructures.length;
    const activeFilterCount =
        selectedFilters.categories.size + selectedFilters.dataTypes.size;

    const fetchSocialAssessments = async () => {
    setModalLoading(true);
    setModalError(null);
    try {
        const response = await fetch(
            'https://nda.nih.gov/api/datadictionary/datastructure'
        );
        if (!response.ok) throw new Error("Failed to fetch categories");
        const data = await response.json();

        console.log("Raw data:", data);

       // Extract all unique categories
        const uniqueCategories = new Set();
        data.forEach(structure => {
            if (structure.categories && Array.isArray(structure.categories)) {
                structure.categories.forEach(cat => {
                    if (cat) uniqueCategories.add(cat);
                });
            }
        });
        
        console.log("Unique categories:", Array.from(uniqueCategories)); // Debug
        
        // Convert to array of objects with shortName and title
        const categoryList = Array.from(uniqueCategories).sort().map(cat => ({
            shortName: cat,
            title: cat
        }));
        
        console.log("Category list:", categoryList); // Debug
        
        setSocialAssessments(categoryList);
            } catch (err) {
        console.error("Error fetching categories:", err);
        setModalError("Failed to load categories");
    } finally {
        setModalLoading(false);
    }
};

    const fetchClinicalAssessments = async () => {
        setModalLoading(true);
        setModalError(null);
        try {
            const response = await fetch(
                'https://nda.nih.gov/api/datadictionary/datastructure'
            );
            if (!response.ok) throw new Error("Failed to fetch dataType");
            const data = await response.json();

            console.log("Raw data:", data);

        // Extract all unique dataTypes
        const uniqueDataTypes = new Set();
        data.forEach(structure => {
            if (structure.dataType) {
                uniqueDataTypes.add(structure.dataType);
            }
        });
        
            console.log("Unique data types:", Array.from(uniqueDataTypes));

        // Convert to array of objects with shortName and title
        const dataTypeList = Array.from(uniqueDataTypes).sort().map(dt => ({
            shortName: dt,
            title: dt
        }));
        
            console.log("Data type list:", dataTypeList);

           setClinicalAssessments(dataTypeList);
        } catch (err) {
            console.error("Error fetching clinical dataType:", err);
            setModalError("Failed to load clinical dataType");
        } finally {
            setModalLoading(false);
        }
    };

    const handleOpenSocialModal = (structure) => {
        setModalStructure(structure);
        setIsSocialModalOpen(true);
        fetchSocialAssessments();
    };

    const handleOpenClinicalModal = (structure) => {
        setModalStructure(structure);
        setIsClinicalModalOpen(true);
        fetchClinicalAssessments();
    };


    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">Data Dictionary</h1>
                <p className="text-gray-600 mb-6">
                    Browse all NDA data structures by category and data type
                </p>

                {/* Database Filter Checkbox */}
                <div className="mb-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={databaseFilterEnabled}
                            onChange={(e) =>
                                setDatabaseFilterEnabled(e.target.checked)
                            }
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <div className="flex items-center space-x-2">
                            <Database className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-gray-700">
                                Show only {databaseName} dictionary
                            </span>
                            {loadingDatabaseStructures && (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                            )}
                        </div>
                    </label>
                    {databaseFilterEnabled && databaseStructures.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1 ml-7">
                            Filtering by {databaseStructures.length} available
                            structures
                        </p>
                    )}
                </div>

                {/* Search Input */}
                <div className="relative mb-4">
                    <input
                        type="text"
                        className="w-full p-4 pl-12 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Search structures, categories, or data types..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search
                        className="absolute left-4 top-4 text-gray-400"
                        size={20}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm("")}
                            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                            aria-label="Clear search"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className="flex items-center space-x-2">
                        <label className="text-sm font-medium text-gray-700">
                            Group by:
                        </label>
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value)}
                            className="border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="dataType">Data Type</option>
                            <option value="category">Category</option>
                        </select>
                    </div>

                    <div className="text-sm text-gray-600">
                        Showing {totalCount} structures
                        {databaseFilterEnabled &&
                            databaseStructures.length > 0 && (
                                <span className="ml-2 text-blue-600">
                                    <Database className="w-3 h-3 inline mr-1" />
                                    {databaseName} filtered
                                </span>
                            )}
                    </div>

                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearAllFilters}
                            className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                            Clear all filters ({activeFilterCount})
                        </button>
                    )}

                    <button
                        onClick={downloadApiAsCsv}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm font-medium"
                    >
                        Download API Data as CSV
                    </button>
                </div>
            </div>

            {loading && (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">
                        Loading data structures...
                    </p>
                </div>
            )}

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Filters Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg shadow p-4 sticky top-4">
                            <h3 className="font-medium text-gray-900 mb-4">
                                Filters
                            </h3>

                            {/* Data Type Filters */}
                            <div>
                                <h4 className="font-medium text-gray-700 mb-2">
                                    Data Types
                                </h4>
                                <div className="space-y-2">
                                    {Array.from(availableDataTypes)
                                        .sort()
                                        .map((dataType) => (
                                            <label
                                                key={dataType}
                                                className="flex items-center"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFilters.dataTypes.has(
                                                        dataType
                                                    )}
                                                    onChange={() =>
                                                        toggleFilter(
                                                            "dataTypes",
                                                            dataType
                                                        )
                                                    }
                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="ml-2 text-sm text-gray-700 flex items-center">
                                                    {dataType}
                                                    {hasStructuresInDatabase(
                                                        dataType
                                                    ) && (
                                                        <div className="relative group ml-1">
                                                            <Database className="w-3 h-3 text-blue-500 cursor-help" />
                                                            <div className="absolute bottom-full left-0 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                                                This data type
                                                                has structures
                                                                in the IMPACT-MH
                                                                database
                                                            </div>
                                                        </div>
                                                    )}
                                                </span>
                                            </label>
                                        ))}
                                </div>
                            </div>
                            <br />
                            {/* Category Filters */}
                            <div className="mb-6">
                                <h4 className="font-medium text-gray-700 mb-2">
                                    Categories
                                </h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {Array.from(availableCategories)
                                        .sort()
                                        .map((category) => (
                                            <label
                                                key={category}
                                                className="flex items-center"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFilters.categories.has(
                                                        category
                                                    )}
                                                    onChange={() =>
                                                        toggleFilter(
                                                            "categories",
                                                            category
                                                        )
                                                    }
                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="ml-2 text-sm text-gray-700 flex items-center">
                                                    {category}
                                                    {hasStructuresInDatabase(
                                                        category
                                                    ) && (
                                                        <div className="relative group ml-1">
                                                            <Database className="w-3 h-3 text-blue-500 cursor-help" />
                                                            <div className="absolute bottom-full left-0 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                                                This category
                                                                has structures
                                                                in the IMPACT-MH
                                                                database
                                                            </div>
                                                        </div>
                                                    )}
                                                </span>
                                            </label>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Results */}
                    <div className="lg:col-span-3">
                        <div className="space-y-4">
                            {Object.keys(groupedStructures)
                                .sort()
                                .map((groupName) => (
                                    <div
                                        key={groupName}
                                        className="bg-white rounded-lg shadow"
                                    >
                                        <div
                                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                                            onClick={() =>
                                                toggleGroup(groupName)
                                            }
                                        >
                                            <div className="flex items-center space-x-2">
                                                {expandedGroups.has(
                                                    groupName
                                                ) ? (
                                                    <ChevronDown className="w-5 h-5 text-gray-500" />
                                                ) : (
                                                    <ChevronRight className="w-5 h-5 text-gray-500" />
                                                )}
                                                <h3 className="font-medium text-gray-900">
                                                    {groupName}
                                                </h3>
                                                <span className="text-sm text-gray-500">
                                                    (
                                                    {
                                                        groupedStructures[
                                                            groupName
                                                        ].length
                                                    }
                                                    )
                                                </span>
                                            </div>
                                        </div>

                                        {expandedGroups.has(groupName) && (
                                            <div className="border-t border-gray-200">
                                                <div className="p-4 space-y-3">
                                                    {groupedStructures[
                                                        groupName
                                                    ].map((structure) => (
                                                        <div
                                                            key={
                                                                structure.shortName
                                                            }
                                                            className="p-3 border rounded hover:bg-gray-50 cursor-pointer transition-colors"
                                                            onClick={() =>
                                                                onStructureSelect(
                                                                    structure.shortName
                                                                )
                                                            }
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <div className="flex-1">
                                                                    <h4 className="font-mono text-blue-600 font-medium flex items-center">
                                                                        {
                                                                            structure.shortName
                                                                        }
                                                                        {isStructureInDatabase(
                                                                            structure.shortName
                                                                        ) && (
                                                                            <div className="relative group">
                                                                                <Database className="w-4 h-4 ml-2 text-blue-500 cursor-help" />
                                                                                <div className="absolute bottom-full left-2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
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
                                                                    </h4>
                                                                    <p className="text-gray-700 mt-1">
                                                                        {
                                                                            structure.title
                                                                        }
                                                                    </p>

                                                                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                                                        <CategoryTagManagement
                                                                            structure={structure}
                                                                            structureId={structure.id || structure.shortName}
                                                                            structureTags={structureTags[structure.shortName] || []}
                                                                            onTagsUpdate={(tags) => handleTagsUpdate(structure.shortName, tags)}
                                                                            apiBaseUrl="https://spinup-002b0f.spinup.yale.edu/api"
                                                                            dataStructuresMap={dataStructuresMap}  
                                                                            isLoadingStructures={isLoadingStructures}  
                                                                        />
                                                                    </div>

                                                                    {/* <div className="flex flex-wrap gap-2 mt-2">
                                                                        {structure.categories?.map(
                                                                            (
                                                                                category
                                                                            ) => (
                                                                                <span
                                                                                    key={
                                                                                        category
                                                                                    }
                                                                                    className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded"
                                                                                >
                                                                                    {
                                                                                        category
                                                                                    }
                                                                                </span>
                                                                            )
                                                                        )}
                                                                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                                                                            {
                                                                                structure.dataType
                                                                            }
                                                                        </span>
                                                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                                                            {
                                                                                structure.status
                                                                            }
                                                                        </span>
                                                                    </div> */}

                                                                <div className="flex flex-wrap gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                                                    {structure.categories?.map((category) => (
                                                                        <span
                                                                            key={category}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleOpenSocialModal(structure);
                                                                            }}
                                                                            className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200 transition-colors"
                                                                        >
                                                                            {category}
                                                                        </span>
                                                                    ))}
                                                                    <span 
                                                                        className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded cursor-pointer hover:bg-gray-200 transition-colors"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleOpenClinicalModal(structure);
                                                                        }}
                                                                    >
                                                                        {structure.dataType}
                                                                    </span>
                                                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                                                        {structure.status}
                                                                    </span>
                                                                </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                            {Object.keys(groupedStructures).length === 0 &&
                                !loading && (
                                    <div className="text-center py-8">
                                        <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                                            No Results Found
                                        </h3>
                                        <p className="text-gray-600">
                                            {databaseFilterEnabled &&
                                            databaseStructures.length > 0
                                                ? `No structures in your database match the current filters.`
                                                : "No structures match the current filters."}
                                        </p>
                                        {activeFilterCount > 0 && (
                                            <button
                                                onClick={clearAllFilters}
                                                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                            >
                                                Clear Filters
                                            </button>
                                        )}
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
            )}

             {/* Social Assessment Modal */}
                    {isSocialModalOpen && modalStructure && (
                        <div 
                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                            onClick={() => setIsSocialModalOpen(false)}
                        >
                            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-between items-center p-5 border-b">
                                    <div>
                                        <h2 className="text-xl font-semibold">Social Assessments</h2>
                                        <p className="text-sm text-gray-500 mt-1">{modalStructure.title}</p>
                                    </div>
                                    <button onClick={() => setIsSocialModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto p-5">
                                    <div className="mb-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                            <input
                                                type="text"
                                                value={modalSearchTerm}
                                                onChange={(e) => setModalSearchTerm(e.target.value)}
                                                placeholder="Search assessments..."
                                                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {modalLoading && (
                                        <div className="text-center py-8">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                        </div>
                                    )}

                                    {modalError && (
                                        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{modalError}</div>
                                    )}

                                    {!modalLoading && !modalError && (
                                        <div className="space-y-2">
                                            {socialAssessments
                                                .filter(a => !modalSearchTerm || 
                                                    a.shortName?.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
                                                    a.title?.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                                                .map(assessment => (
                                                    <button
                                                        key={assessment.shortName}
                                                        onClick={() => {
                                                            setSelectedSocial(prev => {
                                                                const newSet = new Set(prev);
                                                                if (newSet.has(assessment.shortName)) {
                                                                    newSet.delete(assessment.shortName);
                                                                } else {
                                                                    newSet.add(assessment.shortName);
                                                                }
                                                                return newSet;
                                                            });
                                                        }}
                                                        className={`w-full text-left p-3 rounded-lg transition-all ${
                                                            selectedSocial.has(assessment.shortName)
                                                                ? 'bg-blue-500 text-white'
                                                                : 'bg-white border border-gray-300 hover:border-blue-400'
                                                        }`}
                                                    >
                                                        <div className="font-medium font-mono text-sm">{assessment.shortName}</div>
                                                        <div className="text-sm mt-1 opacity-90">{assessment.title}</div>
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                        </div>

                        <div className="flex justify-end gap-3 p-5 border-t">
                            <button
                                onClick={() => setIsSocialModalOpen(false)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    console.log("Selected social:", Array.from(selectedSocial));
                                    setIsSocialModalOpen(false);
                                }}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

        {/* Clinical Assessment Modal */}
            {isClinicalModalOpen && modalStructure && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    onClick={() => setIsClinicalModalOpen(false)}
                >
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-5 border-b">
                            <div>
                                <h2 className="text-xl font-semibold">Clinical Assessments</h2>
                                <p className="text-sm text-gray-500 mt-1">{modalStructure.title}</p>
                            </div>
                            <button onClick={() => setIsClinicalModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-5">
                            <div className="mb-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        type="text"
                                        value={modalSearchTerm}
                                        onChange={(e) => setModalSearchTerm(e.target.value)}
                                        placeholder="Search assessments..."
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {modalLoading && (
                                <div className="text-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                </div>
                            )}

                            {modalError && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{modalError}</div>
                            )}

                            {!modalLoading && !modalError && (
                                <div className="space-y-2">
                                    {clinicalAssessments
                                        .filter(a => !modalSearchTerm || 
                                            a.shortName?.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
                                            a.title?.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                                        .map(assessment => (
                                            <button
                                                key={assessment.shortName}
                                                onClick={() => {
                                                    setSelectedClinical(prev => {
                                                        const newSet = new Set(prev);
                                                        if (newSet.has(assessment.shortName)) {
                                                            newSet.delete(assessment.shortName);
                                                        } else {
                                                            newSet.add(assessment.shortName);
                                                        }
                                                        return newSet;
                                                    });
                                                }}
                                                className={`w-full text-left p-3 rounded-lg transition-all ${
                                                    selectedClinical.has(assessment.shortName)
                                                        ? 'bg-purple-500 text-white'
                                                        : 'bg-white border border-gray-300 hover:border-purple-400'
                                                }`}
                                            >
                                                <div className="font-medium font-mono text-sm">{assessment.shortName}</div>
                                                <div className="text-sm mt-1 opacity-90">{assessment.title}</div>
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 p-5 border-t">
                            <button
                                onClick={() => setIsClinicalModalOpen(false)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    console.log("Selected clinical:", Array.from(selectedClinical));
                                    setIsClinicalModalOpen(false);
                                }}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
        </div>
    );
};

export default DataCategorySearch;

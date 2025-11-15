"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
    Search,
    X,
    Database,
    ChevronRight,
    ChevronDown,
    Plus,
    Pencil,
} from "lucide-react";
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
    databaseConnectionError,
}) => {
    const [allStructures, setAllStructures] = useState([]);
    const [filteredStructures, setFilteredStructures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [modifiedDataTypes, setModifiedDataTypes] = useState({});

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
        setStructureTags((prev) => ({
            ...prev,
            [structureShortName]: updatedTags,
        }));
    };

    const handleDataTypeTagsUpdate = (structureShortName, updatedTags) => {
        setStructureDataTypeTags((prev) => ({
            ...prev,
            [structureShortName]: updatedTags,
        }));
    };

    const [dataStructuresMap, setDataStructuresMap] = useState({});
    const apiBaseUrl = "/api/spinup";

    const [structureTags, setStructureTags] = useState({});
    const [structureDataTypeTags, setStructureDataTypeTags] = useState({});
    // Track removed original categories (keyed by structure shortName, value is Set of category names)
    const [removedOriginalCategories, setRemovedOriginalCategories] = useState(
        {}
    );
    // Track removed original data types (keyed by structure shortName, value is boolean)
    const [removedOriginalDataTypes, setRemovedOriginalDataTypes] = useState(
        {}
    );

    // Modal states
    const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
    const [isDataTypesModalOpen, setIsDataTypesModalOpen] = useState(false);
    const [modalStructure, setModalStructure] = useState(null);
    const [modalSearchTerm, setModalSearchTerm] = useState("");
    const [modalError, setModalError] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);

    // state variables for categories tags
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedSocialTags, setSelectedSocialTags] = useState(new Set());
    const [newTagName, setNewTagName] = useState("");
    const [showCreateCategoryInput, setShowCreateCategoryInput] =
        useState(false);
    const [editingCategoryTagId, setEditingCategoryTagId] = useState(null);
    const [editingCategoryTagName, setEditingCategoryTagName] = useState("");

    // state variables for data type tags
    const [availableDataTypeTags, setAvailableDataTypeTags] = useState([]);
    const [selectedDataTypeTags, setSelectedDataTypeTags] = useState(new Set());
    const [newDataTypeTagName, setNewDataTypeTagName] = useState("");
    const [showCreateDataTypeInput, setShowCreateDataTypeInput] =
        useState(false);
    const [editingDataTypeTagId, setEditingDataTypeTagId] = useState(null);
    const [editingDataTypeTagName, setEditingDataTypeTagName] = useState("");

    const [tagLoading, setTagLoading] = useState(false);
    const [isLoadingStructures, setIsLoadingStructures] = useState(false);
    const [clinicalAssessments, setClinicalAssessments] = useState([]);
    const [selectedClinical, setSelectedClinical] = useState(new Set());

    // NDA category search state
    const [ndaCategorySearchTerm, setNdaCategorySearchTerm] = useState("");
    const [selectedNdaCategories, setSelectedNdaCategories] = useState(
        new Set()
    );

    const filteredAvailableTags = availableTags.filter(
        (tag) =>
            !modalSearchTerm ||
            tag.name.toLowerCase().includes(modalSearchTerm.toLowerCase())
    );

    // Filter available NDA categories based on search (use modalSearchTerm for unified search)
    const filteredNdaCategories = Array.from(availableCategories).filter(
        (category) =>
            !modalSearchTerm ||
            category.toLowerCase().includes(modalSearchTerm.toLowerCase())
    );

    // Combine custom tags and existing NDA categories into one unified list
    // Create a unified list where NDA categories are represented as pseudo-tag objects
    // Use a Map to ensure uniqueness by name to prevent duplicates
    const combinedMap = new Map();

    // Add custom tags first
    filteredAvailableTags.forEach((tag) => {
        combinedMap.set(tag.id, {
            ...tag,
            isNdaCategory: false,
        });
    });

    // Add NDA categories that aren't already in availableTags (by name)
    filteredNdaCategories
        .filter(
            (category) =>
                // Only include NDA categories that aren't already in availableTags
                !availableTags.some((tag) => tag.name === category)
        )
        .forEach((category) => {
            const ndaId = `nda-category-${category}`;
            // Only add if not already in map (by ID)
            if (!combinedMap.has(ndaId)) {
                combinedMap.set(ndaId, {
                    id: ndaId,
                    name: category,
                    isNdaCategory: true,
                    tagType: "Category",
                });
            }
        });

    const combinedAvailableCategories = Array.from(combinedMap.values());

    // Add this useEffect to fetch once
    useEffect(() => {
        const fetchDataStructures = async () => {
            setIsLoadingStructures(true);
            try {
                const response = await fetch("/api/spinup/dataStructures");
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
            } finally {
                setIsLoadingStructures(false);
            }
        };

        fetchDataStructures();
    }, []);

    // Load on mount
    useEffect(() => {
        // Only access localStorage on client side
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("modifiedDataTypes");
            if (saved) {
                setModifiedDataTypes(JSON.parse(saved));
            }
        }

        // Load removed categories and data types from backend (tags API)
        const fetchRemovedItems = async () => {
            try {
                const response = await fetch(`${apiBaseUrl}/tags`);
                if (!response.ok) return;

                const allTags = await response.json();
                const removedCategoriesMap = {};
                const removedDataTypesMap = {};

                // Process removed category tags (format: "REMOVED_CATEGORY:structureShortName:categoryName")
                const removedCategoryTags = allTags.filter(
                    (tag) => tag.tagType === "Removed Category"
                );

                for (const tag of removedCategoryTags) {
                    // Tag name format: "REMOVED_CATEGORY:structureShortName:categoryName"
                    const parts = tag.name.split(":");
                    if (parts.length === 3 && parts[0] === "REMOVED_CATEGORY") {
                        const structureShortName = parts[1];
                        const categoryName = parts[2];
                        if (!removedCategoriesMap[structureShortName]) {
                            removedCategoriesMap[structureShortName] =
                                new Set();
                        }
                        removedCategoriesMap[structureShortName].add(
                            categoryName
                        );
                    }
                }

                // Process removed data type tags (format: "REMOVED_DATATYPE:structureShortName")
                const removedDataTypeTags = allTags.filter(
                    (tag) => tag.tagType === "Removed Data Type"
                );

                for (const tag of removedDataTypeTags) {
                    // Tag name format: "REMOVED_DATATYPE:structureShortName"
                    const parts = tag.name.split(":");
                    if (parts.length === 2 && parts[0] === "REMOVED_DATATYPE") {
                        const structureShortName = parts[1];
                        removedDataTypesMap[structureShortName] = true;
                    }
                }

                setRemovedOriginalCategories(removedCategoriesMap);
                setRemovedOriginalDataTypes(removedDataTypesMap);
            } catch (err) {
                console.error(
                    "Error loading removed categories/data types:",
                    err
                );
            }
        };

        fetchRemovedItems();
    }, [apiBaseUrl]);

    // Fetch all data structures on component mount
    useEffect(() => {
        fetchAllStructures();
    }, []);

    // Fetch all tags on component mount for sidebar filters
    useEffect(() => {
        const fetchAllTags = async () => {
            try {
                const response = await fetch(`${apiBaseUrl}/tags`);
                if (!response.ok) return;
                const data = await response.json();

                // Set category tags
                const categoryTags = data.filter(
                    (tag) =>
                        (!tag.tagType || tag.tagType !== "Data Type") &&
                        tag.tagType !== "Removed Category" &&
                        tag.tagType !== "Removed Data Type" &&
                        !tag.name.startsWith("REMOVED_CATEGORY:") &&
                        !tag.name.startsWith("REMOVED_DATATYPE:")
                );
                setAvailableTags(categoryTags);

                // Set data type tags
                const dataTypeTags = data.filter(
                    (tag) =>
                        tag.tagType === "Data Type" &&
                        tag.tagType !== "Removed Category" &&
                        tag.tagType !== "Removed Data Type" &&
                        !tag.name.startsWith("REMOVED_CATEGORY:") &&
                        !tag.name.startsWith("REMOVED_DATATYPE:")
                );
                setAvailableDataTypeTags(dataTypeTags);
            } catch (err) {
                console.error("Error fetching tags for sidebar:", err);
            }
        };
        fetchAllTags();
    }, []);

    // Fetch structure tags in the background (non-blocking)
    useEffect(() => {
        // Delay tag fetching slightly to let structures load first
        const timer = setTimeout(() => {
            fetchStructureTags();
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    // Apply filtering when search term, filters, database filter, or structure tags change
    useEffect(() => {
        applyFilters();
    }, [
        allStructures,
        searchTerm,
        selectedFilters,
        databaseFilterEnabled,
        databaseStructures,
        structureTags,
        structureDataTypeTags,
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

    const fetchStructureTags = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/tags`);
            if (!response.ok) {
                console.warn("Failed to fetch tags, status:", response.status);
                return; // Don't throw, just return
            }
            const allTags = await response.json();

            if (!Array.isArray(allTags) || allTags.length === 0) {
                return;
            }

            // Batch requests to avoid overwhelming the API
            const BATCH_SIZE = 10;
            const BATCH_DELAY = 100; // 100ms delay between batches
            const tagsWithStructures = [];

            for (let i = 0; i < allTags.length; i += BATCH_SIZE) {
                const batch = allTags.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(
                    batch.map(async (tag) => {
                        try {
                            const dsResponse = await fetch(
                                `${apiBaseUrl}/tags/${tag.id}/dataStructures`
                            );
                            if (dsResponse.ok) {
                                const dsData = await dsResponse.json();
                                return {
                                    ...tag,
                                    dataStructures: dsData.dataStructures || [],
                                };
                            }
                            return { ...tag, dataStructures: [] };
                        } catch (err) {
                            console.warn(
                                `Failed to fetch data structures for tag ${tag.name}:`,
                                err
                            );
                            return { ...tag, dataStructures: [] };
                        }
                    })
                );
                tagsWithStructures.push(...batchResults);

                // Add delay between batches (except for the last batch)
                if (i + BATCH_SIZE < allTags.length) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, BATCH_DELAY)
                    );
                }
            }

            // Build a map of structure shortName -> tags
            const categoryTagsMap = {};
            const dataTypeTagsMap = {};

            tagsWithStructures.forEach((tag) => {
                if (
                    tag.dataStructures &&
                    Array.isArray(tag.dataStructures) &&
                    tag.dataStructures.length > 0
                ) {
                    tag.dataStructures.forEach((ds) => {
                        const shortName = ds.shortName;

                        if (!shortName) {
                            console.warn(
                                "Missing shortName for data structure:",
                                ds
                            );
                            return;
                        }

                        // Separate by tag type
                        if (tag.tagType === "Data Type") {
                            if (!dataTypeTagsMap[shortName]) {
                                dataTypeTagsMap[shortName] = [];
                            }
                            dataTypeTagsMap[shortName].push(tag);
                        } else {
                            // Category tags (tagType === "Category" or empty string/null/undefined)
                            if (!categoryTagsMap[shortName]) {
                                categoryTagsMap[shortName] = [];
                            }
                            categoryTagsMap[shortName].push(tag);
                        }
                    });
                }
            });

            setStructureTags(categoryTagsMap);
            setStructureDataTypeTags(dataTypeTagsMap);

            // Extract custom tag names and add them to available filters
            const customCategoryTags = new Set();
            const customDataTypeTags = new Set();

            tagsWithStructures.forEach((tag) => {
                if (tag.tagType === "Data Type") {
                    customDataTypeTags.add(tag.name);
                } else {
                    // Category tags
                    customCategoryTags.add(tag.name);
                }
            });

            // Note: Do NOT add custom tags to availableCategories or availableDataTypes
            // These should only contain NDA categories/data types from the API
            // Custom tags are tracked separately in availableTags and availableDataTypeTags
        } catch (err) {
            console.error("Error fetching structure tags:", err);
            // Don't throw - just log the error and continue
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

        // Apply category filters (check both original categories and custom tags)
        if (selectedFilters.categories.size > 0) {
            filtered = filtered.filter((structure) => {
                const structureCategoryTags =
                    structureTags[structure.shortName] || [];
                const originalCategories = (structure.categories || []).filter(
                    (category) =>
                        !isCategoryRemoved(structure.shortName, category)
                );

                // Check custom tags
                const matchesCustomTag = structureCategoryTags.some((tag) =>
                    selectedFilters.categories.has(tag.name)
                );

                // Check original categories (excluding removed ones)
                const matchesOriginalCategory = originalCategories.some((cat) =>
                    selectedFilters.categories.has(cat)
                );

                // Match if either custom tag or original category matches
                return matchesCustomTag || matchesOriginalCategory;
            });
        }

        // Apply data type filters (custom tags supersede original data type)
        if (selectedFilters.dataTypes.size > 0) {
            filtered = filtered.filter((structure) => {
                const structureCustomDataTypeTags =
                    structureDataTypeTags[structure.shortName] || [];

                // If structure has custom data type tags, only check those
                if (structureCustomDataTypeTags.length > 0) {
                    return structureCustomDataTypeTags.some((tag) =>
                        selectedFilters.dataTypes.has(tag.name)
                    );
                } else {
                    // No custom tags, check original data type (if not removed)
                    if (isDataTypeRemoved(structure.shortName)) {
                        return false;
                    }
                    return selectedFilters.dataTypes.has(structure.dataType);
                }
            });
        }

        // Apply database filter
        if (
            databaseFilterEnabled &&
            databaseStructures &&
            databaseStructures.length > 0
        ) {
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
                // Include both original categories and custom tags
                const customCategoryTags =
                    structureTags[structure.shortName] || [];
                const originalCategories = (structure.categories || []).filter(
                    (category) =>
                        !isCategoryRemoved(structure.shortName, category)
                );

                // Add custom tags
                customCategoryTags.forEach((tag) => {
                    groupKeys.push(tag.name);
                });

                // Add original categories (excluding removed ones)
                originalCategories.forEach((category) => {
                    groupKeys.push(category);
                });

                // If no categories at all, use uncategorized
                if (groupKeys.length === 0) {
                    groupKeys = ["Uncategorized"];
                }
            } else if (groupBy === "dataType") {
                // Check if structure has custom data type tags - if so, only use those
                const customDataTypeTags =
                    structureDataTypeTags[structure.shortName] || [];
                if (customDataTypeTags.length > 0) {
                    // Only use custom tags, supersede original data type
                    customDataTypeTags.forEach((tag) => {
                        groupKeys.push(tag.name);
                    });
                } else {
                    // No custom tags, use original data type (if not removed)
                    if (
                        !isDataTypeRemoved(structure.shortName) &&
                        structure.dataType
                    ) {
                        groupKeys = [structure.dataType];
                    } else {
                        groupKeys = ["Unknown"];
                    }
                }
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
                // Add original categories
                structure.categories?.forEach((cat) =>
                    categoriesInDatabase.add(cat)
                );
                // Add original data types
                if (structure.dataType) {
                    dataTypesInDatabase.add(structure.dataType);
                }

                // Add custom category tags if structure is in database
                const customCategoryTags =
                    structureTags[structure.shortName] || [];
                customCategoryTags.forEach((tag) => {
                    categoriesInDatabase.add(tag.name);
                });

                // Add custom data type tags if structure is in database
                const customDataTypeTags =
                    structureDataTypeTags[structure.shortName] || [];
                customDataTypeTags.forEach((tag) => {
                    dataTypesInDatabase.add(tag.name);
                });
            }
        });
    }

    const hasStructuresInDatabase = (categoryOrDataType) => {
        return (
            categoriesInDatabase.has(categoryOrDataType) ||
            dataTypesInDatabase.has(categoryOrDataType)
        );
    };

    // Check if a filter item is a custom tag (only new tags, not original categories/dataTypes)
    const isCustomTag = (item, isCategory) => {
        if (isCategory) {
            // Only return true if it's actually a new custom tag in availableTags
            // availableTags already contains only category tags (filtered to exclude data type tags)
            return availableTags.some((tag) => tag.name === item);
        } else {
            // Only return true if it's actually a new custom tag in availableDataTypeTags
            return availableDataTypeTags.some((tag) => tag.name === item);
        }
    };

    const removeOriginalCategory = async (structureShortName, categoryName) => {
        // Update local state immediately
        setRemovedOriginalCategories((prev) => {
            const updated = { ...prev };
            if (!updated[structureShortName]) {
                updated[structureShortName] = new Set();
            }
            updated[structureShortName].add(categoryName);
            return updated;
        });

        // Save to backend using tags API
        try {
            const tagName = `REMOVED_CATEGORY:${structureShortName}:${categoryName}`;

            // Check if tag already exists
            const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
            if (tagsResponse.ok) {
                const allTags = await tagsResponse.json();
                const existingTag = allTags.find(
                    (tag) =>
                        tag.name === tagName &&
                        tag.tagType === "Removed Category"
                );

                if (!existingTag) {
                    // Create the tag
                    const createResponse = await fetch(`${apiBaseUrl}/tags`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name: tagName,
                            tagType: "Removed Category",
                            description: `Removed category ${categoryName} from structure ${structureShortName}`,
                        }),
                    });

                    if (createResponse.ok) {
                        const newTag = await createResponse.json();
                        // Assign tag to the structure
                        await fetch(`${apiBaseUrl}/tags/assign`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                tagId: newTag.id,
                                dataStructureShortName: structureShortName,
                            }),
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Error saving removed category to backend:", err);
        }
    };

    const isCategoryRemoved = (structureShortName, categoryName) => {
        return (
            removedOriginalCategories[structureShortName]?.has(categoryName) ||
            false
        );
    };

    const removeOriginalDataType = async (structureShortName) => {
        // Update local state immediately
        setRemovedOriginalDataTypes((prev) => {
            const updated = { ...prev };
            updated[structureShortName] = true;
            return updated;
        });

        // Save to backend using tags API
        try {
            const tagName = `REMOVED_DATATYPE:${structureShortName}`;

            // Check if tag already exists
            const tagsResponse = await fetch(`${apiBaseUrl}/tags`);
            if (tagsResponse.ok) {
                const allTags = await tagsResponse.json();
                const existingTag = allTags.find(
                    (tag) =>
                        tag.name === tagName &&
                        tag.tagType === "Removed Data Type"
                );

                if (!existingTag) {
                    // Create the tag
                    const createResponse = await fetch(`${apiBaseUrl}/tags`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name: tagName,
                            tagType: "Removed Data Type",
                            description: `Removed data type from structure ${structureShortName}`,
                        }),
                    });

                    if (createResponse.ok) {
                        const newTag = await createResponse.json();
                        // Assign tag to the structure
                        await fetch(`${apiBaseUrl}/tags/assign`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                tagId: newTag.id,
                                dataStructureShortName: structureShortName,
                            }),
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Error saving removed data type to backend:", err);
        }
    };

    const isDataTypeRemoved = (structureShortName) => {
        return removedOriginalDataTypes[structureShortName] || false;
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
    const totalCount = allStructures.length;
    const activeFilterCount =
        selectedFilters.categories.size + selectedFilters.dataTypes.size;

    const fetchTags = async () => {
        setTagLoading(true);
        try {
            const response = await fetch(`${apiBaseUrl}/tags`);
            if (!response.ok) throw new Error("Failed to fetch tags");
            const data = await response.json();
            const categoryTags = data.filter(
                (tag) =>
                    // Exclude data type tags and removed tags
                    (!tag.tagType || tag.tagType !== "Data Type") &&
                    tag.tagType !== "Removed Category" &&
                    tag.tagType !== "Removed Data Type" &&
                    !tag.name.startsWith("REMOVED_CATEGORY:") &&
                    !tag.name.startsWith("REMOVED_DATATYPE:")
            );
            setAvailableTags(categoryTags);
        } catch (err) {
            console.error("Error fetching tags:", err);
            setModalError("Failed to load tags");
        } finally {
            setTagLoading(false);
        }
    };

    const fetchDataTypeTags = async () => {
        setTagLoading(true);
        try {
            const response = await fetch(`/api/spinup/tags`);
            if (!response.ok) throw new Error("Failed to fetch data type tags");
            const data = await response.json();
            const dataTypeTags = data.filter(
                (tag) =>
                    // Only include data type tags, exclude removed tags
                    tag.tagType === "Data Type" &&
                    tag.tagType !== "Removed Category" &&
                    tag.tagType !== "Removed Data Type" &&
                    !tag.name.startsWith("REMOVED_CATEGORY:") &&
                    !tag.name.startsWith("REMOVED_DATATYPE:")
            );
            setAvailableDataTypeTags(dataTypeTags);
        } catch (err) {
            console.error("Error fetching data type tags:", err);
            setModalError("Failed to load data type tags");
        } finally {
            setTagLoading(false);
        }
    };

    const createTag = async () => {
        if (!newTagName.trim()) return;

        try {
            const response = await fetch(`${apiBaseUrl}/tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newTagName.trim(),
                    tagType: "Category",
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to create tag");
            }

            const newTag = await response.json();

            setAvailableTags((prev) => [...prev, newTag]);

            setSelectedSocialTags((prev) => new Set([...prev, newTag.id]));

            // Note: Do NOT add custom tags to availableCategories
            // availableCategories should only contain NDA categories from the API
            // Custom tags are tracked separately in availableTags

            setNewTagName("");

            // // Add to appropriate selected set
            // if (isCategoriesModalOpen) {
            //     setSelectedSocialTags(prev => new Set([...prev, newTag.id]));
            // } else if (isDataTypesModalOpen) {
            //     setSelectedClinicalTags(prev => new Set([...prev, newTag.id]));
            // }

            // setNewTagName("");

            return newTag;
        } catch (err) {
            console.error("Error creating tag:", err);
            setModalError(err.message);
            throw err;
        }
    };

    const createDataTypeTag = async () => {
        if (!newDataTypeTagName.trim()) return;

        try {
            const response = await fetch(`/api/spinup/tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newDataTypeTagName.trim(),
                    tagType: "Data Type", // Mark this as a data type tag
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.error || "Failed to create data type tag"
                );
            }

            const newTag = await response.json();

            // Update available tags
            setAvailableDataTypeTags((prev) => [...prev, newTag]);

            // Add to selected
            setSelectedDataTypeTags((prev) => new Set([...prev, newTag.id]));

            // Note: Do NOT add custom tags to availableDataTypes
            // availableDataTypes should only contain NDA data types from the API
            // Custom tags are tracked separately in availableDataTypeTags

            // Clear input
            setNewDataTypeTagName("");

            return newTag;
        } catch (err) {
            console.error("Error creating data type tag:", err);
            setModalError(err.message);
            throw err;
        }
    };

    const updateTag = async (tagId, newName, isDataType = false) => {
        if (!newName.trim()) {
            setEditingCategoryTagId(null);
            setEditingDataTypeTagId(null);
            return;
        }

        try {
            const response = await fetch(`${apiBaseUrl}/tags/${tagId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName.trim() }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to update tag");
            }

            const updatedTag = await response.json();
            const updatedName = updatedTag.name;

            // Find old tag name before updating
            let oldName;
            if (isDataType) {
                const oldTag = availableDataTypeTags.find(
                    (t) => t.id === tagId
                );
                oldName = oldTag?.name;

                setAvailableDataTypeTags((prev) =>
                    prev.map((t) => (t.id === tagId ? updatedTag : t))
                );

                // Note: Do NOT update availableDataTypes for custom tags
                // availableDataTypes should only contain NDA data types from the API
                // Custom tags are tracked separately in availableDataTypeTags

                setEditingDataTypeTagId(null);
            } else {
                const oldTag = availableTags.find((t) => t.id === tagId);
                oldName = oldTag?.name;

                setAvailableTags((prev) =>
                    prev.map((t) => (t.id === tagId ? updatedTag : t))
                );

                // Note: Do NOT update availableCategories for custom tags
                // availableCategories should only contain NDA categories from the API
                // Custom tags are tracked separately in availableTags

                setEditingCategoryTagId(null);
            }

            // Update in structure tags
            setStructureTags((prev) => {
                const updated = {};
                Object.keys(prev).forEach((key) => {
                    updated[key] = prev[key].map((t) =>
                        t.id === tagId ? updatedTag : t
                    );
                });
                return updated;
            });

            setStructureDataTypeTags((prev) => {
                const updated = {};
                Object.keys(prev).forEach((key) => {
                    updated[key] = prev[key].map((t) =>
                        t.id === tagId ? updatedTag : t
                    );
                });
                return updated;
            });

            // Update selectedFilters if the old tag name was selected
            // Filters use tag names, so we need to update them when a tag is renamed
            if (oldName && updatedName && oldName !== updatedName) {
                setSelectedFilters((prev) => {
                    const updated = { ...prev };

                    if (isDataType) {
                        // Update data type filters
                        if (updated.dataTypes.has(oldName)) {
                            updated.dataTypes = new Set(updated.dataTypes);
                            updated.dataTypes.delete(oldName);
                            updated.dataTypes.add(updatedName);
                        }
                    } else {
                        // Update category filters
                        if (updated.categories.has(oldName)) {
                            updated.categories = new Set(updated.categories);
                            updated.categories.delete(oldName);
                            updated.categories.add(updatedName);
                        }
                    }

                    return updated;
                });
            }
        } catch (err) {
            console.error("Error updating tag:", err);
            alert(`Failed to update tag: ${err.message}`);
        }
    };

    const deleteTag = async (tagId) => {
        if (
            !confirm(
                "Are you sure you want to permanently delete this tag? This will remove it from all data structures."
            )
        ) {
            return;
        }

        try {
            const response = await fetch(`${apiBaseUrl}/tags/${tagId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to delete tag");
            }

            // Find the tag to determine its type and name before removing
            const categoryTag = availableTags.find((t) => t.id === tagId);
            const dataTypeTag = availableDataTypeTags.find(
                (t) => t.id === tagId
            );
            const tagToDelete = categoryTag || dataTypeTag;
            const isDataType = !!dataTypeTag;

            // Remove from available tags lists
            setAvailableTags((prev) => prev.filter((t) => t.id !== tagId));
            setAvailableDataTypeTags((prev) =>
                prev.filter((t) => t.id !== tagId)
            );

            // Remove from filter sets
            if (tagToDelete) {
                // Note: Do NOT remove from availableCategories or availableDataTypes
                // These should only contain NDA categories/data types from the API
                // Custom tags are tracked separately in availableTags and availableDataTypeTags
            }

            // Remove from selected tags Sets
            setSelectedSocialTags((prev) => {
                const newSet = new Set(prev);
                newSet.delete(tagId);
                return newSet;
            });

            setSelectedDataTypeTags((prev) => {
                const newSet = new Set(prev);
                newSet.delete(tagId);
                return newSet;
            });

            // Remove from structure tags
            setStructureTags((prev) => {
                const updated = {};
                Object.keys(prev).forEach((key) => {
                    updated[key] = prev[key].filter((t) => t.id !== tagId);
                });
                return updated;
            });

            setStructureDataTypeTags((prev) => {
                const updated = {};
                Object.keys(prev).forEach((key) => {
                    updated[key] = prev[key].filter((t) => t.id !== tagId);
                });
                return updated;
            });
        } catch (err) {
            console.error("Error deleting tag:", err);
            alert(`Failed to delete tag: ${err.message}`);
        }
    };

    const fetchClinicalAssessments = async () => {
        setModalLoading(true);
        setModalError(null);
        try {
            const response = await fetch(
                "https://nda.nih.gov/api/datadictionary/datastructure"
            );
            if (!response.ok) throw new Error("Failed to fetch dataType");
            const data = await response.json();

            console.log("Raw data:", data);

            // Extract all unique dataTypes
            const uniqueDataTypes = new Set();
            data.forEach((structure) => {
                if (structure.dataType) {
                    uniqueDataTypes.add(structure.dataType);
                }
            });

            console.log("Unique data types:", Array.from(uniqueDataTypes));

            // Convert to array of objects with shortName and title
            const dataTypeList = Array.from(uniqueDataTypes)
                .sort()
                .map((dt) => ({
                    shortName: dt,
                    title: dt,
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

    const handleOpenCategoriesModal = (structure) => {
        setModalStructure(structure);
        setIsCategoriesModalOpen(true);
        setModalError(null);
        setNdaCategorySearchTerm("");
        fetchTags();
        // Initialize with structure's existing tags if any
        if (structureTags[structure.shortName]) {
            const existingTagIds = structureTags[structure.shortName].map(
                (t) => t.id
            );
            setSelectedSocialTags(new Set(existingTagIds));

            // Initialize selected NDA categories based on existing tags that match NDA category names
            const existingTagNames = structureTags[structure.shortName].map(
                (t) => t.name
            );
            const matchingNdaCategories = Array.from(
                availableCategories
            ).filter((cat) => existingTagNames.includes(cat));
            setSelectedNdaCategories(new Set(matchingNdaCategories));
        } else {
            setSelectedSocialTags(new Set());
            setSelectedNdaCategories(new Set());
        }
    };

    const handleOpenDataTypesModal = (structure) => {
        setModalStructure(structure);
        setIsDataTypesModalOpen(true);
        setModalError(null);
        fetchDataTypeTags(); // Fetch data type tags
        // Initialize with structure's existing data type tags if any
        if (structureDataTypeTags[structure.shortName]) {
            setSelectedDataTypeTags(
                new Set(
                    structureDataTypeTags[structure.shortName].map((t) => t.id)
                )
            );
        } else {
            setSelectedDataTypeTags(new Set());
        }
    };

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">Data Dictionary</h1>
                <p className="text-gray-600 -mb-7">
                    Browse all NDA data structures by data type and category
                </p>

                {/* Database Filter Checkbox */}
                <div className="-mb-8">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={databaseFilterEnabled}
                            onChange={(e) =>
                                setDatabaseFilterEnabled(e.target.checked)
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
                                    Filtering by {databaseStructures.length}{" "}
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
                                    {databaseName}
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

                    {/* <button
                        onClick={downloadApiAsCsv}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm font-medium"
                    >
                        Download API Data as CSV
                    </button> */}
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

                            {/* Legend */}
                            <div className="mb-4 pb-4 border-b border-gray-200">
                                <div className="flex items-center text-xs text-gray-600">
                                    <span className="text-orange-500 mr-1">
                                        ★
                                    </span>
                                    <span>Custom tag</span>
                                </div>
                            </div>

                            {/* Data Type Filters */}
                            <div>
                                <h4 className="font-medium text-gray-700 mb-2">
                                    Data Types
                                </h4>
                                <div className="space-y-2">
                                    {(() => {
                                        // Combine NDA data types with custom data type tags
                                        const combinedDataTypes = new Set(
                                            availableDataTypes
                                        );
                                        availableDataTypeTags.forEach((tag) => {
                                            combinedDataTypes.add(tag.name);
                                        });
                                        return Array.from(combinedDataTypes)
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
                                                        {isCustomTag(
                                                            dataType,
                                                            false
                                                        ) && (
                                                            <span className="ml-1 text-orange-500 text-xs">
                                                                ★
                                                            </span>
                                                        )}
                                                        {hasStructuresInDatabase(
                                                            dataType
                                                        ) && (
                                                            <div className="relative ml-1 inline-block">
                                                                <div className="group">
                                                                    <Database className="w-3 h-3 text-blue-500 cursor-help" />
                                                                    <div className="absolute bottom-full left-0 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 pointer-events-none">
                                                                        This
                                                                        data
                                                                        type has
                                                                        structures
                                                                        in the
                                                                        IMPACT-MH
                                                                        database
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </span>
                                                </label>
                                            ));
                                    })()}
                                </div>
                            </div>

                            {/* Horizontal divider */}
                            <div className="my-4 border-t border-gray-200"></div>

                            {/* Category Filters */}
                            <div className="mb-6">
                                <h4 className="font-medium text-gray-700 mb-2">
                                    Categories
                                </h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {(() => {
                                        // Combine NDA categories with custom category tags
                                        const combinedCategories = new Set(
                                            availableCategories
                                        );
                                        availableTags.forEach((tag) => {
                                            combinedCategories.add(tag.name);
                                        });
                                        return Array.from(combinedCategories)
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
                                                        {isCustomTag(
                                                            category,
                                                            true
                                                        ) && (
                                                            <span className="ml-1 text-orange-500 text-xs">
                                                                ★
                                                            </span>
                                                        )}
                                                        {hasStructuresInDatabase(
                                                            category
                                                        ) && (
                                                            <div className="relative ml-1 inline-block">
                                                                <div className="group">
                                                                    <Database className="w-3 h-3 text-blue-500 cursor-help" />
                                                                    <div className="absolute bottom-full left-0 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10 pointer-events-none">
                                                                        This
                                                                        category
                                                                        has
                                                                        structures
                                                                        in the
                                                                        IMPACT-MH
                                                                        database
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </span>
                                                </label>
                                            ));
                                    })()}
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
                                                <h3 className="font-medium text-gray-900 flex items-center">
                                                    {groupName}
                                                    {isCustomTag(
                                                        groupName,
                                                        groupBy === "category"
                                                    ) && (
                                                        <span className="ml-1 text-orange-500 text-xs">
                                                            ★
                                                        </span>
                                                    )}
                                                    {hasStructuresInDatabase(
                                                        groupName
                                                    ) && (
                                                        <div className="relative group ml-1">
                                                            <Database className="w-3 h-3 text-blue-500 cursor-help" />
                                                            <div className="absolute bottom-full left-0 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                                                This{" "}
                                                                {groupBy ===
                                                                "category"
                                                                    ? "category"
                                                                    : "data type"}{" "}
                                                                has structures
                                                                in the IMPACT-MH
                                                                database
                                                            </div>
                                                        </div>
                                                    )}
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

                                                                    <div
                                                                        className="flex flex-wrap gap-2 mt-2"
                                                                        onClick={(
                                                                            e
                                                                        ) =>
                                                                            e.stopPropagation()
                                                                        }
                                                                    >
                                                                        {groupBy ===
                                                                        "category" ? (
                                                                            <>
                                                                                {/* Category Tags - clickable to open categories modal */}
                                                                                {(() => {
                                                                                    const customCategoryTags =
                                                                                        structureTags[
                                                                                            structure
                                                                                                .shortName
                                                                                        ] ||
                                                                                        [];
                                                                                    const originalCategories =
                                                                                        structure.categories ||
                                                                                        [];

                                                                                    return (
                                                                                        <>
                                                                                            {/* Show original NDA categories (excluding removed ones) */}
                                                                                            {originalCategories
                                                                                                .filter(
                                                                                                    (
                                                                                                        category
                                                                                                    ) =>
                                                                                                        !isCategoryRemoved(
                                                                                                            structure.shortName,
                                                                                                            category
                                                                                                        )
                                                                                                )
                                                                                                .map(
                                                                                                    (
                                                                                                        category
                                                                                                    ) => (
                                                                                                        <span
                                                                                                            key={
                                                                                                                category
                                                                                                            }
                                                                                                            className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-blue-100 text-blue-800 hover:bg-blue-200"
                                                                                                            title="Original NDA category (click to add custom tags)"
                                                                                                        >
                                                                                                            <span
                                                                                                                onClick={(
                                                                                                                    e
                                                                                                                ) => {
                                                                                                                    e.stopPropagation();
                                                                                                                    handleOpenCategoriesModal(
                                                                                                                        structure
                                                                                                                    );
                                                                                                                }}
                                                                                                            >
                                                                                                                {
                                                                                                                    category
                                                                                                                }
                                                                                                            </span>
                                                                                                        </span>
                                                                                                    )
                                                                                                )}

                                                                                            {/* Show custom category tags */}
                                                                                            {customCategoryTags.map(
                                                                                                (
                                                                                                    tag
                                                                                                ) => {
                                                                                                    const isNdaCategory =
                                                                                                        availableCategories.has(
                                                                                                            tag.name
                                                                                                        );
                                                                                                    return (
                                                                                                        <span
                                                                                                            key={
                                                                                                                tag.id
                                                                                                            }
                                                                                                            onClick={(
                                                                                                                e
                                                                                                            ) => {
                                                                                                                e.stopPropagation();
                                                                                                                handleOpenCategoriesModal(
                                                                                                                    structure
                                                                                                                );
                                                                                                            }}
                                                                                                            className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                                                                                                            title="Custom category tag (click to modify)"
                                                                                                        >
                                                                                                            {
                                                                                                                tag.name
                                                                                                            }
                                                                                                        </span>
                                                                                                    );
                                                                                                }
                                                                                            )}
                                                                                        </>
                                                                                    );
                                                                                })()}

                                                                                {/* Data Type Tags - clickable to open data types modal */}
                                                                                {(() => {
                                                                                    const hasCustomDataTypeTags =
                                                                                        structureDataTypeTags[
                                                                                            structure
                                                                                                .shortName
                                                                                        ]
                                                                                            ?.length >
                                                                                        0;

                                                                                    if (
                                                                                        hasCustomDataTypeTags
                                                                                    ) {
                                                                                        // Show custom data type tags with purple styling
                                                                                        return structureDataTypeTags[
                                                                                            structure
                                                                                                .shortName
                                                                                        ].map(
                                                                                            (
                                                                                                tag
                                                                                            ) => (
                                                                                                <span
                                                                                                    key={
                                                                                                        tag.id
                                                                                                    }
                                                                                                    onClick={(
                                                                                                        e
                                                                                                    ) => {
                                                                                                        e.stopPropagation();
                                                                                                        handleOpenDataTypesModal(
                                                                                                            structure
                                                                                                        );
                                                                                                    }}
                                                                                                    className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                                                                                                    title="Custom data type tags (click to modify)"
                                                                                                >
                                                                                                    {
                                                                                                        tag.name
                                                                                                    }
                                                                                                    <span className="ml-1 text-xs text-orange-500">
                                                                                                        ★
                                                                                                    </span>
                                                                                                </span>
                                                                                            )
                                                                                        );
                                                                                    } else {
                                                                                        // Show original NDA data type (if not removed)
                                                                                        if (
                                                                                            isDataTypeRemoved(
                                                                                                structure.shortName
                                                                                            )
                                                                                        ) {
                                                                                            return null;
                                                                                        }
                                                                                        return (
                                                                                            <span
                                                                                                className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                                                                                                onClick={(
                                                                                                    e
                                                                                                ) => {
                                                                                                    e.stopPropagation();
                                                                                                    handleOpenDataTypesModal(
                                                                                                        structure
                                                                                                    );
                                                                                                }}
                                                                                                title="Click to add custom data type tags"
                                                                                            >
                                                                                                {
                                                                                                    structure.dataType
                                                                                                }
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                })()}
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                {/* Data Type Tags - clickable to open data types modal */}
                                                                                {(() => {
                                                                                    const hasCustomDataTypeTags =
                                                                                        structureDataTypeTags[
                                                                                            structure
                                                                                                .shortName
                                                                                        ]
                                                                                            ?.length >
                                                                                        0;

                                                                                    if (
                                                                                        hasCustomDataTypeTags
                                                                                    ) {
                                                                                        // Show custom data type tags with purple styling
                                                                                        return structureDataTypeTags[
                                                                                            structure
                                                                                                .shortName
                                                                                        ].map(
                                                                                            (
                                                                                                tag
                                                                                            ) => (
                                                                                                <span
                                                                                                    key={
                                                                                                        tag.id
                                                                                                    }
                                                                                                    onClick={(
                                                                                                        e
                                                                                                    ) => {
                                                                                                        e.stopPropagation();
                                                                                                        handleOpenDataTypesModal(
                                                                                                            structure
                                                                                                        );
                                                                                                    }}
                                                                                                    className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                                                                                                    title="Custom data type tags (click to modify)"
                                                                                                >
                                                                                                    {
                                                                                                        tag.name
                                                                                                    }
                                                                                                    <span className="ml-1 text-xs text-orange-500">
                                                                                                        ★
                                                                                                    </span>
                                                                                                </span>
                                                                                            )
                                                                                        );
                                                                                    } else {
                                                                                        // Show original NDA data type (if not removed)
                                                                                        if (
                                                                                            isDataTypeRemoved(
                                                                                                structure.shortName
                                                                                            )
                                                                                        ) {
                                                                                            return null;
                                                                                        }
                                                                                        return (
                                                                                            <span
                                                                                                className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                                                                                                onClick={(
                                                                                                    e
                                                                                                ) => {
                                                                                                    e.stopPropagation();
                                                                                                    handleOpenDataTypesModal(
                                                                                                        structure
                                                                                                    );
                                                                                                }}
                                                                                                title="Click to add custom data type tags"
                                                                                            >
                                                                                                {
                                                                                                    structure.dataType
                                                                                                }
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                })()}

                                                                                {/* Category Tags - clickable to open categories modal */}
                                                                                {(() => {
                                                                                    const customCategoryTags =
                                                                                        structureTags[
                                                                                            structure
                                                                                                .shortName
                                                                                        ] ||
                                                                                        [];
                                                                                    const originalCategories =
                                                                                        structure.categories ||
                                                                                        [];

                                                                                    return (
                                                                                        <>
                                                                                            {/* Show original NDA categories (excluding removed ones) */}
                                                                                            {originalCategories
                                                                                                .filter(
                                                                                                    (
                                                                                                        category
                                                                                                    ) =>
                                                                                                        !isCategoryRemoved(
                                                                                                            structure.shortName,
                                                                                                            category
                                                                                                        )
                                                                                                )
                                                                                                .map(
                                                                                                    (
                                                                                                        category
                                                                                                    ) => (
                                                                                                        <span
                                                                                                            key={
                                                                                                                category
                                                                                                            }
                                                                                                            className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-blue-100 text-blue-800 hover:bg-blue-200"
                                                                                                            title="Original NDA category (click to add custom tags)"
                                                                                                        >
                                                                                                            <span
                                                                                                                onClick={(
                                                                                                                    e
                                                                                                                ) => {
                                                                                                                    e.stopPropagation();
                                                                                                                    handleOpenCategoriesModal(
                                                                                                                        structure
                                                                                                                    );
                                                                                                                }}
                                                                                                            >
                                                                                                                {
                                                                                                                    category
                                                                                                                }
                                                                                                            </span>
                                                                                                        </span>
                                                                                                    )
                                                                                                )}

                                                                                            {/* Show custom category tags */}
                                                                                            {customCategoryTags.map(
                                                                                                (
                                                                                                    tag
                                                                                                ) => {
                                                                                                    const isNdaCategory =
                                                                                                        availableCategories.has(
                                                                                                            tag.name
                                                                                                        );
                                                                                                    // Only show star if it's a NEW tag (in availableTags but not an original NDA category)
                                                                                                    const isNewTag =
                                                                                                        availableTags.some(
                                                                                                            (
                                                                                                                t
                                                                                                            ) =>
                                                                                                                t.name ===
                                                                                                                tag.name
                                                                                                        ) &&
                                                                                                        !isNdaCategory;
                                                                                                    return (
                                                                                                        <span
                                                                                                            key={
                                                                                                                tag.id
                                                                                                            }
                                                                                                            onClick={(
                                                                                                                e
                                                                                                            ) => {
                                                                                                                e.stopPropagation();
                                                                                                                handleOpenCategoriesModal(
                                                                                                                    structure
                                                                                                                );
                                                                                                            }}
                                                                                                            className="text-xs px-2 py-1 rounded cursor-pointer transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                                                                                                            title="Custom category tag (click to modify)"
                                                                                                        >
                                                                                                            {
                                                                                                                tag.name
                                                                                                            }
                                                                                                            {isNewTag && (
                                                                                                                <span className="ml-1 text-xs text-orange-500">
                                                                                                                    ★
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </span>
                                                                                                    );
                                                                                                }
                                                                                            )}
                                                                                        </>
                                                                                    );
                                                                                })()}
                                                                            </>
                                                                        )}

                                                                        {/* Status Badge */}
                                                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                                                            {
                                                                                structure.status
                                                                            }
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

            {/* Categories Modal */}
            {isCategoriesModalOpen && modalStructure && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    onClick={() => setIsCategoriesModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-5 border-b">
                            <div>
                                <h2 className="text-xl font-semibold">
                                    Manage Categories
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {modalStructure.title +
                                        " - " +
                                        modalStructure.shortName}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsCategoriesModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {modalLoading && (
                                <div className="text-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                </div>
                            )}

                            {modalError && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                    {modalError}
                                </div>
                            )}

                            {/* Original NDA Categories Info */}
                            {modalStructure.categories &&
                                modalStructure.categories.length > 0 && (
                                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                                        <h3 className="text-sm font-semibold text-blue-700 mb-2">
                                            Original NDA Categories
                                        </h3>
                                        <p className="text-xs text-blue-600 mb-3">
                                            Toggle visibility of original
                                            categories
                                        </p>
                                        <div className="space-y-2">
                                            {modalStructure.categories.map(
                                                (cat) => {
                                                    const isRemoved =
                                                        isCategoryRemoved(
                                                            modalStructure.shortName,
                                                            cat
                                                        );
                                                    return (
                                                        <label
                                                            key={cat}
                                                            className="flex items-center gap-2 cursor-pointer hover:bg-blue-100 p-2 rounded transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    !isRemoved
                                                                }
                                                                disabled={(() => {
                                                                    // Check if removing this would leave at least one category
                                                                    // Count: other visible original categories + selected custom tags + selected NDA categories
                                                                    const otherVisibleOriginalCategories =
                                                                        modalStructure.categories.filter(
                                                                            (
                                                                                c
                                                                            ) =>
                                                                                c !==
                                                                                    cat &&
                                                                                !isCategoryRemoved(
                                                                                    modalStructure.shortName,
                                                                                    c
                                                                                )
                                                                        );
                                                                    const selectedCustomTagCount =
                                                                        selectedSocialTags.size;
                                                                    const selectedNdaCategoryCount =
                                                                        selectedNdaCategories.size;
                                                                    const isThisCategorySelected =
                                                                        selectedNdaCategories.has(
                                                                            cat
                                                                        );
                                                                    // Count other selected NDA categories (excluding this one)
                                                                    const otherSelectedNdaCategoryCount =
                                                                        isThisCategorySelected
                                                                            ? selectedNdaCategoryCount -
                                                                              1
                                                                            : selectedNdaCategoryCount;
                                                                    const totalCategoriesAfterRemoval =
                                                                        otherVisibleOriginalCategories.length +
                                                                        selectedCustomTagCount +
                                                                        otherSelectedNdaCategoryCount;

                                                                    // Allow deselection if:
                                                                    // 1. There are multiple NDA categories selected (user can deselect one)
                                                                    // 2. OR there are custom tags selected
                                                                    // 3. OR there are other visible original categories
                                                                    // Only disable if removing this would leave zero categories total
                                                                    if (
                                                                        !isRemoved &&
                                                                        selectedCustomTagCount ===
                                                                            0 &&
                                                                        otherSelectedNdaCategoryCount ===
                                                                            0 &&
                                                                        otherVisibleOriginalCategories.length ===
                                                                            0
                                                                    ) {
                                                                        return true; // Disable - would leave no categories
                                                                    }

                                                                    return (
                                                                        !isRemoved &&
                                                                        totalCategoriesAfterRemoval <
                                                                            1
                                                                    );
                                                                })()}
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    // Clear any previous errors
                                                                    setModalError(
                                                                        null
                                                                    );
                                                                    if (
                                                                        e.target
                                                                            .checked
                                                                    ) {
                                                                        // Restore category
                                                                        const restoreCategory =
                                                                            async () => {
                                                                                // Update local state
                                                                                setRemovedOriginalCategories(
                                                                                    (
                                                                                        prev
                                                                                    ) => {
                                                                                        const updated =
                                                                                            {
                                                                                                ...prev,
                                                                                            };
                                                                                        if (
                                                                                            updated[
                                                                                                modalStructure
                                                                                                    .shortName
                                                                                            ]
                                                                                        ) {
                                                                                            updated[
                                                                                                modalStructure
                                                                                                    .shortName
                                                                                            ].delete(
                                                                                                cat
                                                                                            );
                                                                                            if (
                                                                                                updated[
                                                                                                    modalStructure
                                                                                                        .shortName
                                                                                                ]
                                                                                                    .size ===
                                                                                                0
                                                                                            ) {
                                                                                                delete updated[
                                                                                                    modalStructure
                                                                                                        .shortName
                                                                                                ];
                                                                                            }
                                                                                        }
                                                                                        return updated;
                                                                                    }
                                                                                );

                                                                                // Delete tag from backend
                                                                                try {
                                                                                    const tagName = `REMOVED_CATEGORY:${modalStructure.shortName}:${cat}`;
                                                                                    const tagsResponse =
                                                                                        await fetch(
                                                                                            `${apiBaseUrl}/tags`
                                                                                        );
                                                                                    if (
                                                                                        tagsResponse.ok
                                                                                    ) {
                                                                                        const allTags =
                                                                                            await tagsResponse.json();
                                                                                        const tagToDelete =
                                                                                            allTags.find(
                                                                                                (
                                                                                                    tag
                                                                                                ) =>
                                                                                                    tag.name ===
                                                                                                        tagName &&
                                                                                                    tag.tagType ===
                                                                                                        "Removed Category"
                                                                                            );
                                                                                        if (
                                                                                            tagToDelete
                                                                                        ) {
                                                                                            // Remove tag from structure first
                                                                                            await fetch(
                                                                                                `${apiBaseUrl}/tags/remove`,
                                                                                                {
                                                                                                    method: "POST",
                                                                                                    headers:
                                                                                                        {
                                                                                                            "Content-Type":
                                                                                                                "application/json",
                                                                                                        },
                                                                                                    body: JSON.stringify(
                                                                                                        {
                                                                                                            tagId: tagToDelete.id,
                                                                                                            dataStructureShortName:
                                                                                                                modalStructure.shortName,
                                                                                                        }
                                                                                                    ),
                                                                                                }
                                                                                            );
                                                                                            // Delete the tag
                                                                                            await fetch(
                                                                                                `${apiBaseUrl}/tags/${tagToDelete.id}`,
                                                                                                {
                                                                                                    method: "DELETE",
                                                                                                }
                                                                                            );
                                                                                        }
                                                                                    }
                                                                                } catch (err) {
                                                                                    console.error(
                                                                                        "Error restoring category:",
                                                                                        err
                                                                                    );
                                                                                }
                                                                            };
                                                                        restoreCategory();
                                                                    } else {
                                                                        // Check if removing this would leave at least one category
                                                                        // Count: other visible original categories + selected custom tags + selected NDA categories
                                                                        const otherVisibleOriginalCategories =
                                                                            modalStructure.categories.filter(
                                                                                (
                                                                                    c
                                                                                ) =>
                                                                                    c !==
                                                                                        cat &&
                                                                                    !isCategoryRemoved(
                                                                                        modalStructure.shortName,
                                                                                        c
                                                                                    )
                                                                            );
                                                                        const selectedCustomTagCount =
                                                                            selectedSocialTags.size;
                                                                        const selectedNdaCategoryCount =
                                                                            selectedNdaCategories.size;
                                                                        const isThisCategorySelected =
                                                                            selectedNdaCategories.has(
                                                                                cat
                                                                            );
                                                                        // Count other selected NDA categories (excluding this one)
                                                                        const otherSelectedNdaCategoryCount =
                                                                            isThisCategorySelected
                                                                                ? selectedNdaCategoryCount -
                                                                                  1
                                                                                : selectedNdaCategoryCount;
                                                                        const totalCategoriesAfterRemoval =
                                                                            otherVisibleOriginalCategories.length +
                                                                            selectedCustomTagCount +
                                                                            otherSelectedNdaCategoryCount;

                                                                        if (
                                                                            totalCategoriesAfterRemoval <
                                                                            1
                                                                        ) {
                                                                            setModalError(
                                                                                "Cannot remove the last category. At least one category must remain. Please add a new category first."
                                                                            );
                                                                            // Reset checkbox
                                                                            e.target.checked = true;
                                                                            return;
                                                                        }

                                                                        // Remove category
                                                                        removeOriginalCategory(
                                                                            modalStructure.shortName,
                                                                            cat
                                                                        );
                                                                    }
                                                                }}
                                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                            />
                                                            <span className="text-sm text-blue-700">
                                                                {cat}
                                                            </span>
                                                        </label>
                                                    );
                                                }
                                            )}
                                        </div>
                                    </div>
                                )}

                            {/* Selected Tags Preview */}
                            {(selectedSocialTags.size > 0 ||
                                selectedNdaCategories.size > 0) && (
                                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                                    <h3 className="text-sm font-semibold text-blue-700 mb-2">
                                        Selected Categories (
                                        {(() => {
                                            // Count unique categories (exclude duplicates where tag name is in both)
                                            let count =
                                                selectedNdaCategories.size;
                                            Array.from(
                                                selectedSocialTags
                                            ).forEach((tagId) => {
                                                const tag = availableTags.find(
                                                    (t) => t.id === tagId
                                                );
                                                if (
                                                    tag &&
                                                    !selectedNdaCategories.has(
                                                        tag.name
                                                    )
                                                ) {
                                                    count++;
                                                }
                                            });
                                            return count;
                                        })()}
                                        )
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {/* Show selected custom tags - exclude ones that are also in selectedNdaCategories */}
                                        {Array.from(selectedSocialTags).map(
                                            (tagId, index) => {
                                                const tag = availableTags.find(
                                                    (t) => t.id === tagId
                                                );
                                                // Skip if this tag name is also in selectedNdaCategories (to avoid duplicates)
                                                if (
                                                    tag &&
                                                    selectedNdaCategories.has(
                                                        tag.name
                                                    )
                                                ) {
                                                    return null;
                                                }
                                                // All tags from selectedSocialTags are custom tags (user created)
                                                return tag ? (
                                                    <div
                                                        key={`${tag.id}-${index}`}
                                                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                                                    >
                                                        <span className="text-orange-500">
                                                            ★
                                                        </span>
                                                        <span>{tag.name}</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedSocialTags(
                                                                    (prev) => {
                                                                        const newSet =
                                                                            new Set(
                                                                                prev
                                                                            );
                                                                        newSet.delete(
                                                                            tag.id
                                                                        );
                                                                        return newSet;
                                                                    }
                                                                );
                                                            }}
                                                            className="ml-1 hover:bg-blue-200 rounded-full w-4 h-4 flex items-center justify-center text-blue-600 hover:text-blue-800 font-bold"
                                                            title="Remove from selection"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ) : null;
                                            }
                                        )}
                                        {/* Show selected NDA categories */}
                                        {Array.from(selectedNdaCategories).map(
                                            (categoryName) => {
                                                // Check if there's a custom tag with the same name
                                                const customTagWithSameName =
                                                    availableTags.find(
                                                        (tag) =>
                                                            tag.name ===
                                                            categoryName
                                                    );

                                                return (
                                                    <div
                                                        key={`nda-${categoryName}`}
                                                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                                                        onClick={(e) => {
                                                            // Prevent click from bubbling to parent
                                                            e.stopPropagation();
                                                        }}
                                                    >
                                                        <span>
                                                            {categoryName}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                // Remove from NDA categories selection
                                                                setSelectedNdaCategories(
                                                                    (prev) => {
                                                                        const newSet =
                                                                            new Set(
                                                                                prev
                                                                            );
                                                                        newSet.delete(
                                                                            categoryName
                                                                        );
                                                                        return newSet;
                                                                    }
                                                                );
                                                                // Also remove custom tag with same name if it exists
                                                                if (
                                                                    customTagWithSameName
                                                                ) {
                                                                    setSelectedSocialTags(
                                                                        (
                                                                            prev
                                                                        ) => {
                                                                            const newSet =
                                                                                new Set(
                                                                                    prev
                                                                                );
                                                                            newSet.delete(
                                                                                customTagWithSameName.id
                                                                            );
                                                                            return newSet;
                                                                        }
                                                                    );
                                                                }
                                                            }}
                                                            className="ml-1 hover:bg-blue-200 rounded-full w-4 h-4 flex items-center justify-center text-blue-600 hover:text-blue-800 font-bold"
                                                            title="Remove from selection"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                );
                                            }
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Categories Header with Create Button */}
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-gray-700">
                                        Categories
                                    </h3>
                                    <button
                                        onClick={() => {
                                            setShowCreateCategoryInput(
                                                !showCreateCategoryInput
                                            );
                                            if (!showCreateCategoryInput) {
                                                setNewTagName("");
                                            }
                                        }}
                                        className="flex items-center justify-center w-6 h-6 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                                        title="Create new category tag"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Create New Tag Input (shown when + is clicked) */}
                                {showCreateCategoryInput && (
                                    <div className="mb-3 space-y-2">
                                        <input
                                            type="text"
                                            value={newTagName}
                                            onChange={(e) =>
                                                setNewTagName(e.target.value)
                                            }
                                            placeholder="Category tag name..."
                                            className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                            onKeyPress={(e) => {
                                                if (
                                                    e.key === "Enter" &&
                                                    newTagName.trim()
                                                ) {
                                                    createTag()
                                                        .then(() => {
                                                            setShowCreateCategoryInput(
                                                                false
                                                            );
                                                        })
                                                        .catch(() => {
                                                            // Error already handled in createTag
                                                        });
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    createTag()
                                                        .then(() => {
                                                            setShowCreateCategoryInput(
                                                                false
                                                            );
                                                        })
                                                        .catch(() => {
                                                            // Error already handled in createTag
                                                        });
                                                }}
                                                disabled={
                                                    !newTagName.trim() ||
                                                    tagLoading
                                                }
                                                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors text-sm font-medium"
                                            >
                                                <Plus className="w-4 h-4 inline mr-2" />
                                                Create & Add to Selection
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowCreateCategoryInput(
                                                        false
                                                    );
                                                    setNewTagName("");
                                                }}
                                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Unified Search */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        type="text"
                                        value={modalSearchTerm}
                                        onChange={(e) =>
                                            setModalSearchTerm(e.target.value)
                                        }
                                        placeholder="Search all categories..."
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Combined Word Bank */}
                            {!tagLoading && (
                                <div className="mb-4">
                                    <p className="text-xs text-gray-500 mb-3">
                                        <span className="text-orange-500">
                                            ★
                                        </span>{" "}
                                        Custom tag
                                    </p>
                                    <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                                        <div className="flex flex-wrap gap-2">
                                            {combinedAvailableCategories.length >
                                            0 ? (
                                                combinedAvailableCategories.map(
                                                    (item, index) => {
                                                        // Check if this is a custom tag (from availableTags) vs NDA category (pseudo-tag)
                                                        // Custom tags have a real ID from the API (UUID format), NDA categories have a temporary ID starting with "nda-category-"
                                                        // A tag is custom ONLY if it's in availableTags AND NOT in availableCategories (NDA categories list)

                                                        // Check if item has a real UUID (not starting with "nda-category-")
                                                        const hasRealId =
                                                            item.id &&
                                                            !item.id.startsWith(
                                                                "nda-category-"
                                                            );

                                                        // Check if the name exists in NDA categories
                                                        const isNdaCategoryName =
                                                            availableCategories.has(
                                                                item.name
                                                            );

                                                        // Custom tag = has real ID AND NOT an NDA category name
                                                        const isCustomTag =
                                                            hasRealId &&
                                                            !isNdaCategoryName;
                                                        const isNdaCategory =
                                                            !isCustomTag;
                                                        const isSelected =
                                                            isNdaCategory
                                                                ? selectedNdaCategories.has(
                                                                      item.name
                                                                  )
                                                                : selectedSocialTags.has(
                                                                      item.id
                                                                  );

                                                        return (
                                                            <div
                                                                key={`${item.id}-${index}`}
                                                                className="inline-flex items-center group relative"
                                                            >
                                                                {isCustomTag &&
                                                                editingCategoryTagId ===
                                                                    item.id ? (
                                                                    <input
                                                                        type="text"
                                                                        value={
                                                                            editingCategoryTagName
                                                                        }
                                                                        onChange={(
                                                                            e
                                                                        ) =>
                                                                            setEditingCategoryTagName(
                                                                                e
                                                                                    .target
                                                                                    .value
                                                                            )
                                                                        }
                                                                        onBlur={() => {
                                                                            updateTag(
                                                                                item.id,
                                                                                editingCategoryTagName,
                                                                                false
                                                                            );
                                                                        }}
                                                                        onKeyDown={(
                                                                            e
                                                                        ) => {
                                                                            if (
                                                                                e.key ===
                                                                                "Enter"
                                                                            ) {
                                                                                updateTag(
                                                                                    item.id,
                                                                                    editingCategoryTagName,
                                                                                    false
                                                                                );
                                                                            } else if (
                                                                                e.key ===
                                                                                "Escape"
                                                                            ) {
                                                                                setEditingCategoryTagId(
                                                                                    null
                                                                                );
                                                                            }
                                                                        }}
                                                                        autoFocus
                                                                        className="px-3 py-1.5 rounded-l-full text-sm border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                        onClick={(
                                                                            e
                                                                        ) =>
                                                                            e.stopPropagation()
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            onClick={(
                                                                                e
                                                                            ) => {
                                                                                e.stopPropagation();
                                                                                if (
                                                                                    isNdaCategory
                                                                                ) {
                                                                                    setSelectedNdaCategories(
                                                                                        (
                                                                                            prev
                                                                                        ) => {
                                                                                            const newSet =
                                                                                                new Set(
                                                                                                    prev
                                                                                                );
                                                                                            if (
                                                                                                newSet.has(
                                                                                                    item.name
                                                                                                )
                                                                                            ) {
                                                                                                newSet.delete(
                                                                                                    item.name
                                                                                                );
                                                                                            } else {
                                                                                                newSet.add(
                                                                                                    item.name
                                                                                                );
                                                                                            }
                                                                                            return newSet;
                                                                                        }
                                                                                    );
                                                                                } else {
                                                                                    setSelectedSocialTags(
                                                                                        (
                                                                                            prev
                                                                                        ) => {
                                                                                            const newSet =
                                                                                                new Set(
                                                                                                    prev
                                                                                                );
                                                                                            if (
                                                                                                newSet.has(
                                                                                                    item.id
                                                                                                )
                                                                                            ) {
                                                                                                newSet.delete(
                                                                                                    item.id
                                                                                                );
                                                                                            } else {
                                                                                                newSet.add(
                                                                                                    item.id
                                                                                                );
                                                                                            }
                                                                                            return newSet;
                                                                                        }
                                                                                    );
                                                                                }
                                                                            }}
                                                                            className={`inline-flex items-center px-3 py-1.5 ${
                                                                                isCustomTag
                                                                                    ? "rounded-l-full"
                                                                                    : "rounded-full"
                                                                            } text-sm transition-all relative ${
                                                                                isSelected
                                                                                    ? "bg-blue-500 text-white"
                                                                                    : "bg-white text-gray-700 border border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                                                                            }`}
                                                                        >
                                                                            {isCustomTag && (
                                                                                <span className="mr-1 text-xs text-orange-500">
                                                                                    ★
                                                                                </span>
                                                                            )}
                                                                            {
                                                                                item.name
                                                                            }
                                                                            {item.dataStructures && (
                                                                                <span className="ml-2 text-xs opacity-70">
                                                                                    (
                                                                                    {
                                                                                        item
                                                                                            .dataStructures
                                                                                            .length
                                                                                    }

                                                                                    )
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                        {isCustomTag && (
                                                                            <>
                                                                                <button
                                                                                    onClick={(
                                                                                        e
                                                                                    ) => {
                                                                                        e.stopPropagation();
                                                                                        setEditingCategoryTagId(
                                                                                            item.id
                                                                                        );
                                                                                        setEditingCategoryTagName(
                                                                                            item.name
                                                                                        );
                                                                                    }}
                                                                                    className={`px-2 py-1.5 text-sm transition-all border-l-0 inline-flex items-center justify-center ${
                                                                                        isSelected
                                                                                            ? "bg-blue-500 text-white hover:bg-blue-600"
                                                                                            : "bg-white text-gray-700 border border-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-400"
                                                                                    }`}
                                                                                    title="Edit tag name"
                                                                                >
                                                                                    <Pencil className="w-4 h-5" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(
                                                                                        e
                                                                                    ) => {
                                                                                        e.stopPropagation();
                                                                                        deleteTag(
                                                                                            item.id
                                                                                        );
                                                                                    }}
                                                                                    className={`px-2 py-1.5 rounded-r-full text-sm transition-all border-l-0 inline-flex items-center justify-center ${
                                                                                        isSelected
                                                                                            ? "bg-blue-500 text-white hover:bg-red-600"
                                                                                            : "bg-white text-gray-700 border border-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-400"
                                                                                    }`}
                                                                                    title="Delete tag permanently"
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    }
                                                )
                                            ) : (
                                                <p className="text-gray-500 text-sm">
                                                    No category tags found
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 p-5 border-t">
                            <button
                                onClick={() => {
                                    setIsCategoriesModalOpen(false);
                                    setSelectedSocialTags(new Set());
                                    setSelectedNdaCategories(new Set());
                                    setNewTagName("");
                                    setModalSearchTerm("");
                                    setNdaCategorySearchTerm("");
                                    setShowCreateCategoryInput(false);
                                }}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        setModalLoading(true);

                                        // Process selected NDA categories - create tags if they don't exist
                                        const ndaCategoryTagIds = [];

                                        // Fetch all tags to check for existing ones
                                        const allTagsResponse = await fetch(
                                            `${apiBaseUrl}/tags`
                                        );
                                        let allTags = [];
                                        if (allTagsResponse.ok) {
                                            allTags =
                                                await allTagsResponse.json();
                                        }

                                        for (const categoryName of selectedNdaCategories) {
                                            // Check if tag already exists (check all tags, not just availableTags)
                                            let existingTag = allTags.find(
                                                (tag) =>
                                                    tag.name === categoryName &&
                                                    (tag.tagType ===
                                                        "Category" ||
                                                        !tag.tagType ||
                                                        tag.tagType === "")
                                            );

                                            if (!existingTag) {
                                                // Create tag for this NDA category
                                                const createResponse =
                                                    await fetch(
                                                        `${apiBaseUrl}/tags`,
                                                        {
                                                            method: "POST",
                                                            headers: {
                                                                "Content-Type":
                                                                    "application/json",
                                                            },
                                                            body: JSON.stringify(
                                                                {
                                                                    name: categoryName,
                                                                    tagType:
                                                                        "Category",
                                                                }
                                                            ),
                                                        }
                                                    );

                                                if (createResponse.ok) {
                                                    existingTag =
                                                        await createResponse.json();
                                                    // Add to available tags and refresh
                                                    setAvailableTags((prev) => [
                                                        ...prev,
                                                        existingTag,
                                                    ]);
                                                    allTags.push(existingTag);
                                                } else {
                                                    const errorText =
                                                        await createResponse
                                                            .text()
                                                            .catch(
                                                                () =>
                                                                    "Unknown error"
                                                            );
                                                    console.error(
                                                        `Failed to create tag for category ${categoryName}:`,
                                                        errorText
                                                    );
                                                    throw new Error(
                                                        `Failed to create tag for category "${categoryName}": ${errorText}`
                                                    );
                                                }
                                            } else {
                                                // Tag exists, make sure it's in availableTags
                                                if (
                                                    !availableTags.find(
                                                        (t) =>
                                                            t.id ===
                                                            existingTag.id
                                                    )
                                                ) {
                                                    setAvailableTags((prev) => [
                                                        ...prev,
                                                        existingTag,
                                                    ]);
                                                }
                                            }

                                            if (existingTag && existingTag.id) {
                                                ndaCategoryTagIds.push(
                                                    existingTag.id
                                                );
                                            } else {
                                                console.error(
                                                    "Tag created but missing ID:",
                                                    existingTag
                                                );
                                                throw new Error(
                                                    `Tag for category "${categoryName}" was created but is missing an ID`
                                                );
                                            }
                                        }

                                        // Combine custom tag IDs with NDA category tag IDs
                                        const selectedTagIds = [
                                            ...Array.from(selectedSocialTags),
                                            ...ndaCategoryTagIds,
                                        ];

                                        // Validate that at least one category will remain after save
                                        const visibleOriginalCategoriesAfterSave =
                                            modalStructure.categories.filter(
                                                (c) =>
                                                    !isCategoryRemoved(
                                                        modalStructure.shortName,
                                                        c
                                                    )
                                            );
                                        const totalCategoriesAfterSave =
                                            visibleOriginalCategoriesAfterSave.length +
                                            selectedTagIds.length;

                                        if (totalCategoriesAfterSave < 1) {
                                            setModalError(
                                                "Cannot save: At least one category must remain. Please add a category before removing the last one."
                                            );
                                            setModalLoading(false);
                                            return;
                                        }

                                        const existingStructure =
                                            dataStructuresMap[
                                                modalStructure.shortName
                                            ];

                                        if (!existingStructure) {
                                            throw new Error(
                                                `Data structure "${modalStructure.shortName}" not found in backend`
                                            );
                                        }

                                        // Get current tag IDs for this structure
                                        const currentTagIds = new Set(
                                            (
                                                structureTags[
                                                    modalStructure.shortName
                                                ] || []
                                            ).map((t) => t.id)
                                        );

                                        // Find tags to add and remove
                                        const toAdd = selectedTagIds.filter(
                                            (id) => !currentTagIds.has(id)
                                        );
                                        const toRemove = Array.from(
                                            currentTagIds
                                        ).filter(
                                            (id) => !selectedTagIds.includes(id)
                                        );

                                        // If nothing has changed, cancel and close modal
                                        if (
                                            toAdd.length === 0 &&
                                            toRemove.length === 0
                                        ) {
                                            setIsCategoriesModalOpen(false);
                                            setSelectedSocialTags(new Set());
                                            setSelectedNdaCategories(new Set());
                                            setNewTagName("");
                                            setModalSearchTerm("");
                                            setNdaCategorySearchTerm("");
                                            return;
                                        }

                                        // Get the data structure ID from the existing structure
                                        const dataStructureId =
                                            existingStructure.dataStructureId ||
                                            existingStructure.id ||
                                            existingStructure.DataStructureID;

                                        if (!dataStructureId) {
                                            throw new Error(
                                                `Data structure "${modalStructure.shortName}" is missing a dataStructureId`
                                            );
                                        }

                                        // Process removals
                                        for (const tagId of toRemove) {
                                            const response = await fetch(
                                                `/api/spinup/tags/remove`,
                                                {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type":
                                                            "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        tagId: tagId,
                                                        DataStructureID:
                                                            dataStructureId,
                                                    }),
                                                }
                                            );

                                            if (!response.ok) {
                                                const errorData =
                                                    await response.json();
                                                throw new Error(
                                                    errorData.error ||
                                                        "Failed to remove tag"
                                                );
                                            }
                                        }

                                        // Process additions
                                        for (const tagId of toAdd) {
                                            if (!tagId) {
                                                console.warn(
                                                    "Skipping invalid tagId:",
                                                    tagId
                                                );
                                                continue;
                                            }

                                            // Get the data structure ID from the existing structure
                                            const dataStructureId =
                                                existingStructure.dataStructureId ||
                                                existingStructure.id ||
                                                existingStructure.DataStructureID;

                                            if (!dataStructureId) {
                                                console.error(
                                                    "Structure missing ID:",
                                                    existingStructure
                                                );
                                                throw new Error(
                                                    `Data structure "${modalStructure.shortName}" is missing a dataStructureId`
                                                );
                                            }

                                            const requestBody = {
                                                tagId: tagId,
                                                DataStructureID:
                                                    dataStructureId,
                                            };

                                            console.log(
                                                "Assigning tag:",
                                                requestBody
                                            );

                                            const response = await fetch(
                                                `/api/spinup/tags/assign`,
                                                {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type":
                                                            "application/json",
                                                    },
                                                    body: JSON.stringify(
                                                        requestBody
                                                    ),
                                                }
                                            );

                                            if (!response.ok) {
                                                let errorData;
                                                try {
                                                    errorData =
                                                        await response.json();
                                                } catch {
                                                    const errorText =
                                                        await response
                                                            .text()
                                                            .catch(
                                                                () =>
                                                                    "Unknown error"
                                                            );
                                                    errorData = {
                                                        error: `API returned ${response.status}`,
                                                        details: errorText,
                                                    };
                                                }
                                                console.error(
                                                    "Failed to assign tag:",
                                                    {
                                                        requestBody,
                                                        responseStatus:
                                                            response.status,
                                                        error: errorData,
                                                    }
                                                );
                                                throw new Error(
                                                    errorData.details ||
                                                        errorData.error ||
                                                        `Failed to assign tag (${response.status}). Check console for details.`
                                                );
                                            }
                                        }

                                        // Update local state - include both custom tags and NDA category tags
                                        const customTags = availableTags.filter(
                                            (tag) =>
                                                selectedSocialTags.has(tag.id)
                                        );

                                        // Get NDA category tags (they should now be in availableTags after creation)
                                        const ndaCategoryTags =
                                            availableTags.filter((tag) =>
                                                ndaCategoryTagIds.includes(
                                                    tag.id
                                                )
                                            );

                                        const newTags = [
                                            ...customTags,
                                            ...ndaCategoryTags,
                                        ];
                                        setStructureTags((prev) => ({
                                            ...prev,
                                            [modalStructure.shortName]: newTags,
                                        }));

                                        setIsCategoriesModalOpen(false);
                                        setSelectedSocialTags(new Set());
                                        setSelectedNdaCategories(new Set());
                                        setNewTagName("");
                                        setModalSearchTerm("");
                                        setNdaCategorySearchTerm("");
                                    } catch (err) {
                                        console.error(
                                            "Error saving category tags:",
                                            err
                                        );
                                        setModalError(
                                            "Failed to save category tags: " +
                                                err.message
                                        );
                                    } finally {
                                        setModalLoading(false);
                                    }
                                }}
                                disabled={modalLoading}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
                            >
                                {modalLoading ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Data Types Modal */}
            {isDataTypesModalOpen && modalStructure && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    onClick={() => {
                        setIsDataTypesModalOpen(false);
                        setShowCreateDataTypeInput(false);
                    }}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-5 border-b">
                            <div>
                                <h2 className="text-xl font-semibold">
                                    Manage Data Type
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {modalStructure.title +
                                        " - " +
                                        modalStructure.shortName}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsDataTypesModalOpen(false);
                                    setShowCreateDataTypeInput(false);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {modalLoading && (
                                <div className="text-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                </div>
                            )}

                            {modalError && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                    {modalError}
                                </div>
                            )}

                            {/* Original NDA Data Type Info */}
                            {modalStructure.dataType && (
                                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                        Original NDA Data Type
                                    </h3>
                                    <p className="text-xs text-gray-600 mb-3">
                                        Toggle visibility of original data type
                                    </p>
                                    <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={
                                                !isDataTypeRemoved(
                                                    modalStructure.shortName
                                                )
                                            }
                                            disabled={(() => {
                                                const isDataTypeCurrentlyRemoved =
                                                    isDataTypeRemoved(
                                                        modalStructure.shortName
                                                    );
                                                const customDataTypeTags =
                                                    structureDataTypeTags[
                                                        modalStructure.shortName
                                                    ] || [];

                                                // Check if any custom data type tags are selected
                                                const hasCustomDataTypeTags =
                                                    selectedDataTypeTags.size >
                                                    0;

                                                // Auto-select and disable if no alternatives are selected
                                                if (
                                                    !hasCustomDataTypeTags &&
                                                    !isDataTypeCurrentlyRemoved
                                                ) {
                                                    return true; // Disable and auto-select
                                                }

                                                const hasOriginalDataType =
                                                    modalStructure.dataType &&
                                                    !isDataTypeCurrentlyRemoved;
                                                const totalVisibleDataTypes =
                                                    (hasOriginalDataType
                                                        ? 1
                                                        : 0) +
                                                    customDataTypeTags.length;
                                                return (
                                                    !isDataTypeCurrentlyRemoved &&
                                                    totalVisibleDataTypes <= 1
                                                );
                                            })()}
                                            onChange={(e) => {
                                                // Clear any previous errors
                                                setModalError(null);
                                                if (e.target.checked) {
                                                    // Restore data type
                                                    const restoreDataType =
                                                        async () => {
                                                            // Update local state
                                                            setRemovedOriginalDataTypes(
                                                                (prev) => {
                                                                    const updated =
                                                                        {
                                                                            ...prev,
                                                                        };
                                                                    delete updated[
                                                                        modalStructure
                                                                            .shortName
                                                                    ];
                                                                    return updated;
                                                                }
                                                            );

                                                            // Delete tag from backend
                                                            try {
                                                                const tagName = `REMOVED_DATATYPE:${modalStructure.shortName}`;
                                                                const tagsResponse =
                                                                    await fetch(
                                                                        `${apiBaseUrl}/tags`
                                                                    );
                                                                if (
                                                                    tagsResponse.ok
                                                                ) {
                                                                    const allTags =
                                                                        await tagsResponse.json();
                                                                    const tagToDelete =
                                                                        allTags.find(
                                                                            (
                                                                                tag
                                                                            ) =>
                                                                                tag.name ===
                                                                                    tagName &&
                                                                                tag.tagType ===
                                                                                    "Removed Data Type"
                                                                        );
                                                                    if (
                                                                        tagToDelete
                                                                    ) {
                                                                        // Remove tag from structure first
                                                                        await fetch(
                                                                            `${apiBaseUrl}/tags/remove`,
                                                                            {
                                                                                method: "POST",
                                                                                headers:
                                                                                    {
                                                                                        "Content-Type":
                                                                                            "application/json",
                                                                                    },
                                                                                body: JSON.stringify(
                                                                                    {
                                                                                        tagId: tagToDelete.id,
                                                                                        dataStructureShortName:
                                                                                            modalStructure.shortName,
                                                                                    }
                                                                                ),
                                                                            }
                                                                        );
                                                                        // Delete the tag
                                                                        await fetch(
                                                                            `${apiBaseUrl}/tags/${tagToDelete.id}`,
                                                                            {
                                                                                method: "DELETE",
                                                                            }
                                                                        );
                                                                    }
                                                                }
                                                            } catch (err) {
                                                                console.error(
                                                                    "Error restoring data type:",
                                                                    err
                                                                );
                                                            }
                                                        };
                                                    restoreDataType();
                                                } else {
                                                    // Check if this is the last visible data type
                                                    const isDataTypeCurrentlyRemoved =
                                                        isDataTypeRemoved(
                                                            modalStructure.shortName
                                                        );
                                                    const customDataTypeTags =
                                                        structureDataTypeTags[
                                                            modalStructure
                                                                .shortName
                                                        ] || [];
                                                    const hasOriginalDataType =
                                                        modalStructure.dataType &&
                                                        !isDataTypeCurrentlyRemoved;
                                                    const totalVisibleDataTypes =
                                                        (hasOriginalDataType
                                                            ? 1
                                                            : 0) +
                                                        customDataTypeTags.length;

                                                    if (
                                                        totalVisibleDataTypes <=
                                                        1
                                                    ) {
                                                        setModalError(
                                                            "Cannot remove the last data type. At least one data type must remain."
                                                        );
                                                        // Reset checkbox
                                                        e.target.checked = true;
                                                        return;
                                                    }

                                                    // Remove data type
                                                    removeOriginalDataType(
                                                        modalStructure.shortName
                                                    );
                                                }
                                            }}
                                            className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500"
                                        />
                                        <span className="text-sm text-gray-700">
                                            {modalStructure.dataType}
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Selected Data Type Tags Preview */}
                            {selectedDataTypeTags.size > 0 && (
                                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                        Selected Custom Data Type Tags (
                                        {selectedDataTypeTags.size})
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from(selectedDataTypeTags).map(
                                            (tagId, index) => {
                                                const tag =
                                                    availableDataTypeTags.find(
                                                        (t) => t.id === tagId
                                                    );
                                                return tag ? (
                                                    <div
                                                        key={`${tag.id}-${index}`}
                                                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                                                    >
                                                        <span>{tag.name}</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedDataTypeTags(
                                                                    (prev) => {
                                                                        const newSet =
                                                                            new Set(
                                                                                prev
                                                                            );
                                                                        newSet.delete(
                                                                            tag.id
                                                                        );
                                                                        return newSet;
                                                                    }
                                                                );
                                                            }}
                                                            className="ml-1 hover:bg-gray-200 rounded-full w-4 h-4 flex items-center justify-center text-gray-600 hover:text-gray-700 font-bold"
                                                            title="Remove from selection"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ) : null;
                                            }
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Data Types Header with Create Button */}
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-gray-700">
                                        Data Types
                                    </h3>
                                    <button
                                        onClick={() => {
                                            setShowCreateDataTypeInput(
                                                !showCreateDataTypeInput
                                            );
                                            if (!showCreateDataTypeInput) {
                                                setNewDataTypeTagName("");
                                            }
                                        }}
                                        className="flex items-center justify-center w-6 h-6 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                                        title="Create new data type tag"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Create New Tag Input (shown when + is clicked) */}
                                {showCreateDataTypeInput && (
                                    <div className="mb-3 space-y-2">
                                        <input
                                            type="text"
                                            value={newDataTypeTagName}
                                            onChange={(e) =>
                                                setNewDataTypeTagName(
                                                    e.target.value
                                                )
                                            }
                                            placeholder="Data type tag name..."
                                            className="w-full px-3 py-2 border rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                            onKeyPress={(e) => {
                                                if (
                                                    e.key === "Enter" &&
                                                    newDataTypeTagName.trim()
                                                ) {
                                                    createDataTypeTag()
                                                        .then(() => {
                                                            setShowCreateDataTypeInput(
                                                                false
                                                            );
                                                        })
                                                        .catch(() => {
                                                            // Error already handled in createDataTypeTag
                                                        });
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    createDataTypeTag()
                                                        .then(() => {
                                                            setShowCreateDataTypeInput(
                                                                false
                                                            );
                                                        })
                                                        .catch(() => {
                                                            // Error already handled in createDataTypeTag
                                                        });
                                                }}
                                                disabled={
                                                    !newDataTypeTagName.trim() ||
                                                    tagLoading
                                                }
                                                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 transition-colors text-sm font-medium"
                                            >
                                                <Plus className="w-4 h-4 inline mr-2" />
                                                Create & Add to Selection
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowCreateDataTypeInput(
                                                        false
                                                    );
                                                    setNewDataTypeTagName("");
                                                }}
                                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Unified Search */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        type="text"
                                        value={modalSearchTerm}
                                        onChange={(e) =>
                                            setModalSearchTerm(e.target.value)
                                        }
                                        placeholder="Search all data types..."
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Combined Word Bank */}
                            {!tagLoading && (
                                <div className="mb-4">
                                    <p className="text-xs text-gray-500 mb-3">
                                        <span className="text-orange-500">
                                            ★
                                        </span>{" "}
                                        Custom tag
                                    </p>
                                    <div className="bg-gray-50 rounded-lg p-3 max-h-64 overflow-y-auto">
                                        <div className="flex flex-wrap gap-2">
                                            {(() => {
                                                // Filter available data type tags
                                                const filteredAvailableDataTypeTags =
                                                    availableDataTypeTags.filter(
                                                        (tag) =>
                                                            !modalSearchTerm ||
                                                            tag.name
                                                                .toLowerCase()
                                                                .includes(
                                                                    modalSearchTerm.toLowerCase()
                                                                )
                                                    );

                                                // Filter available NDA data types
                                                const filteredNdaDataTypes =
                                                    Array.from(
                                                        availableDataTypes
                                                    ).filter(
                                                        (dataType) =>
                                                            !modalSearchTerm ||
                                                            dataType
                                                                .toLowerCase()
                                                                .includes(
                                                                    modalSearchTerm.toLowerCase()
                                                                )
                                                    );

                                                // Combine custom tags and existing NDA data types into one unified list
                                                const combinedMap = new Map();

                                                // Add custom tags first
                                                filteredAvailableDataTypeTags.forEach(
                                                    (tag) => {
                                                        combinedMap.set(
                                                            tag.id,
                                                            {
                                                                ...tag,
                                                                isNdaDataType: false,
                                                            }
                                                        );
                                                    }
                                                );

                                                // Add NDA data types that aren't already in availableDataTypeTags (by name)
                                                filteredNdaDataTypes
                                                    .filter(
                                                        (dataType) =>
                                                            !availableDataTypeTags.some(
                                                                (tag) =>
                                                                    tag.name ===
                                                                    dataType
                                                            )
                                                    )
                                                    .forEach((dataType) => {
                                                        const ndaId = `nda-datatype-${dataType}`;
                                                        if (
                                                            !combinedMap.has(
                                                                ndaId
                                                            )
                                                        ) {
                                                            combinedMap.set(
                                                                ndaId,
                                                                {
                                                                    id: ndaId,
                                                                    name: dataType,
                                                                    isNdaDataType: true,
                                                                    tagType:
                                                                        "Data Type",
                                                                }
                                                            );
                                                        }
                                                    });

                                                const combinedAvailableDataTypes =
                                                    Array.from(
                                                        combinedMap.values()
                                                    );

                                                return combinedAvailableDataTypes.length >
                                                    0 ? (
                                                    combinedAvailableDataTypes.map(
                                                        (item, index) => {
                                                            // Check if this is a custom tag
                                                            const hasRealId =
                                                                item.id &&
                                                                !item.id.startsWith(
                                                                    "nda-datatype-"
                                                                );

                                                            // Check if the name exists in NDA data types
                                                            const isNdaDataTypeName =
                                                                availableDataTypes.has(
                                                                    item.name
                                                                );

                                                            // Custom tag = has real ID AND NOT an NDA data type name
                                                            const isCustomTag =
                                                                hasRealId &&
                                                                !isNdaDataTypeName;
                                                            const isNdaDataType =
                                                                !isCustomTag;

                                                            const isSelected =
                                                                isNdaDataType
                                                                    ? false // NDA data types can't be selected (they're just for display)
                                                                    : selectedDataTypeTags.has(
                                                                          item.id
                                                                      );

                                                            return (
                                                                <div
                                                                    key={`${item.id}-${index}`}
                                                                    className="inline-flex items-center group relative"
                                                                >
                                                                    {isCustomTag &&
                                                                    editingDataTypeTagId ===
                                                                        item.id ? (
                                                                        <input
                                                                            type="text"
                                                                            value={
                                                                                editingDataTypeTagName
                                                                            }
                                                                            onChange={(
                                                                                e
                                                                            ) =>
                                                                                setEditingDataTypeTagName(
                                                                                    e
                                                                                        .target
                                                                                        .value
                                                                                )
                                                                            }
                                                                            onBlur={() => {
                                                                                updateTag(
                                                                                    item.id,
                                                                                    editingDataTypeTagName,
                                                                                    true
                                                                                );
                                                                            }}
                                                                            onKeyDown={(
                                                                                e
                                                                            ) => {
                                                                                if (
                                                                                    e.key ===
                                                                                    "Enter"
                                                                                ) {
                                                                                    updateTag(
                                                                                        item.id,
                                                                                        editingDataTypeTagName,
                                                                                        true
                                                                                    );
                                                                                } else if (
                                                                                    e.key ===
                                                                                    "Escape"
                                                                                ) {
                                                                                    setEditingDataTypeTagId(
                                                                                        null
                                                                                    );
                                                                                }
                                                                            }}
                                                                            autoFocus
                                                                            className="px-3 py-1.5 rounded-l-full text-sm border border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                                                            onClick={(
                                                                                e
                                                                            ) =>
                                                                                e.stopPropagation()
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        <>
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (
                                                                                        !isNdaDataType
                                                                                    ) {
                                                                                        setSelectedDataTypeTags(
                                                                                            (
                                                                                                prev
                                                                                            ) => {
                                                                                                const newSet =
                                                                                                    new Set(
                                                                                                        prev
                                                                                                    );
                                                                                                if (
                                                                                                    newSet.has(
                                                                                                        item.id
                                                                                                    )
                                                                                                ) {
                                                                                                    newSet.delete(
                                                                                                        item.id
                                                                                                    );
                                                                                                } else {
                                                                                                    newSet.add(
                                                                                                        item.id
                                                                                                    );
                                                                                                }
                                                                                                return newSet;
                                                                                            }
                                                                                        );
                                                                                    }
                                                                                }}
                                                                                disabled={
                                                                                    isNdaDataType
                                                                                }
                                                                                className={`inline-flex items-center px-3 py-1.5 ${
                                                                                    isCustomTag
                                                                                        ? "rounded-l-full"
                                                                                        : "rounded-full"
                                                                                } text-sm transition-all relative ${
                                                                                    isSelected
                                                                                        ? "bg-gray-100 text-gray-700 border-2 border-gray-400"
                                                                                        : isNdaDataType
                                                                                        ? "bg-gray-50 text-gray-500 border border-gray-200 cursor-not-allowed"
                                                                                        : "bg-gray-100 text-gray-700 border border-gray-300 hover:border-gray-400 hover:bg-gray-200"
                                                                                }`}
                                                                            >
                                                                                {isCustomTag && (
                                                                                    <span className="mr-1 text-xs text-orange-500">
                                                                                        ★
                                                                                    </span>
                                                                                )}
                                                                                {
                                                                                    item.name
                                                                                }
                                                                                {item.dataStructures && (
                                                                                    <span className="ml-2 text-xs opacity-70">
                                                                                        (
                                                                                        {
                                                                                            item
                                                                                                .dataStructures
                                                                                                .length
                                                                                        }

                                                                                        )
                                                                                    </span>
                                                                                )}
                                                                            </button>
                                                                            {isCustomTag && (
                                                                                <>
                                                                                    <button
                                                                                        onClick={(
                                                                                            e
                                                                                        ) => {
                                                                                            e.stopPropagation();
                                                                                            setEditingDataTypeTagId(
                                                                                                item.id
                                                                                            );
                                                                                            setEditingDataTypeTagName(
                                                                                                item.name
                                                                                            );
                                                                                        }}
                                                                                        className={`px-2 py-1.5 text-sm transition-all border-l-0 inline-flex items-center justify-center ${
                                                                                            isSelected
                                                                                                ? "bg-gray-100 text-gray-700 border-2 border-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                                                                                : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 hover:text-gray-800 hover:border-gray-400"
                                                                                        }`}
                                                                                        title="Edit tag name"
                                                                                    >
                                                                                        <Pencil className="w-4 h-5" />
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(
                                                                                            e
                                                                                        ) => {
                                                                                            e.stopPropagation();
                                                                                            deleteTag(
                                                                                                item.id
                                                                                            );
                                                                                        }}
                                                                                        className={`px-2 py-1.5 rounded-r-full text-sm transition-all border-l-0 inline-flex items-center justify-center ${
                                                                                            isSelected
                                                                                                ? "bg-gray-100 text-gray-700 border-2 border-gray-400 hover:bg-red-50 hover:text-red-600"
                                                                                                : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-400"
                                                                                        }`}
                                                                                        title="Delete tag permanently"
                                                                                    >
                                                                                        ×
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                    )
                                                ) : (
                                                    <p className="text-gray-500 text-sm">
                                                        No data types found
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 p-5 border-t">
                            <button
                                onClick={() => {
                                    setIsDataTypesModalOpen(false);
                                    setSelectedDataTypeTags(new Set());
                                    setNewDataTypeTagName("");
                                    setModalSearchTerm("");
                                    setShowCreateDataTypeInput(false);
                                }}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        setModalLoading(true);
                                        const selectedTagIds =
                                            Array.from(selectedDataTypeTags);

                                        // Validate that at least one data type will remain after save
                                        const isDataTypeCurrentlyRemoved =
                                            isDataTypeRemoved(
                                                modalStructure.shortName
                                            );
                                        const visibleOriginalDataTypeAfterSave =
                                            modalStructure.dataType &&
                                            !isDataTypeCurrentlyRemoved
                                                ? 1
                                                : 0;
                                        const totalDataTypesAfterSave =
                                            visibleOriginalDataTypeAfterSave +
                                            selectedTagIds.length;

                                        if (totalDataTypesAfterSave < 1) {
                                            setModalError(
                                                "Cannot save: At least one data type must remain. Please add a data type before removing the last one."
                                            );
                                            setModalLoading(false);
                                            return;
                                        }

                                        const existingStructure =
                                            dataStructuresMap[
                                                modalStructure.shortName
                                            ];

                                        if (!existingStructure) {
                                            throw new Error(
                                                `Data structure "${modalStructure.shortName}" not found in backend`
                                            );
                                        }

                                        // Get current tag IDs for this structure
                                        const currentDataTypeTagIds = new Set(
                                            (
                                                structureDataTypeTags[
                                                    modalStructure.shortName
                                                ] || []
                                            ).map((t) => t.id)
                                        );

                                        // Check if anything has changed
                                        const selectedTagIdsSet = new Set(
                                            selectedTagIds
                                        );
                                        const hasChanges =
                                            selectedTagIdsSet.size !==
                                                currentDataTypeTagIds.size ||
                                            !Array.from(
                                                selectedTagIdsSet
                                            ).every((id) =>
                                                currentDataTypeTagIds.has(id)
                                            );

                                        // If nothing has changed, cancel and close modal
                                        if (!hasChanges) {
                                            setIsDataTypesModalOpen(false);
                                            setSelectedDataTypeTags(new Set());
                                            setNewDataTypeTagName("");
                                            setModalSearchTerm("");
                                            setShowCreateDataTypeInput(false);
                                            setModalLoading(false);
                                            return;
                                        }

                                        // Assign tags to structure
                                        for (const tagId of selectedTagIds) {
                                            const response = await fetch(
                                                `${apiBaseUrl}/tags/assign`,
                                                {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type":
                                                            "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        DataStructureID:
                                                            existingStructure.dataStructureId ||
                                                            existingStructure.id ||
                                                            existingStructure.DataStructureID,
                                                        TagID: tagId,
                                                    }),
                                                }
                                            );

                                            if (!response.ok) {
                                                const errorData = await response
                                                    .json()
                                                    .catch(() => ({}));
                                                throw new Error(
                                                    errorData.error ||
                                                        `Failed to assign tag ${tagId}`
                                                );
                                            }
                                        }

                                        // Get all currently assigned tags for this structure
                                        const allTagsResponse = await fetch(
                                            `${apiBaseUrl}/tags`
                                        );
                                        if (!allTagsResponse.ok) {
                                            throw new Error(
                                                "Failed to fetch all tags"
                                            );
                                        }
                                        const allTags =
                                            await allTagsResponse.json();

                                        // Find tags assigned to this structure
                                        const structureTagIds = new Set();
                                        for (const tagId of selectedTagIds) {
                                            structureTagIds.add(tagId);
                                        }

                                        // Get tag details for selected tags
                                        const assignedTags = allTags.filter(
                                            (tag) => structureTagIds.has(tag.id)
                                        );

                                        // Update structure tags state
                                        setStructureDataTypeTags((prev) => ({
                                            ...prev,
                                            [modalStructure.shortName]:
                                                assignedTags,
                                        }));

                                        setModifiedDataTypes((prev) => ({
                                            ...prev,
                                            [modalStructure.shortName]: true,
                                        }));

                                        setIsDataTypesModalOpen(false);
                                        setSelectedDataTypeTags(new Set());
                                        setNewDataTypeTagName("");
                                        setModalSearchTerm("");
                                        setShowCreateDataTypeInput(false);
                                    } catch (err) {
                                        console.error(
                                            "Error saving data type tags:",
                                            err
                                        );
                                        setModalError(
                                            "Failed to save data type tags: " +
                                                err.message
                                        );
                                    } finally {
                                        setModalLoading(false);
                                    }
                                }}
                                disabled={modalLoading}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
                            >
                                {modalLoading ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataCategorySearch;

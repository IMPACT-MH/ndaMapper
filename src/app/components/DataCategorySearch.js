"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import AuditTrail from "./AuditTrail";
import {
    fetchTags as apiFetchTags,
    createTag as apiCreateTag,
    updateTag as apiUpdateTag,
    deleteTag as apiDeleteTag,
    assignTag as apiAssignTag,
    fetchTagDataStructures,
    logAuditEvent,
    fetchAuditLogs,
} from "@/utils/api";

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
    // Initialize groupBy from localStorage or default to "dataType"
    const [groupBy, setGroupBy] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("dataCategoryGroupBy");
            return saved === "category" || saved === "dataType"
                ? saved
                : "dataType";
        }
        return "dataType";
    });
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
    const [categoriesModalTab, setCategoriesModalTab] = useState("tags"); // "tags" or "audit"
    const [dataTypesModalTab, setDataTypesModalTab] = useState("tags"); // "tags" or "audit"
    const [modalSearchTerm, setModalSearchTerm] = useState("");
    const [modalError, setModalError] = useState(null);
    const [categoryError, setCategoryError] = useState(null);
    const [dataTypeError, setDataTypeError] = useState(null);
    const [matchedCategoryItem, setMatchedCategoryItem] = useState(null);
    const [matchedDataTypeItem, setMatchedDataTypeItem] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);

    // Delete confirmation modal state
    const [deleteConfirmModal, setDeleteConfirmModal] = useState({
        isOpen: false,
        type: null, // 'tag', 'category', 'dataType'
        itemName: null,
        itemId: null,
        structureShortName: null,
        structureCount: 0, // Number of structures this item is attached to
        onConfirm: null,
    });

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

    // Helper function to check for plural/singular variations
    const getPluralSingularVariations = useCallback((word) => {
        const lower = word.toLowerCase().trim();
        const variations = new Set([lower]);

        // Common pluralization rules
        if (lower.endsWith("y") && lower.length > 1) {
            // category -> categories, story -> stories
            variations.add(lower.slice(0, -1) + "ies");
            variations.add(lower + "s");
        } else if (lower.endsWith("s")) {
            // categories -> category, paranoias -> paranoia
            if (lower.endsWith("ies")) {
                variations.add(lower.slice(0, -3) + "y");
            } else if (lower.endsWith("es") && lower.length > 2) {
                // Remove 'es' (e.g., boxes -> box, but keep 's' for words like 'yes')
                variations.add(lower.slice(0, -2));
                variations.add(lower.slice(0, -1)); // Also try removing just 's'
            } else {
                variations.add(lower.slice(0, -1)); // Remove 's' (e.g., paranoias -> paranoia)
            }
        } else if (lower.endsWith("ies")) {
            // categories -> category
            variations.add(lower.slice(0, -3) + "y");
        } else {
            // Add 's' and 'es' variations (e.g., paranoia -> paranoias)
            variations.add(lower + "s");
            if (!lower.endsWith("e")) {
                variations.add(lower + "es");
            }
        }

        return Array.from(variations);
    }, []);

    // Helper function to check if a name matches (including plural/singular variations)
    const hasNameMatch = useCallback(
        (searchName, items) => {
            const searchLower = searchName.toLowerCase().trim();
            const searchVariations = getPluralSingularVariations(searchName);

            return items.some((item) => {
                const itemLower = item.name.toLowerCase().trim();
                // Check exact match
                if (itemLower === searchLower) return true;

                // Check if search variations match the item
                if (
                    searchVariations.some(
                        (variation) => variation === itemLower
                    )
                )
                    return true;

                // Also check if item variations match the search term (bidirectional)
                const itemVariations = getPluralSingularVariations(item.name);
                return itemVariations.some(
                    (variation) => variation === searchLower
                );
            });
        },
        [getPluralSingularVariations]
    );

    // Helper function to find the existing item name that matches (including plural/singular variations)
    const findExistingItemName = useCallback(
        (searchName, items) => {
            const searchLower = searchName.toLowerCase().trim();
            const searchVariations = getPluralSingularVariations(searchName);

            return items.find((item) => {
                const itemLower = item.name.toLowerCase().trim();
                // Check exact match
                if (itemLower === searchLower) return true;

                // Check if search variations match the item
                if (
                    searchVariations.some(
                        (variation) => variation === itemLower
                    )
                )
                    return true;

                // Also check if item variations match the search term (bidirectional)
                const itemVariations = getPluralSingularVariations(item.name);
                return itemVariations.some(
                    (variation) => variation === searchLower
                );
            });
        },
        [getPluralSingularVariations]
    );

    // Helper function for case-insensitive search matching
    const matchesSearchTerm = useCallback((text, searchTerm) => {
        if (!searchTerm) return true;
        return text.toLowerCase().includes(searchTerm.toLowerCase());
    }, []);

    // Generic helper to combine tags and NDA items
    const combineTagsAndNdaItems = useCallback(
        (
            tags,
            ndaItems,
            searchTerm,
            ndaIdPrefix,
            ndaItemKey,
            tagNameKey = "name",
            additionalProps = {}
        ) => {
            const combinedMap = new Map();

            // Add tags that match search term
            tags.filter((tag) =>
                matchesSearchTerm(tag[tagNameKey], searchTerm)
            ).forEach((tag) => {
                combinedMap.set(tag.id, tag);
            });

            // Add NDA items that match search term and aren't already in tags
            Array.from(ndaItems)
                .filter((item) => matchesSearchTerm(item, searchTerm))
                .filter((item) => !tags.some((tag) => tag[tagNameKey] === item))
                .forEach((item) => {
                    const ndaId = `${ndaIdPrefix}-${item}`;
                    if (!combinedMap.has(ndaId)) {
                        combinedMap.set(ndaId, {
                            id: ndaId,
                            name: item,
                            [ndaItemKey]: true,
                            ...additionalProps,
                        });
                    }
                });

            return Array.from(combinedMap.values());
        },
        [matchesSearchTerm]
    );

    // Helper function to add matched item to filtered list if not already present
    const addMatchedItemIfNeeded = useCallback((filtered, matchedItem) => {
        if (!matchedItem) return filtered;
        const alreadyInList = filtered.some(
            (item) =>
                item.id === matchedItem.id || item.name === matchedItem.name
        );
        return alreadyInList ? filtered : [matchedItem, ...filtered];
    }, []);

    // Helper function to compute filtered and combined categories for modal search
    const computeFilteredCombinedCategories = useCallback(
        (searchTerm) => {
            // Filter category tags (exclude data type tags)
            const categoryTags = availableTags
                .filter(
                    (tag) =>
                        tag &&
                        tag.id &&
                        (!tag.tagType || tag.tagType !== "Data Type")
                )
                .map((tag) => ({
                    ...tag,
                    isNdaCategory: false,
                }));

            return combineTagsAndNdaItems(
                categoryTags,
                availableCategories,
                searchTerm,
                "nda-category",
                "isNdaCategory",
                "name",
                { tagType: "Category" }
            );
        },
        [availableTags, availableCategories, combineTagsAndNdaItems]
    );

    // Use the same function for both display and duplicate checking
    // This ensures consistency and eliminates the redundant memoized value
    // Also include matched item if there's a plural/singular match
    const combinedAvailableCategories = useMemo(() => {
        const filtered = computeFilteredCombinedCategories(modalSearchTerm);
        return addMatchedItemIfNeeded(filtered, matchedCategoryItem);
    }, [
        computeFilteredCombinedCategories,
        modalSearchTerm,
        matchedCategoryItem,
        addMatchedItemIfNeeded,
    ]);

    // Helper function to compute filtered and combined data types for modal search
    const computeFilteredCombinedDataTypes = useCallback(
        (searchTerm) => {
            return combineTagsAndNdaItems(
                availableDataTypeTags,
                availableDataTypes,
                searchTerm,
                "nda-datatype",
                "isNdaDataType"
            );
        },
        [availableDataTypeTags, availableDataTypes, combineTagsAndNdaItems]
    );

    // Use the same function for both display and duplicate checking
    // Also include matched item if there's a plural/singular match
    const combinedAvailableDataTypes = useMemo(() => {
        const filtered = computeFilteredCombinedDataTypes(modalSearchTerm);
        return addMatchedItemIfNeeded(filtered, matchedDataTypeItem);
    }, [
        computeFilteredCombinedDataTypes,
        modalSearchTerm,
        matchedDataTypeItem,
        addMatchedItemIfNeeded,
    ]);

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
                if (!response.ok) {
                    console.error(
                        `Failed to fetch removed items: ${response.status} ${response.statusText}`
                    );
                    return;
                }

                let allTags;
                try {
                    allTags = await response.json();
                } catch (err) {
                    console.error("Failed to parse removed items JSON:", err);
                    return;
                }

                if (!Array.isArray(allTags)) {
                    console.warn(
                        "Expected array for tags, got:",
                        typeof allTags
                    );
                    return;
                }
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
                if (!response.ok) {
                    console.error(
                        `Failed to fetch tags: ${response.status} ${response.statusText}`
                    );
                    return;
                }

                let data;
                try {
                    data = await response.json();
                } catch (err) {
                    console.error("Failed to parse tags JSON:", err);
                    return;
                }

                if (!Array.isArray(data)) {
                    console.warn("Expected array for tags, got:", typeof data);
                    return;
                }

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
            const allTags = await apiFetchTags(apiBaseUrl);

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
                            const dataStructures = await fetchTagDataStructures(
                                tag.id,
                                apiBaseUrl
                            );
                            return {
                                ...tag,
                                dataStructures: dataStructures,
                            };
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
        // Check if this is a custom tag (not an NDA category)
        const isCustomTag = availableTags.some(
            (tag) => tag.name === categoryName
        );
        // Only show confirmation modal for custom tags
        if (isCustomTag) {
            // Count how many structures have this category
            let structureCount = 0;
            (Array.isArray(allStructures)
                ? allStructures
                : Object.values(allStructures)
            ).forEach((structure) => {
                if (
                    structure.categories &&
                    structure.categories.includes(categoryName)
                ) {
                    structureCount++;
                }
            });

            // Show confirmation modal
            setDeleteConfirmModal({
                isOpen: true,
                type: "category",
                itemName: categoryName,
                itemId: null,
                structureShortName: structureShortName,
                structureCount: structureCount,
                onConfirm: async () => {
                    try {
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
                                const createResponse = await fetch(
                                    `${apiBaseUrl}/tags`,
                                    {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                            name: tagName,
                                            tagType: "Removed Category",
                                            description: `Removed category ${categoryName} from structure ${structureShortName}`,
                                        }),
                                    }
                                );

                                if (createResponse.ok) {
                                    const newTag = await createResponse.json();
                                    // Assign tag to the structure
                                    await apiAssignTag(
                                        newTag.id,
                                        structureShortName,
                                        apiBaseUrl
                                    );
                                }
                            }
                        }

                        // Close modal on success
                        setDeleteConfirmModal({
                            isOpen: false,
                            type: null,
                            itemName: null,
                            itemId: null,
                            structureShortName: null,
                            structureCount: 0,
                            onConfirm: null,
                        });
                    } catch (err) {
                        console.error("Error removing category:", err);
                        setModalError(
                            `Failed to remove category: ${err.message}`
                        );
                    }
                },
            });
            return; // Exit early for custom tags
        }

        // For NDA categories, remove directly without confirmation
        try {
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
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            name: tagName,
                            tagType: "Removed Category",
                            description: `Removed category ${categoryName} from structure ${structureShortName}`,
                        }),
                    });

                    if (createResponse.ok) {
                        const newTag = await createResponse.json();
                        // Assign tag to the structure
                        await apiAssignTag(
                            newTag.id,
                            structureShortName,
                            apiBaseUrl
                        );
                    }
                }
            }
        } catch (err) {
            console.error("Error removing category:", err);
            setModalError(`Failed to remove category: ${err.message}`);
        }
    };

    const isCategoryRemoved = (structureShortName, categoryName) => {
        return (
            removedOriginalCategories[structureShortName]?.has(categoryName) ||
            false
        );
    };

    const removeOriginalDataType = async (structureShortName) => {
        // Get the data type name from the structure
        const dataTypeName =
            dataStructuresMap[structureShortName]?.dataType || "this data type";

        // Check if this is a custom tag (not an NDA data type)
        const isCustomTag = availableDataTypeTags.some(
            (tag) => tag.name === dataTypeName
        );
        // Only show confirmation modal for custom tags
        if (isCustomTag) {
            // Count how many structures have this data type
            let structureCount = 0;
            (Array.isArray(allStructures)
                ? allStructures
                : Object.values(allStructures)
            ).forEach((structure) => {
                if (structure.dataType === dataTypeName) {
                    structureCount++;
                }
            });

            // Show confirmation modal
            setDeleteConfirmModal({
                isOpen: true,
                type: "dataType",
                itemName: dataTypeName,
                itemId: null,
                structureShortName: structureShortName,
                structureCount: structureCount,
                onConfirm: async () => {
                    try {
                        // Update local state immediately
                        setRemovedOriginalDataTypes((prev) => {
                            const updated = { ...prev };
                            updated[structureShortName] = true;
                            return updated;
                        });

                        // Save to backend using tags API
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
                                const createResponse = await fetch(
                                    `${apiBaseUrl}/tags`,
                                    {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                            name: tagName,
                                            tagType: "Removed Data Type",
                                            description: `Removed data type from structure ${structureShortName}`,
                                        }),
                                    }
                                );

                                if (createResponse.ok) {
                                    const newTag = await createResponse.json();
                                    // Assign tag to the structure
                                    await apiAssignTag(
                                        newTag.id,
                                        structureShortName,
                                        apiBaseUrl
                                    );
                                }
                            }
                        }

                        // Close modal on success
                        setDeleteConfirmModal({
                            isOpen: false,
                            type: null,
                            itemName: null,
                            itemId: null,
                            structureShortName: null,
                            structureCount: 0,
                            onConfirm: null,
                        });
                    } catch (err) {
                        console.error("Error removing data type:", err);
                        setModalError(
                            `Failed to remove data type: ${err.message}`
                        );
                    }
                },
            });
            return; // Exit early for custom tags
        }

        // For NDA data types, remove directly without confirmation
        try {
            // Update local state immediately
            setRemovedOriginalDataTypes((prev) => {
                const updated = { ...prev };
                updated[structureShortName] = true;
                return updated;
            });

            // Save to backend using tags API
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
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            name: tagName,
                            tagType: "Removed Data Type",
                            description: `Removed data type from structure ${structureShortName}`,
                        }),
                    });

                    if (createResponse.ok) {
                        const newTag = await createResponse.json();
                        // Assign tag to the structure
                        await apiAssignTag(
                            newTag.id,
                            structureShortName,
                            apiBaseUrl
                        );
                    }
                }
            }
        } catch (err) {
            console.error("Error removing data type:", err);
            setModalError(`Failed to remove data type: ${err.message}`);
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
            const allTags = await apiFetchTags(apiBaseUrl);
            const categoryTags = allTags.filter(
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
            setModalError(err.message || "Failed to load tags");
        } finally {
            setTagLoading(false);
        }
    };

    const fetchDataTypeTags = async () => {
        setTagLoading(true);
        try {
            const allTags = await apiFetchTags(apiBaseUrl);
            const dataTypeTags = allTags.filter(
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
            setModalError(err.message || "Failed to load data type tags");
        } finally {
            setTagLoading(false);
        }
    };

    const createTag = async (tagNameOverride = null) => {
        // Use override if provided, otherwise use newTagName state
        const nameToUse =
            tagNameOverride !== null ? tagNameOverride : newTagName;
        // Allow spaces, only check that it's not empty after trimming whitespace
        const trimmedName = nameToUse.trim();
        if (!trimmedName) return;

        try {
            // Check for duplicate (including plural/singular variations) before creating
            const allAvailableCategories =
                computeFilteredCombinedCategories("");
            const hasMatch = hasNameMatch(trimmedName, allAvailableCategories);

            if (hasMatch) {
                const existingItem = findExistingItemName(
                    trimmedName,
                    allAvailableCategories
                );
                const existingName = existingItem?.name || trimmedName;
                const errorMessage = `"${trimmedName}" already exists as "${existingName}". Please select it from the list below:`;
                setCategoryError(errorMessage);
                // Store the matched item so it appears in the list even if it doesn't match the search term
                setMatchedCategoryItem(existingItem);
                // Return early instead of throwing to gracefully handle the error
                return null;
            }

            // Preserve the name as-is (spaces allowed, only trimmed for validation)
            const newTag = await apiCreateTag(
                nameToUse, // Keep original with spaces
                "Category",
                apiBaseUrl
            );

            // Log audit event
            await logAuditEvent(
                {
                    action: "create",
                    tagId: newTag.id,
                    tagName: newTag.name,
                    tagType: "Category",
                    newValue: newTag.name,
                },
                apiBaseUrl
            );

            setAvailableTags((prev) => [...prev, newTag]);
            setSelectedSocialTags((prev) => new Set([...prev, newTag.id]));

            // Note: Do NOT add custom tags to availableCategories
            // availableCategories should only contain NDA categories from the API
            // Custom tags are tracked separately in availableTags

            setNewTagName("");
            setCategoryError(null); // Clear any previous errors

            return newTag;
        } catch (err) {
            console.error("Error creating tag:", err);
            // Set error message below search bar
            const errorMessage = err.message || "Failed to create category tag";
            setCategoryError(errorMessage);
            // Don't throw - gracefully handle the error
            return null;
        }
    };

    const createDataTypeTag = async (tagNameOverride = null) => {
        // Use override if provided, otherwise use newDataTypeTagName state
        const nameToUse =
            tagNameOverride !== null ? tagNameOverride : newDataTypeTagName;
        // Allow spaces, only check that it's not empty after trimming whitespace
        const trimmedName = nameToUse.trim();
        if (!trimmedName) return;

        try {
            // Check for duplicate (including plural/singular variations) before creating
            const allAvailableDataTypes = computeFilteredCombinedDataTypes("");
            const hasMatch = hasNameMatch(trimmedName, allAvailableDataTypes);

            if (hasMatch) {
                const existingItem = findExistingItemName(
                    trimmedName,
                    allAvailableDataTypes
                );
                const existingName = existingItem?.name || trimmedName;
                const errorMessage = `"${trimmedName}" already exists as "${existingName}". Please select it from the list below:`;
                setDataTypeError(errorMessage);
                // Store the matched item so it appears in the list even if it doesn't match the search term
                setMatchedDataTypeItem(existingItem);
                // Return early instead of throwing to gracefully handle the error
                return null;
            }

            // Preserve the name as-is (spaces allowed, only trimmed for validation)
            const newTag = await apiCreateTag(
                nameToUse, // Keep original with spaces
                "Data Type",
                apiBaseUrl
            );

            // Log audit event
            await logAuditEvent(
                {
                    action: "create",
                    tagId: newTag.id,
                    tagName: newTag.name,
                    tagType: "Data Type",
                    newValue: newTag.name,
                },
                apiBaseUrl
            );

            // Update available tags
            setAvailableDataTypeTags((prev) => [...prev, newTag]);

            // Add to selected
            setSelectedDataTypeTags((prev) => new Set([newTag.id])); // Only one data type can be selected

            // Note: Do NOT add custom tags to availableDataTypes
            // availableDataTypes should only contain NDA data types from the API
            // Custom tags are tracked separately in availableDataTypeTags

            // Clear input
            setNewDataTypeTagName("");
            setDataTypeError(null); // Clear any previous errors

            return newTag;
        } catch (err) {
            console.error("Error creating data type tag:", err);
            // Set error message below search bar
            const errorMessage =
                err.message || "Failed to create data type tag";
            setDataTypeError(errorMessage);
            // Don't throw - gracefully handle the error
            return null;
        }
    };

    const updateTag = async (tagId, newName, isDataType = false) => {
        if (!newName.trim()) {
            setEditingCategoryTagId(null);
            setEditingDataTypeTagId(null);
            return;
        }

        try {
            // Find old tag name before updating
            let oldName;
            let oldTag;
            if (isDataType) {
                oldTag = availableDataTypeTags.find((t) => t.id === tagId);
                oldName = oldTag?.name;
            } else {
                oldTag = availableTags.find((t) => t.id === tagId);
                oldName = oldTag?.name;
            }

            const updatedTag = await apiUpdateTag(tagId, newName, apiBaseUrl);
            const updatedName = updatedTag.name;

            // Log audit event
            await logAuditEvent(
                {
                    action: "update",
                    tagId: tagId,
                    tagName: updatedName,
                    tagType: isDataType ? "Data Type" : "Category",
                    oldValue: oldName,
                    newValue: updatedName,
                },
                apiBaseUrl
            );

            if (isDataType) {
                setAvailableDataTypeTags((prev) =>
                    prev.map((t) => (t.id === tagId ? updatedTag : t))
                );

                // Note: Do NOT update availableDataTypes for custom tags
                // availableDataTypes should only contain NDA data types from the API
                // Custom tags are tracked separately in availableDataTypeTags

                setEditingDataTypeTagId(null);
            } else {
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
        // Find the tag to get its name
        const categoryTag = availableTags.find((t) => t.id === tagId);
        const dataTypeTag = availableDataTypeTags.find((t) => t.id === tagId);
        const tagToDelete = categoryTag || dataTypeTag;
        const tagName = tagToDelete?.name || "this tag";
        const tagType = categoryTag ? "Category" : "Data Type";

        // Count how many structures have this tag
        let structureCount = 0;
        if (categoryTag) {
            // Count in structureTags
            Object.values(structureTags).forEach((tags) => {
                if (tags.some((t) => t.id === tagId)) {
                    structureCount++;
                }
            });
        } else if (dataTypeTag) {
            // Count in structureDataTypeTags
            Object.values(structureDataTypeTags).forEach((tags) => {
                if (tags.some((t) => t.id === tagId)) {
                    structureCount++;
                }
            });
        }

        // Show confirmation modal
        setDeleteConfirmModal({
            isOpen: true,
            type: "tag",
            itemName: tagName,
            itemId: tagId,
            structureShortName: null,
            structureCount: structureCount,
            onConfirm: async () => {
                try {
                    // Find the tag to determine its type and name before removing
                    const categoryTag = availableTags.find(
                        (t) => t.id === tagId
                    );
                    const dataTypeTag = availableDataTypeTags.find(
                        (t) => t.id === tagId
                    );
                    const tagToDelete = categoryTag || dataTypeTag;
                    const isDataType = !!dataTypeTag;
                    const tagNameToLog = tagToDelete?.name || "unknown";
                    const tagTypeToLog = isDataType ? "Data Type" : "Category";

                    await apiDeleteTag(tagId, apiBaseUrl);

                    // Log audit event
                    await logAuditEvent(
                        {
                            action: "delete",
                            tagId: tagId,
                            tagName: tagNameToLog,
                            tagType: tagTypeToLog,
                            oldValue: tagNameToLog,
                        },
                        apiBaseUrl
                    );

                    // Remove from available tags lists
                    setAvailableTags((prev) =>
                        prev.filter((t) => t.id !== tagId)
                    );
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
                            updated[key] = prev[key].filter(
                                (t) => t.id !== tagId
                            );
                        });
                        return updated;
                    });

                    setStructureDataTypeTags((prev) => {
                        const updated = {};
                        Object.keys(prev).forEach((key) => {
                            updated[key] = prev[key].filter(
                                (t) => t.id !== tagId
                            );
                        });
                        return updated;
                    });

                    // Close modal on success
                    setDeleteConfirmModal({
                        isOpen: false,
                        type: null,
                        itemName: null,
                        itemId: null,
                        structureShortName: null,
                        structureCount: 0,
                        onConfirm: null,
                    });
                } catch (err) {
                    console.error("Error deleting tag:", err);
                    setModalError(`Failed to delete tag: ${err.message}`);
                    // Keep modal open on error so user can see the error
                }
            },
        });
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
                            onChange={(e) => {
                                const newValue = e.target.value;
                                setGroupBy(newValue);
                                // Save to localStorage
                                if (typeof window !== "undefined") {
                                    localStorage.setItem(
                                        "dataCategoryGroupBy",
                                        newValue
                                    );
                                }
                            }}
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
                    onClick={() => {
                        setIsCategoriesModalOpen(false);
                        setModalSearchTerm("");
                        setCategoryError(null);
                    }}
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
                                onClick={() => {
                                    setIsCategoriesModalOpen(false);
                                    setModalSearchTerm("");
                                    setCategoryError(null);
                                    setMatchedCategoryItem(null);
                                    setCategoriesModalTab("tags");
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tab Navigation */}
                        <div className="flex border-b">
                            <button
                                onClick={() => setCategoriesModalTab("tags")}
                                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                    categoriesModalTab === "tags"
                                        ? "border-b-2 border-blue-500 text-blue-600"
                                        : "text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                Tags
                            </button>
                            <button
                                onClick={() => setCategoriesModalTab("audit")}
                                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                    categoriesModalTab === "audit"
                                        ? "border-b-2 border-blue-500 text-blue-600"
                                        : "text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                Audit Trail
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {categoriesModalTab === "audit" ? (
                                <AuditTrail
                                    structureShortName={
                                        modalStructure?.shortName
                                    }
                                    tagTypeFilter="Category"
                                    apiBaseUrl={apiBaseUrl}
                                />
                            ) : (
                                <>
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
                                        modalStructure.categories.length >
                                            0 && (
                                            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                                                <h3 className="text-sm font-semibold text-blue-700 mb-2">
                                                    Original NDA Categories
                                                </h3>
                                                <p className="text-xs text-blue-600 mb-3">
                                                    Toggle visibility of
                                                    original categories
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
                                                                                e
                                                                                    .target
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
                                                        const tag =
                                                            availableTags.find(
                                                                (t) =>
                                                                    t.id ===
                                                                    tagId
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
                                                {Array.from(
                                                    selectedSocialTags
                                                ).map((tagId, index) => {
                                                    const tag =
                                                        availableTags.find(
                                                            (t) =>
                                                                t.id === tagId
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
                                                            <span>
                                                                {tag.name}
                                                            </span>
                                                            <button
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    setSelectedSocialTags(
                                                                        (
                                                                            prev
                                                                        ) => {
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
                                                })}
                                                {/* Show selected NDA categories */}
                                                {Array.from(
                                                    selectedNdaCategories
                                                ).map((categoryName) => {
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
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    e.preventDefault();
                                                                    // Remove from NDA categories selection
                                                                    setSelectedNdaCategories(
                                                                        (
                                                                            prev
                                                                        ) => {
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
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Categories Header */}
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-gray-700">
                                                Categories
                                            </h3>
                                        </div>

                                        {/* Create New Tag Input (shown when + is clicked or search has no results) */}
                                        {(showCreateCategoryInput ||
                                            combinedAvailableCategories.length ===
                                                0) &&
                                            modalSearchTerm.trim() && (
                                                <div className="mb-3 animate-[fadeIn_0.2s_ease-out]">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={
                                                                modalSearchTerm
                                                            }
                                                            onChange={(e) => {
                                                                setModalSearchTerm(
                                                                    e.target
                                                                        .value
                                                                );
                                                            }}
                                                            placeholder="Category tag name..."
                                                            className="flex-1 px-3 py-2 border rounded-l-lg focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none text-sm transition-all"
                                                            onKeyPress={async (
                                                                e
                                                            ) => {
                                                                const tagName =
                                                                    modalSearchTerm.trim();
                                                                if (
                                                                    e.key ===
                                                                        "Enter" &&
                                                                    tagName
                                                                ) {
                                                                    // Pass tagName directly to createTag to avoid async state issues
                                                                    const result =
                                                                        await createTag(
                                                                            tagName
                                                                        );
                                                                    // Only close input and clear search if tag was created successfully
                                                                    if (
                                                                        result
                                                                    ) {
                                                                        setShowCreateCategoryInput(
                                                                            false
                                                                        );
                                                                        setModalSearchTerm(
                                                                            ""
                                                                        );
                                                                    }
                                                                    // Error is already displayed below search bar by createTag
                                                                } else if (
                                                                    e.key ===
                                                                    "Escape"
                                                                ) {
                                                                    setModalSearchTerm(
                                                                        ""
                                                                    );
                                                                    setShowCreateCategoryInput(
                                                                        false
                                                                    );
                                                                }
                                                            }}
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={async () => {
                                                                const tagName =
                                                                    modalSearchTerm.trim();
                                                                if (tagName) {
                                                                    // Pass tagName directly to createTag to avoid async state issues
                                                                    const result =
                                                                        await createTag(
                                                                            tagName
                                                                        );
                                                                    // Only close input and clear search if tag was created successfully
                                                                    if (
                                                                        result
                                                                    ) {
                                                                        setShowCreateCategoryInput(
                                                                            false
                                                                        );
                                                                        setModalSearchTerm(
                                                                            ""
                                                                        );
                                                                    }
                                                                    // Error is already displayed below search bar by createTag
                                                                }
                                                            }}
                                                            disabled={
                                                                !modalSearchTerm.trim() ||
                                                                tagLoading
                                                            }
                                                            className="px-4 py-2 bg-green-500 text-white rounded-r-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium text-sm flex items-center gap-2"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                        {/* Unified Search with + button on right - Hide when input is shown */}
                                        {(() => {
                                            const filteredCategories =
                                                computeFilteredCombinedCategories(
                                                    modalSearchTerm
                                                );
                                            return !(
                                                showCreateCategoryInput ||
                                                (filteredCategories.length ===
                                                    0 &&
                                                    modalSearchTerm.trim())
                                            );
                                        })() && (
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                                <input
                                                    type="text"
                                                    value={modalSearchTerm}
                                                    onChange={(e) => {
                                                        setModalSearchTerm(
                                                            e.target.value
                                                        );
                                                        // Clear error when user starts typing
                                                        if (categoryError) {
                                                            setCategoryError(
                                                                null
                                                            );
                                                        }
                                                    }}
                                                    placeholder="Search all categories..."
                                                    className="w-full pl-10 pr-12 py-2 border rounded-lg focus:border-blue-500 focus:outline-none"
                                                />
                                                {/* + button on the right side of search box */}
                                                {modalSearchTerm.trim() && (
                                                    <button
                                                        onClick={() => {
                                                            // Compute all available categories (not filtered) for duplicate checking
                                                            // Use empty string to get all categories, exactly like data types modal
                                                            const allAvailableCategories =
                                                                computeFilteredCombinedCategories(
                                                                    ""
                                                                );
                                                            // Check against ALL categories, not just filtered ones
                                                            // This ensures we catch plural/singular matches even if they don't match the search filter
                                                            const hasMatch =
                                                                hasNameMatch(
                                                                    modalSearchTerm,
                                                                    allAvailableCategories
                                                                );

                                                            if (!hasMatch) {
                                                                // No match, show input to create
                                                                setNewTagName(
                                                                    modalSearchTerm.trim()
                                                                );
                                                                setShowCreateCategoryInput(
                                                                    true
                                                                );
                                                                setCategoryError(
                                                                    null
                                                                );
                                                                setMatchedCategoryItem(
                                                                    null
                                                                );
                                                            } else {
                                                                // Match exists (exact or plural/singular), find the existing name
                                                                const existingItem =
                                                                    findExistingItemName(
                                                                        modalSearchTerm,
                                                                        allAvailableCategories
                                                                    );

                                                                const existingName =
                                                                    existingItem?.name ||
                                                                    modalSearchTerm.trim();
                                                                setCategoryError(
                                                                    `"${modalSearchTerm.trim()}" already exists as "${existingName}". Please select it from the list below:`
                                                                );
                                                                // Store the matched item so it appears in the list even if it doesn't match the search term
                                                                setMatchedCategoryItem(
                                                                    existingItem
                                                                );
                                                            }
                                                        }}
                                                        className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center justify-center w-6 h-6 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:scale-110 active:scale-95"
                                                        title="Create new category tag"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Error message for existing category - always visible below search/create input */}
                                        {categoryError && (
                                            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-[fadeIn_0.2s_ease-out]">
                                                {categoryError}
                                            </div>
                                        )}
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
                                                    0
                                                        ? combinedAvailableCategories.map(
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
                                                        : null}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-3 p-5 border-t">
                                        <button
                                            onClick={() => {
                                                setIsCategoriesModalOpen(false);
                                                setSelectedSocialTags(
                                                    new Set()
                                                );
                                                setSelectedNdaCategories(
                                                    new Set()
                                                );
                                                setNewTagName("");
                                                setModalSearchTerm("");
                                                setNdaCategorySearchTerm("");
                                                setShowCreateCategoryInput(
                                                    false
                                                );
                                                setCategoryError(null);
                                                setMatchedCategoryItem(null);
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
                                                    const ndaCategoryTagIds =
                                                        [];

                                                    // Fetch all tags to check for existing ones
                                                    const allTagsResponse =
                                                        await fetch(
                                                            `${apiBaseUrl}/tags`
                                                        );
                                                    let allTags = [];
                                                    if (allTagsResponse.ok) {
                                                        allTags =
                                                            await allTagsResponse.json();
                                                    }

                                                    for (const categoryName of selectedNdaCategories) {
                                                        // Check if tag already exists (check all tags, not just availableTags)
                                                        let existingTag =
                                                            allTags.find(
                                                                (tag) =>
                                                                    tag.name ===
                                                                        categoryName &&
                                                                    (tag.tagType ===
                                                                        "Category" ||
                                                                        !tag.tagType ||
                                                                        tag.tagType ===
                                                                            "")
                                                            );

                                                        if (!existingTag) {
                                                            // Create tag for this NDA category
                                                            const createResponse =
                                                                await fetch(
                                                                    `${apiBaseUrl}/tags`,
                                                                    {
                                                                        method: "POST",
                                                                        headers:
                                                                            {
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

                                                            if (
                                                                createResponse.ok
                                                            ) {
                                                                existingTag =
                                                                    await createResponse.json();
                                                                // Add to available tags and refresh
                                                                setAvailableTags(
                                                                    (prev) => [
                                                                        ...prev,
                                                                        existingTag,
                                                                    ]
                                                                );
                                                                allTags.push(
                                                                    existingTag
                                                                );
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
                                                                setAvailableTags(
                                                                    (prev) => [
                                                                        ...prev,
                                                                        existingTag,
                                                                    ]
                                                                );
                                                            }
                                                        }

                                                        if (
                                                            existingTag &&
                                                            existingTag.id
                                                        ) {
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
                                                    // Remove duplicates by using a Set
                                                    // Ensure selectedSocialTags is converted to array (it's a Set)
                                                    const selectedSocialTagsArray =
                                                        selectedSocialTags instanceof
                                                        Set
                                                            ? Array.from(
                                                                  selectedSocialTags
                                                              )
                                                            : selectedSocialTags;
                                                    const selectedTagIds =
                                                        Array.from(
                                                            new Set([
                                                                ...selectedSocialTagsArray,
                                                                ...ndaCategoryTagIds,
                                                            ])
                                                        );

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

                                                    if (
                                                        totalCategoriesAfterSave <
                                                        1
                                                    ) {
                                                        setModalError(
                                                            "Cannot save: At least one category must remain. Please add a category before removing the last one."
                                                        );
                                                        setModalLoading(false);
                                                        return;
                                                    }

                                                    const existingStructure =
                                                        dataStructuresMap[
                                                            modalStructure
                                                                .shortName
                                                        ];

                                                    if (!existingStructure) {
                                                        throw new Error(
                                                            `Data structure "${modalStructure.shortName}" not found in backend`
                                                        );
                                                    }

                                                    // Get current tag IDs for this structure
                                                    const currentTagIds =
                                                        new Set(
                                                            (
                                                                structureTags[
                                                                    modalStructure
                                                                        .shortName
                                                                ] || []
                                                            ).map((t) => t.id)
                                                        );

                                                    // Find tags to add and remove
                                                    const toAdd =
                                                        selectedTagIds.filter(
                                                            (id) =>
                                                                !currentTagIds.has(
                                                                    id
                                                                )
                                                        );
                                                    const toRemove = Array.from(
                                                        currentTagIds
                                                    ).filter(
                                                        (id) =>
                                                            !selectedTagIds.includes(
                                                                id
                                                            )
                                                    );

                                                    // If nothing has changed, cancel and close modal
                                                    if (
                                                        toAdd.length === 0 &&
                                                        toRemove.length === 0
                                                    ) {
                                                        setIsCategoriesModalOpen(
                                                            false
                                                        );
                                                        setSelectedSocialTags(
                                                            new Set()
                                                        );
                                                        setSelectedNdaCategories(
                                                            new Set()
                                                        );
                                                        setNewTagName("");
                                                        setModalSearchTerm("");
                                                        setNdaCategorySearchTerm(
                                                            ""
                                                        );
                                                        setCategoryError(null);
                                                        setMatchedCategoryItem(
                                                            null
                                                        );
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
                                                        const response =
                                                            await fetch(
                                                                `/api/spinup/tags/remove`,
                                                                {
                                                                    method: "POST",
                                                                    headers: {
                                                                        "Content-Type":
                                                                            "application/json",
                                                                    },
                                                                    body: JSON.stringify(
                                                                        {
                                                                            tagId: tagId,
                                                                            DataStructureID:
                                                                                dataStructureId,
                                                                        }
                                                                    ),
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

                                                        // Find tag info for audit log
                                                        const tagToAssign = [
                                                            ...availableTags,
                                                            ...availableDataTypeTags,
                                                        ].find(
                                                            (t) =>
                                                                t.id === tagId
                                                        );

                                                        console.log(
                                                            "Assigning tag:",
                                                            requestBody
                                                        );

                                                        const response =
                                                            await fetch(
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
                                                                    details:
                                                                        errorText,
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

                                                        // Log audit event
                                                        if (tagToAssign) {
                                                            await logAuditEvent(
                                                                {
                                                                    action: "assign",
                                                                    tagId: tagId,
                                                                    tagName:
                                                                        tagToAssign.name,
                                                                    tagType:
                                                                        tagToAssign.tagType ||
                                                                        "Category",
                                                                    structureShortName:
                                                                        modalStructure.shortName,
                                                                },
                                                                apiBaseUrl
                                                            );
                                                        }
                                                    }

                                                    // Update local state - include both custom tags and NDA category tags
                                                    // Use selectedTagIds (which already has duplicates removed) to get unique tags
                                                    const newTags =
                                                        availableTags.filter(
                                                            (tag) =>
                                                                selectedTagIds.includes(
                                                                    tag.id
                                                                )
                                                        );
                                                    setStructureTags(
                                                        (prev) => ({
                                                            ...prev,
                                                            [modalStructure.shortName]:
                                                                newTags,
                                                        })
                                                    );

                                                    setIsCategoriesModalOpen(
                                                        false
                                                    );
                                                    setSelectedSocialTags(
                                                        new Set()
                                                    );
                                                    setSelectedNdaCategories(
                                                        new Set()
                                                    );
                                                    setNewTagName("");
                                                    setModalSearchTerm("");
                                                    setNdaCategorySearchTerm(
                                                        ""
                                                    );
                                                    setCategoryError(null);
                                                    setMatchedCategoryItem(
                                                        null
                                                    );
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
                                            {modalLoading
                                                ? "Saving..."
                                                : "Save Changes"}
                                        </button>
                                    </div>
                                </>
                            )}
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
                        setModalSearchTerm("");
                        setDataTypeError(null);
                        setMatchedDataTypeItem(null);
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
                                    setModalSearchTerm("");
                                    setDataTypeError(null);
                                    setDataTypesModalTab("tags");
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tab Navigation */}
                        <div className="flex border-b">
                            <button
                                onClick={() => setDataTypesModalTab("tags")}
                                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                    dataTypesModalTab === "tags"
                                        ? "border-b-2 border-blue-500 text-blue-600"
                                        : "text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                Tags
                            </button>
                            <button
                                onClick={() => setDataTypesModalTab("audit")}
                                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                    dataTypesModalTab === "audit"
                                        ? "border-b-2 border-blue-500 text-blue-600"
                                        : "text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                Audit Trail
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {dataTypesModalTab === "audit" ? (
                                <AuditTrail
                                    structureShortName={
                                        modalStructure?.shortName
                                    }
                                    tagTypeFilter="Data Type"
                                    apiBaseUrl={apiBaseUrl}
                                />
                            ) : (
                                <>
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
                                                Toggle visibility of original
                                                data type
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
                                                                modalStructure
                                                                    .shortName
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
                                                            totalVisibleDataTypes <=
                                                                1
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
                                                                        (
                                                                            prev
                                                                        ) => {
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
                                                {Array.from(
                                                    selectedDataTypeTags
                                                ).map((tagId, index) => {
                                                    const tag =
                                                        availableDataTypeTags.find(
                                                            (t) =>
                                                                t.id === tagId
                                                        );
                                                    return tag ? (
                                                        <div
                                                            key={`${tag.id}-${index}`}
                                                            className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                                                        >
                                                            <span>
                                                                {tag.name}
                                                            </span>
                                                            <button
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    setSelectedDataTypeTags(
                                                                        (
                                                                            prev
                                                                        ) => {
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
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Data Types Header */}
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-gray-700">
                                                Data Types
                                            </h3>
                                        </div>

                                        {/* Create New Tag Input (shown when + is clicked or search has no results) */}
                                        {(() => {
                                            const filteredDataTypes =
                                                computeFilteredCombinedDataTypes(
                                                    modalSearchTerm
                                                );
                                            return (
                                                (showCreateDataTypeInput ||
                                                    filteredDataTypes.length ===
                                                        0) &&
                                                modalSearchTerm.trim()
                                            );
                                        })() && (
                                            <div className="mb-3 animate-[fadeIn_0.2s_ease-out]">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={modalSearchTerm}
                                                        onChange={(e) => {
                                                            setModalSearchTerm(
                                                                e.target.value
                                                            );
                                                        }}
                                                        placeholder="Data type tag name..."
                                                        className="flex-1 px-3 py-2 border rounded-l-lg focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none text-sm transition-all"
                                                        onKeyPress={async (
                                                            e
                                                        ) => {
                                                            const tagName =
                                                                modalSearchTerm.trim();
                                                            if (
                                                                e.key ===
                                                                    "Enter" &&
                                                                tagName
                                                            ) {
                                                                // Pass tagName directly to createDataTypeTag to avoid async state issues
                                                                const result =
                                                                    await createDataTypeTag(
                                                                        tagName
                                                                    );
                                                                // Only close input and clear search if tag was created successfully
                                                                if (result) {
                                                                    setShowCreateDataTypeInput(
                                                                        false
                                                                    );
                                                                    setModalSearchTerm(
                                                                        ""
                                                                    );
                                                                }
                                                                // Error is already displayed below search bar by createDataTypeTag
                                                            } else if (
                                                                e.key ===
                                                                "Escape"
                                                            ) {
                                                                setModalSearchTerm(
                                                                    ""
                                                                );
                                                            }
                                                        }}
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            const tagName =
                                                                modalSearchTerm.trim();
                                                            if (tagName) {
                                                                // Pass tagName directly to createDataTypeTag to avoid async state issues
                                                                const result =
                                                                    await createDataTypeTag(
                                                                        tagName
                                                                    );
                                                                // Only close input and clear search if tag was created successfully
                                                                if (result) {
                                                                    setShowCreateDataTypeInput(
                                                                        false
                                                                    );
                                                                    setModalSearchTerm(
                                                                        ""
                                                                    );
                                                                }
                                                                // Error is already displayed below search bar by createDataTypeTag
                                                            }
                                                        }}
                                                        disabled={
                                                            !modalSearchTerm.trim() ||
                                                            tagLoading
                                                        }
                                                        className="px-4 py-2 bg-green-500 text-white rounded-r-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all font-medium text-sm flex items-center gap-2"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        Add
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Unified Search with + button on right - Hide when input is shown */}
                                        {(() => {
                                            return !(
                                                showCreateDataTypeInput ||
                                                (combinedAvailableDataTypes.length ===
                                                    0 &&
                                                    modalSearchTerm.trim())
                                            );
                                        })() && (
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                                <input
                                                    type="text"
                                                    value={modalSearchTerm}
                                                    onChange={(e) => {
                                                        setModalSearchTerm(
                                                            e.target.value
                                                        );
                                                        // Clear error when user starts typing
                                                        if (dataTypeError) {
                                                            setDataTypeError(
                                                                null
                                                            );
                                                            setMatchedDataTypeItem(
                                                                null
                                                            );
                                                        }
                                                    }}
                                                    placeholder="Search all data types..."
                                                    className="w-full pl-10 pr-12 py-2 border rounded-lg focus:border-blue-500 focus:outline-none"
                                                />
                                                {/* + button on the right side of search box */}
                                                {modalSearchTerm.trim() && (
                                                    <button
                                                        onClick={() => {
                                                            // Compute all available data types (not filtered) for duplicate checking
                                                            const allAvailableDataTypes =
                                                                computeFilteredCombinedDataTypes(
                                                                    ""
                                                                );
                                                            // Check against ALL data types, not just filtered ones
                                                            // This ensures we catch plural/singular matches even if they don't match the search filter
                                                            const hasMatch =
                                                                hasNameMatch(
                                                                    modalSearchTerm,
                                                                    allAvailableDataTypes
                                                                );

                                                            if (!hasMatch) {
                                                                // No match, show input to create
                                                                setNewDataTypeTagName(
                                                                    modalSearchTerm.trim()
                                                                );
                                                                setShowCreateDataTypeInput(
                                                                    true
                                                                );
                                                                setDataTypeError(
                                                                    null
                                                                );
                                                                setMatchedDataTypeItem(
                                                                    null
                                                                );
                                                            } else {
                                                                // Match exists (exact or plural/singular), find the existing name
                                                                const existingItem =
                                                                    findExistingItemName(
                                                                        modalSearchTerm,
                                                                        allAvailableDataTypes
                                                                    );

                                                                const existingName =
                                                                    existingItem?.name ||
                                                                    modalSearchTerm.trim();
                                                                setDataTypeError(
                                                                    `"${modalSearchTerm.trim()}" already exists as "${existingName}". Please select it from the list below:`
                                                                );
                                                                // Store the matched item so it appears in the list even if it doesn't match the search term
                                                                setMatchedDataTypeItem(
                                                                    existingItem
                                                                );
                                                            }
                                                        }}
                                                        className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center justify-center w-6 h-6 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:scale-110 active:scale-95"
                                                        title="Create new data type tag"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {/* Error message for existing data type */}
                                        {dataTypeError && (
                                            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-[fadeIn_0.2s_ease-out]">
                                                {dataTypeError}
                                            </div>
                                        )}
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
                                                    {combinedAvailableDataTypes.length >
                                                    0
                                                        ? combinedAvailableDataTypes.map(
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
                                                                                              // Only allow one data type to be selected at a time
                                                                                              if (
                                                                                                  selectedDataTypeTags.has(
                                                                                                      item.id
                                                                                                  )
                                                                                              ) {
                                                                                                  // If already selected, deselect it
                                                                                                  setSelectedDataTypeTags(
                                                                                                      new Set()
                                                                                                  );
                                                                                              } else {
                                                                                                  // Select only this one (clear all others)
                                                                                                  setSelectedDataTypeTags(
                                                                                                      new Set(
                                                                                                          [
                                                                                                              item.id,
                                                                                                          ]
                                                                                                      )
                                                                                                  );
                                                                                              }
                                                                                          }
                                                                                      }}
                                                                                      className={`px-3 py-1.5 ${
                                                                                          isCustomTag
                                                                                              ? "rounded-l-full"
                                                                                              : "rounded-full"
                                                                                      } text-sm transition-all inline-flex items-center ${
                                                                                          isSelected
                                                                                              ? "bg-blue-500 text-white hover:bg-blue-600"
                                                                                              : "bg-white text-gray-700 border border-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-400"
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
                                                        : null}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-3 p-5 border-t">
                                        <button
                                            onClick={() => {
                                                setIsDataTypesModalOpen(false);
                                                setShowCreateDataTypeInput(
                                                    false
                                                );
                                                setModalSearchTerm("");
                                                setDataTypeError(null);
                                                setMatchedDataTypeItem(null);
                                            }}
                                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    setModalLoading(true);
                                                    setModalError(null);

                                                    // Get existing structure
                                                    const existingStructure =
                                                        dataStructuresMap[
                                                            modalStructure
                                                                .shortName
                                                        ];

                                                    if (!existingStructure) {
                                                        throw new Error(
                                                            `Data structure "${modalStructure.shortName}" not found in backend`
                                                        );
                                                    }

                                                    // Get current tag IDs for this structure
                                                    const currentTagIds =
                                                        new Set(
                                                            (
                                                                structureDataTypeTags[
                                                                    modalStructure
                                                                        .shortName
                                                                ] || []
                                                            ).map((t) => t.id)
                                                        );

                                                    // Find tags to add and remove
                                                    const toAdd = Array.from(
                                                        selectedDataTypeTags
                                                    ).filter(
                                                        (id) =>
                                                            !currentTagIds.has(
                                                                id
                                                            )
                                                    );
                                                    const toRemove = Array.from(
                                                        currentTagIds
                                                    ).filter(
                                                        (id) =>
                                                            !selectedDataTypeTags.has(
                                                                id
                                                            )
                                                    );

                                                    // If nothing has changed, cancel and close modal
                                                    if (
                                                        toAdd.length === 0 &&
                                                        toRemove.length === 0
                                                    ) {
                                                        setIsDataTypesModalOpen(
                                                            false
                                                        );
                                                        setSelectedDataTypeTags(
                                                            new Set()
                                                        );
                                                        setNewDataTypeTagName(
                                                            ""
                                                        );
                                                        setModalSearchTerm("");
                                                        setDataTypeError(null);
                                                        setMatchedDataTypeItem(
                                                            null
                                                        );
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
                                                        const response =
                                                            await fetch(
                                                                `/api/spinup/tags/remove`,
                                                                {
                                                                    method: "POST",
                                                                    headers: {
                                                                        "Content-Type":
                                                                            "application/json",
                                                                    },
                                                                    body: JSON.stringify(
                                                                        {
                                                                            tagId: tagId,
                                                                            DataStructureID:
                                                                                dataStructureId,
                                                                        }
                                                                    ),
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

                                                        const response =
                                                            await fetch(
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
                                                            const errorData =
                                                                await response.json();
                                                            throw new Error(
                                                                errorData.error ||
                                                                    "Failed to assign tag"
                                                            );
                                                        }
                                                    }

                                                    // Refresh structure tags
                                                    await fetchStructureTags();

                                                    // Close modal
                                                    setIsDataTypesModalOpen(
                                                        false
                                                    );
                                                    setSelectedDataTypeTags(
                                                        new Set()
                                                    );
                                                    setNewDataTypeTagName("");
                                                    setModalSearchTerm("");
                                                    setDataTypeError(null);
                                                    setMatchedDataTypeItem(
                                                        null
                                                    );
                                                } catch (err) {
                                                    console.error(
                                                        "Error saving data type tags:",
                                                        err
                                                    );
                                                    setModalError(err.message);
                                                } finally {
                                                    setModalLoading(false);
                                                }
                                            }}
                                            disabled={modalLoading}
                                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
                                        >
                                            {modalLoading
                                                ? "Saving..."
                                                : "Save Changes"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmModal.isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setDeleteConfirmModal({
                                isOpen: false,
                                type: null,
                                itemName: null,
                                itemId: null,
                                structureShortName: null,
                                structureCount: 0,
                                onConfirm: null,
                            });
                        }
                    }}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-bold text-gray-900 mb-4">
                            Are you really sure?
                        </h2>
                        <p className="text-gray-700 mb-6">
                            {deleteConfirmModal.type === "tag" && (
                                <>
                                    Are you sure you want to permanently delete
                                    the tag{" "}
                                    <span className="font-semibold">
                                        &quot;{deleteConfirmModal.itemName}
                                        &quot;
                                    </span>
                                    ? This tag is currently attached to{" "}
                                    <span className="font-semibold text-red-600">
                                        {deleteConfirmModal.structureCount}{" "}
                                        {deleteConfirmModal.structureCount === 1
                                            ? "structure"
                                            : "structures"}
                                    </span>
                                    . This will remove it from all data
                                    structures and cannot be undone.
                                </>
                            )}
                            {deleteConfirmModal.type === "category" && (
                                <>
                                    Are you sure you want to remove the category{" "}
                                    <span className="font-semibold">
                                        &quot;{deleteConfirmModal.itemName}
                                        &quot;
                                    </span>{" "}
                                    from this structure? This category is used
                                    by{" "}
                                    <span className="font-semibold text-red-600">
                                        {deleteConfirmModal.structureCount}{" "}
                                        {deleteConfirmModal.structureCount === 1
                                            ? "structure"
                                            : "structures"}
                                    </span>
                                    . This action cannot be undone.
                                </>
                            )}
                            {deleteConfirmModal.type === "dataType" && (
                                <>
                                    Are you sure you want to remove the data
                                    type{" "}
                                    <span className="font-semibold">
                                        &quot;{deleteConfirmModal.itemName}
                                        &quot;
                                    </span>{" "}
                                    from this structure? This data type is used
                                    by{" "}
                                    <span className="font-semibold text-red-600">
                                        {deleteConfirmModal.structureCount}{" "}
                                        {deleteConfirmModal.structureCount === 1
                                            ? "structure"
                                            : "structures"}
                                    </span>
                                    . This action cannot be undone.
                                </>
                            )}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setDeleteConfirmModal({
                                        isOpen: false,
                                        type: null,
                                        itemName: null,
                                        itemId: null,
                                        structureShortName: null,
                                        structureCount: 0,
                                        onConfirm: null,
                                    });
                                }}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (deleteConfirmModal.onConfirm) {
                                        await deleteConfirmModal.onConfirm();
                                    }
                                }}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataCategorySearch;

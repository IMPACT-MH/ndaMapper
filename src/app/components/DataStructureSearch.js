"use client";
import { useState, useEffect, useRef } from "react";
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
    onSwitchToElementSearch,
}) => {
    const [headers, setHeaders] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false);

    // Clear headers when CSV file is removed
    useEffect(() => {
        if (!initialCsvFile) {
            setHeaders([]);
        }
    }, [initialCsvFile]);

    // Collapse details view when search term changes
    useEffect(() => {
        if (searchTerm && isExpanded) {
            setIsExpanded(false);
        }
    }, [searchTerm]);

    const resultsRef = useRef(null);
    const detailsRef = useRef(null);

    const showResultsHeader = useScrollDirection(resultsRef);
    const showDetailsHeader = useScrollDirection(detailsRef);

    const handleCategoryClick = async (category) => {
        if (isExpanded) {
            setIsExpanded(false);
        }

        setSearchTerm(`category:${category}`);

        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const handleElementDoubleClick = (elementName) => {
        // Switch to element search tab and search for this element
        setSearchTerm(elementName);
        // You'll need to add a prop to handle tab switching
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
                        <p className="text-gray-600 mb-6">
                            Search the NDA Data Dictionary
                        </p>

                        {/* Database Filter Checkbox */}
                        <div className="mb-4">
                            <label className="flex items-center space-x-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={databaseFilterEnabled}
                                    onChange={(e) =>
                                        setDatabaseFilterEnabled(
                                            e.target.checked
                                        )
                                    }
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                />
                                <div className="flex items-center space-x-2">
                                    <Database className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-medium text-gray-700">
                                        Show only {databaseName} structures
                                    </span>
                                    {loadingDatabaseStructures && (
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                                    )}
                                </div>
                            </label>
                            {databaseFilterEnabled &&
                                databaseStructures.length > 0 && (
                                    <p className="text-xs text-gray-500 mt-1 ml-7">
                                        Filtering by {databaseStructures.length}{" "}
                                        available structures
                                    </p>
                                )}
                        </div>

                        <div className="relative">
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
                                            {databaseFilterEnabled &&
                                                databaseStructures.length >
                                                    0 && (
                                                    <p className="text-sm text-blue-600 mt-1">
                                                        <Database className="w-3 h-3 inline mr-1" />
                                                        {databaseName} filtered
                                                    </p>
                                                )}
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
                                                    setIsExpanded(false);
                                                }}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <h3 className="font-mono text-lg font-medium font-extrabold flex items-center">
                                                        {structure.shortName}
                                                        {databaseFilterEnabled &&
                                                            databaseStructures
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
                                                                        exists
                                                                        in the
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
                                                match "{searchTerm}".
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
                                                No structures match "
                                                {searchTerm}".
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
                                        onClick={() =>
                                            selectedStructure &&
                                            setIsExpanded(true)
                                        }
                                    >
                                        <div className="bg-white rounded-lg shadow">
                                            {/* Details content */}
                                            <div className="bg-white p-6 rounded-lg shadow">
                                                <div className="flex items-center gap-3 mb-8">
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
                                                            ) && (
                                                            <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                                                <Database className="w-3 h-3" />
                                                                <span>
                                                                    Available in
                                                                    Database
                                                                </span>
                                                            </div>
                                                        )}
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
                                                                    <p className="text-lg font-mono font-medium text-blue-600">
                                                                        {
                                                                            selectedStructure.shortName
                                                                        }
                                                                    </p>
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
                                                                <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-700">
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
                                                                <p className="text-gray-900">
                                                                    {selectedStructure.dataType ||
                                                                        "Not specified"}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <h3 className="font-medium text-gray-600 mb-2">
                                                                    Categories
                                                                </h3>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {selectedStructure.categories?.map(
                                                                        (
                                                                            category,
                                                                            index
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    index
                                                                                }
                                                                                className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm cursor-pointer hover:bg-gray-200 transition-colors"
                                                                                onClick={(
                                                                                    e
                                                                                ) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    handleCategoryClick(
                                                                                        category
                                                                                    );
                                                                                }}
                                                                            >
                                                                                {
                                                                                    category
                                                                                }
                                                                            </span>
                                                                        )
                                                                    ) || (
                                                                        <span className="text-gray-500">
                                                                            No
                                                                            categories
                                                                            specified
                                                                        </span>
                                                                    )}
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
                                                                                            onDoubleClick={() =>
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

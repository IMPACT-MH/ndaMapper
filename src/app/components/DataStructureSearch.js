"use client";
import { useState, useEffect, useRef } from "react";
import {
    Search,
    X,
    CheckCircle,
    ChevronLeft,
    FileText,
    Table,
} from "lucide-react";
import CSVValidator from "./CSVValidator";
import DownloadStructureButton from "./DownloadStructureButton";
import DownloadTemplateButton from "./DownloadTemplateButton";
import useScrollDirection from "./useScrollDirection";

const DataStructureSearch = ({
    searchTerm,
    setSearchTerm,
    structures,
    loading,
    error,
    selectedStructure,
    handleStructureSelect,
    dataElements,
    loadingElements,
    handleStructureSearch,
    initialCsvFile,
    onFileChange, // New prop to pass changes up
    onClear,
    validatorState, // New prop
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

    return (
        <>
            <div className="flex flex-col h-screen">
                {/* Fixed header section */}
                <div className="flex-none">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4">
                            NDA Data Dictionary
                        </h1>
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
                    {" "}
                    {/* min-h-0 is crucial for nested flex scroll */}
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
                    {/* Initial state message */}
                    {!searchTerm && !selectedStructure && (
                        <div className="w-full text-center text-gray-500 py-12">
                            Start typing above to search for data structures
                        </div>
                    )}
                    <div className="flex gap-4 h-full">
                        {/* Results column - independently scrollable */}
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
                                        <h2 className="text-xl font-semibold p-4">
                                            Results
                                        </h2>
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
                                                    <h3 className="font-mono text-lg font-medium text-blue-600">
                                                        {structure.shortName}
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
                                                <h1 className="text-2xl font-semibold mb-8">
                                                    {/* Data Structure */}
                                                    {selectedStructure.title}
                                                </h1>
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
                                                                        {selectedStructure.version ||
                                                                            "1.0"}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <h3 className="font-medium text-gray-600 mb-2">
                                                                    Status
                                                                </h3>
                                                                {/* <p className="text-lg text-gray-900">
                                                                    Data
                                                                    Structure
                                                                </p> */}
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
                                                                                className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm"
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

                                                                                    return (
                                                                                        <tr
                                                                                            key={
                                                                                                index
                                                                                            }
                                                                                            className="hover:bg-gray-50"
                                                                                        >
                                                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                                                {isIncluded && (
                                                                                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                                                                                )}
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

"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

const DataDictionarySearch = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [structures, setStructures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedStructure, setSelectedStructure] = useState(null);
    const [dataElements, setDataElements] = useState([]);
    const [loadingElements, setLoadingElements] = useState(false);

    useEffect(() => {
        if (searchTerm) {
            const debounceTimer = setTimeout(() => {
                fetchData();
            }, 300);
            return () => clearTimeout(debounceTimer);
        } else {
            setStructures([]);
        }
    }, [searchTerm]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/v2/datastructure?searchTerm=${searchTerm}`
            );
            if (!response.ok) throw new Error("Failed to fetch data");
            const data = await response.json();

            const sortedData = data.sort((a, b) => {
                const aTitle = a.title?.toLowerCase() || "";
                const bTitle = b.title?.toLowerCase() || "";
                const searchLower = searchTerm.toLowerCase();

                if (a.shortName.toLowerCase() === searchLower) return -1;
                if (b.shortName.toLowerCase() === searchLower) return 1;

                const aContainsSearch = aTitle.includes(searchLower);
                const bContainsSearch = bTitle.includes(searchLower);

                if (aContainsSearch && !bContainsSearch) return -1;
                if (!aContainsSearch && bContainsSearch) return 1;

                return 0;
            });

            setStructures(sortedData);
        } catch (err) {
            setError("Error fetching data: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchDataElements = async (shortName) => {
        setLoadingElements(true);
        try {
            const response = await fetch(
                `https://nda.nih.gov/api/datadictionary/datastructure/${shortName}`
            );
            if (!response.ok) throw new Error("Failed to fetch data elements");
            const data = await response.json();

            // The data.dataElements array is already in the format we need
            const sortedElements = data.dataElements.sort(
                (a, b) => a.position - b.position
            );

            setDataElements(sortedElements);
        } catch (err) {
            console.error("Parsing error:", err);
            setError("Error fetching data elements: " + err.message);
        } finally {
            setLoadingElements(false);
        }
    };

    const handleStructureSelect = (structure) => {
        setSelectedStructure(structure);
        fetchDataElements(structure.shortName);
    };

    return (
        <div className="container mx-auto p-4 max-w-7xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4">
                    NIH Data Dictionary Search
                </h1>

                <div className="relative">
                    <input
                        type="text"
                        className="w-full p-4 pl-12 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Search by name or description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search
                        className="absolute left-4 top-4 text-gray-400"
                        size={20}
                    />
                </div>
            </div>

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

            <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg shadow h-fit">
                    <h2 className="text-xl font-semibold mb-4">Results</h2>
                    <div className="space-y-2">
                        {structures.map((structure) => (
                            <div
                                key={structure.shortName}
                                className={`p-4 border rounded hover:bg-gray-50 cursor-pointer transition-colors ${
                                    selectedStructure?.shortName ===
                                    structure.shortName
                                        ? "ring-2 ring-blue-500 bg-blue-50"
                                        : ""
                                }`}
                                onClick={() => handleStructureSelect(structure)}
                            >
                                <div className="flex justify-between items-start">
                                    <h3 className="font-mono text-lg font-medium text-blue-600">
                                        {structure.shortName}
                                    </h3>
                                    <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                                        {structure.source || "NDA"}
                                    </span>
                                </div>
                                <p className="text-base mt-2">
                                    {structure.title}
                                </p>
                            </div>
                        ))}
                    </div>
                    {structures.length === 0 && !loading && searchTerm && (
                        <p className="text-gray-500 text-center py-4">
                            No results found for "{searchTerm}"
                        </p>
                    )}
                </div>

                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Details</h2>
                    {selectedStructure ? (
                        <div className="space-y-6">
                            <div>
                                <h3 className="font-medium text-gray-700">
                                    Short Name
                                </h3>
                                <p className="text-lg font-mono font-semibold">
                                    {selectedStructure.shortName}
                                </p>
                            </div>
                            <div>
                                <h3 className="font-medium text-gray-700">
                                    Title
                                </h3>
                                <p className="text-lg">
                                    {selectedStructure.title}
                                </p>
                            </div>
                            <div>
                                <h3 className="font-medium text-gray-700">
                                    Status
                                </h3>
                                <span className="inline-block px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                                    {selectedStructure.status}
                                </span>
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
                                                        Value Range
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Notes
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {dataElements.map(
                                                    (element, index) => (
                                                        <tr
                                                            key={index}
                                                            className="hover:bg-gray-50"
                                                        >
                                                            <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                                                                {element.name}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                {element.type}
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
                                                                            ? "bg-blue-100 text-blue-800"
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
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-4">
                            Select a structure to view details
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataDictionarySearch;

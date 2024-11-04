"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

const DataDictionarySearch = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [structures, setStructures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedStructure, setSelectedStructure] = useState(null);

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

            // Sort results based on relevance
            const sortedData = data.sort((a, b) => {
                const aTitle = a.title?.toLowerCase() || "";
                const bTitle = b.title?.toLowerCase() || "";
                const searchLower = searchTerm.toLowerCase();

                // Check for exact matches in shortName
                if (a.shortName.toLowerCase() === searchLower) return -1;
                if (b.shortName.toLowerCase() === searchLower) return 1;

                // Check for title matches
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

    const highlightText = (text = "", searchTerm) => {
        if (!searchTerm) return text;
        const regex = new RegExp(
            `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
            "gi"
        );
        const parts = text.split(regex);
        return parts.map((part, index) =>
            regex.test(part) ? (
                <span
                    key={index}
                    className="bg-yellow-200 text-black font-medium"
                >
                    {part}
                </span>
            ) : (
                part
            )
        );
    };

    return (
        <div className="container mx-auto p-4 max-w-6xl">
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
                <div className="bg-white p-4 rounded-lg shadow">
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
                                onClick={() => setSelectedStructure(structure)}
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
                                    {highlightText(structure.title, searchTerm)}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {structure.category
                                        ?.split(",")
                                        .map((cat, index) => (
                                            <span
                                                key={index}
                                                className="text-xs bg-gray-100 px-2 py-1 rounded"
                                            >
                                                {cat.trim()}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    {structures.length === 0 && !loading && searchTerm && (
                        <p className="text-gray-500 text-center py-4">
                            No results found for "{searchTerm}"
                        </p>
                    )}
                    {structures.length === 0 && !loading && !searchTerm && (
                        <p className="text-gray-500 text-center py-4">
                            Start typing to search...
                        </p>
                    )}
                </div>

                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4">Details</h2>
                    {selectedStructure ? (
                        <div className="space-y-4">
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
                            {selectedStructure.description && (
                                <div>
                                    <h3 className="font-medium text-gray-700">
                                        Description
                                    </h3>
                                    <p className="text-gray-800">
                                        {selectedStructure.description}
                                    </p>
                                </div>
                            )}
                            <div>
                                <h3 className="font-medium text-gray-700">
                                    Status
                                </h3>
                                <span
                                    className={`inline-block px-3 py-1 rounded-full text-sm ${
                                        selectedStructure.status === "Published"
                                            ? "bg-green-100 text-green-800"
                                            : "bg-yellow-100 text-yellow-800"
                                    }`}
                                >
                                    {selectedStructure.status}
                                </span>
                            </div>
                            {selectedStructure.lastModified && (
                                <div>
                                    <h3 className="font-medium text-gray-700">
                                        Last Modified
                                    </h3>
                                    <p>
                                        {new Date(
                                            selectedStructure.lastModified
                                        ).toLocaleDateString()}
                                    </p>
                                </div>
                            )}
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

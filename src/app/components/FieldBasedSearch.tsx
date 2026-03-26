"use client";

import { useState } from "react";
import { NDA_DATA_ELEMENT } from "@/const";

interface FieldSearchResult {
  name: string;
  matchingFields: string[];
  matchCount: number;
}

const FieldBasedSearch = () => {
  const [searchFields, setSearchFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FieldSearchResult[]>([]);

  const handleFieldSearch = async (fields: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const searchPromises = fields.map((field) =>
        fetch(`${NDA_DATA_ELEMENT}/${field}`)
          .then((res) => res.json() as Promise<string[]>)
          .catch(() => [] as string[])
      );

      const fieldResults = await Promise.all(searchPromises);

      const structureCounts: Record<string, FieldSearchResult> = {};
      fieldResults.forEach((structures, index) => {
        structures.forEach((structureName) => {
          if (!structureCounts[structureName]) {
            structureCounts[structureName] = {
              name: structureName,
              matchingFields: [],
              matchCount: 0,
            };
          }
          structureCounts[structureName].matchingFields.push(fields[index]);
          structureCounts[structureName].matchCount++;
        });
      });

      const sortedResults = Object.values(structureCounts).sort(
        (a, b) => b.matchCount - a.matchCount
      );

      setResults(sortedResults);
    } catch (err) {
      setError(
        "Error searching by fields: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Search by Fields</h2>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter field name (e.g., subjectkey)"
              className="flex-1 p-2 border rounded"
              onKeyDown={(e) => {
                const input = e.currentTarget;
                if (e.key === "Enter" && input.value) {
                  setSearchFields([...searchFields, input.value]);
                  input.value = "";
                }
              }}
            />
            <button
              onClick={() => handleFieldSearch(searchFields)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={searchFields.length === 0 || loading}
            >
              Search
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {searchFields.map((field, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-700"
              >
                {field}
                <button
                  onClick={() =>
                    setSearchFields(searchFields.filter((_, i) => i !== index))
                  }
                  className="ml-2 text-blue-500 hover:text-blue-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Searching structures...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Matching Structures</h3>
          <div className="space-y-4">
            {results.map((result) => (
              <div
                key={result.name}
                className="p-4 border rounded hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <h4 className="font-mono text-lg text-blue-600">
                    {result.name}
                  </h4>
                  <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                    {result.matchCount} matches
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.matchingFields.map((field, index) => (
                    <span
                      key={index}
                      className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldBasedSearch;

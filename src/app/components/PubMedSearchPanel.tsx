"use client";
import { useState } from "react";
import {
  FileText,
  Link as LinkIcon,
  Loader,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import type { DataElement } from "@/types";

interface PubMedRecord {
  pmid: string;
  title: string;
  abstract: string;
  url: string;
  matched_terms: string[];
}

interface PubMedSearchPanelProps {
  dataElements: DataElement[];
  selectedStructure?: { title?: string; shortName?: string } | null;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

const PubMedSearchPanel = ({
  dataElements,
  selectedStructure,
  isOpen = false,
  onToggle,
}: PubMedSearchPanelProps) => {
  const [searchType, setSearchType] = useState<"acronyms" | "terms" | "combined">(
    "combined"
  );
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PubMedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(isOpen);

  const extractElementDescriptions = (): string[] => {
    return dataElements
      .map((el) => el.description)
      .filter((desc) => desc && desc.trim());
  };

  const handleSearch = async () => {
    if (!dataElements.length) {
      setError("No data elements available for search");
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const descriptions = extractElementDescriptions();

      const response = await fetch("/api/v1/research/pubmed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          descriptions,
          searchType,
          maxResults: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results: PubMedRecord[];
        query: string;
      };
      setResults(data.results);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to search PubMed"
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleResultExpanded = (pmid: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(pmid)) {
      newExpanded.delete(pmid);
    } else {
      newExpanded.add(pmid);
    }
    setExpandedResults(newExpanded);
  };

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    if (onToggle) {
      onToggle(newState);
    }
  };

  if (!dataElements.length) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-blue-600" />
          <span className="font-semibold text-gray-700">PubMed Search</span>
        </div>
        {isExpanded ? (
          <ChevronUp size={20} className="text-gray-500" />
        ) : (
          <ChevronDown size={20} className="text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 py-4 space-y-4 border-t border-gray-200">
          {/* Search Type Selection */}
          <div className="flex gap-2 flex-wrap">
            {(["combined", "acronyms", "terms"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSearchType(type)}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  searchType === type
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {loading ? (
              <>
                <Loader size={18} className="animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <LinkIcon size={18} />
                Search PubMed
              </>
            )}
          </button>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">
                Found {results.length} results
              </div>
              {results.map((record) => (
                <div
                  key={record.pmid}
                  className="border border-gray-300 rounded bg-white overflow-hidden"
                >
                  <button
                    onClick={() => toggleResultExpanded(record.pmid)}
                    className="w-full flex items-start justify-between p-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-blue-600 text-sm line-clamp-2 hover:underline">
                        {record.title}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1">
                        PMID: {record.pmid}
                      </p>
                      {record.matched_terms.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {record.matched_terms.slice(0, 3).map((term, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded"
                            >
                              {term}
                            </span>
                          ))}
                          {record.matched_terms.length > 3 && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                              +{record.matched_terms.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="ml-2 flex-shrink-0">
                      {expandedResults.has(record.pmid) ? (
                        <ChevronUp size={18} className="text-gray-500" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-500" />
                      )}
                    </div>
                  </button>

                  {expandedResults.has(record.pmid) && (
                    <div className="px-3 py-3 border-t border-gray-200 bg-gray-50">
                      <p className="text-sm text-gray-700 mb-3 line-clamp-4">
                        {record.abstract}
                      </p>
                      <a
                        href={record.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View on PubMed
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div className="text-sm text-gray-500 italic">
              Click "Search PubMed" to find related literature
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PubMedSearchPanel;

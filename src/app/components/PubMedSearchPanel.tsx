"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Loader,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

const EDITION_WORDS = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth";

function cleanStructureTitle(name: string): string {
  let text = name;
  text = text.replace(/\([^)]*\)/g, " ");          // strip (WMS-IV)
  text = text.replace(/\[[^\]]*\]/g, " ");          // strip [...]
  // strip "Fourth Edition", "4th Edition", "Edition 4", "4th ed"
  text = text.replace(new RegExp(`\\b(?:\\d+(?:st|nd|rd|th)|${EDITION_WORDS})\\s+edition\\b`, "gi"), " ");
  text = text.replace(new RegExp(`\\bedition\\s+(?:\\d+(?:st|nd|rd|th)?|${EDITION_WORDS})\\b`, "gi"), " ");
  text = text.replace(/\b\d+(?:st|nd|rd|th)\s+ed\b/gi, " ");
  // remove standalone all-caps tokens (acronyms like WMS, IV)
  text = text.split(/\s+/).filter((t) => !(t.length >= 2 && t === t.toUpperCase() && /^[A-Z]+$/.test(t))).join(" ");
  text = text.replace(/[^A-Za-z0-9 \-]/g, " ");    // strip punctuation
  return text.replace(/\s+/g, " ").trim();
}

interface PubMedRecord {
  pmid: string;
  title: string;
  abstract: string;
  url: string;
  matched_terms: string[];
  authors: string[];
}

interface PubMedSearchPanelProps {
  selectedStructure?: { title?: string; shortName?: string; description?: string } | null;
  customCategories?: string[];
  customDataTypes?: string[];
  tagsLoaded?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

const PubMedSearchPanel = ({
  selectedStructure,
  customCategories = [],
  customDataTypes = [],
  tagsLoaded = false,
  isOpen = false,
  onToggle,
}: PubMedSearchPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PubMedRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [shownCount, setShownCount] = useState(5);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(isOpen);
  const lastAutoSearchedRef = useRef<string | null>(null);

  const handleSearch = useCallback(async (maxResults = 5) => {
    const cleanedTitle = selectedStructure?.title
      ? cleanStructureTitle(selectedStructure.title)
      : null;

    if (!cleanedTitle) {
      setError("No structure title available for PubMed search");
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setTotalCount(null);
    setSearchQuery(null);

    try {
      const queryTerms = [
        cleanedTitle,
        ...customCategories,
      ]
        .map((term) => term?.trim())
        .filter((term): term is string => Boolean(term))
        .map((term) => term.replace(/"/g, ""))
        .filter((term, index, all) => all.indexOf(term) === index);

      const directQuery = queryTerms
        .map((term) => `"${term}"`)
        .join(" AND ");

      const response = await fetch("/api/v1/research/pubmed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: directQuery,
          maxResults,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results: PubMedRecord[];
        totalCount: number;
        query: string;
      };
      setResults(data.results);
      setTotalCount(data.totalCount);
      setSearchQuery(data.query);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to search PubMed"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedStructure, customCategories, customDataTypes]);

  // Clear stale results when structure changes
  useEffect(() => {
    setResults([]);
    setTotalCount(null);
    setShownCount(5);
    setError(null);
    setSearchQuery(null);
    setIsExpanded(false);
  }, [selectedStructure?.shortName]);

  // Auto-search once both elements and IMPACT-MH tags are loaded for a new structure
  useEffect(() => {
    const key = selectedStructure?.shortName;
    if (key && selectedStructure?.title && tagsLoaded && key !== lastAutoSearchedRef.current) {
      lastAutoSearchedRef.current = key;
      setIsExpanded(true);
      handleSearch(5);
    }
  }, [selectedStructure?.shortName, selectedStructure?.title, tagsLoaded, handleSearch]);

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

  if (!selectedStructure?.title) {
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
          {selectedStructure?.description && (
            <p className="text-xs text-gray-500 italic">{selectedStructure.description}</p>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader size={16} className="animate-spin" />
              Searching PubMed…
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Query debug + PubMed link */}
          {searchQuery && (
            <div className="p-2 bg-gray-100 rounded text-xs font-mono text-gray-600 space-y-1">
              <div className="flex items-start justify-between gap-2 break-all">
                <span><span className="font-semibold text-gray-700">Query: </span>{searchQuery}</span>
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(searchQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-sans font-medium whitespace-nowrap"
                >
                  Open in PubMed
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">
                Top {results.length} results
                {totalCount !== null && (
                  <span className="font-normal text-gray-500"> of {totalCount.toLocaleString()} total</span>
                )}
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
                      {record.authors.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {record.authors.join(", ")}
                        </p>
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

              {totalCount !== null && results.length < totalCount && (
                <button
                  onClick={() => {
                    const next = shownCount + 5;
                    setShownCount(next);
                    handleSearch(next);
                  }}
                  disabled={loading}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200 transition-colors disabled:opacity-50"
                >
                  {loading ? "Loading…" : `Show more (${totalCount.toLocaleString()} total)`}
                </button>
              )}
            </div>
          )}

          {!loading && results.length === 0 && !error && searchQuery !== null && (
            <div className="text-sm text-gray-500 italic">
              No results found.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PubMedSearchPanel;

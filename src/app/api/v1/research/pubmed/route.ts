import { NextRequest, NextResponse } from "next/server";

const ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

interface PubMedRecord {
  pmid: string;
  title: string;
  abstract: string;
  url: string;
  matched_terms: string[];
  authors: string[];
}

const REMOVE_TERMS = [
  "score",
  "scaled score",
  "raw score",
  "percentile rank",
  "percentile",
  "confidence interval",
  "classification level",
  "significance level",
  "confidence level",
  "item",
  "response",
  "demonstration",
  "selected",
  "highest value",
  "lowest value",
  "completed",
  "date",
  "time",
  "TOTAL RAW",
];

const EXCLUDE_PATTERNS = [
  /\bage\b/i,
  /\bdate\b/i,
  /\btime\b/i,
  /confidence level selected/i,
  /significance level selected/i,
  /difference/i,
  /sex/i,
  /GUID/i,
  /visit name/i,
  /Standard/i,
  /sum/i,
  /assessment name/i,
  /\bMAPPED\b/i,
  /\bNEED\b/i,
  /\bNOT\b/i,
  /\bINTERNAL\b/i,
  /\bVARIABLE\b/i,
  /\bContent\b/i,
  /\bScaled\b/i,
];

function isAcronym(s: string): boolean {
  const acronymPattern = /\b[a-zA-Z]+\d*_[a-zA-Z0-9_]+\b/;
  const allCapsPattern = /^[A-Z]{2,10}$/;
  return acronymPattern.test(s) || allCapsPattern.test(s);
}

function shouldExclude(text: string): boolean {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(text));
}

function extractAcronyms(text: string): string[] {
  return text.match(/\b[A-Z]{2,10}\b/g) || [];
}

function extractVariableNames(text: string): string[] {
  return text.match(/\b[a-zA-Z]+\d*_[a-zA-Z0-9_]+\b/g) || [];
}

function cleanDescription(text: string): string {
  let cleaned = text;

  for (const term of REMOVE_TERMS) {
    cleaned = cleaned.replace(new RegExp(`\\b${term}\\b`, "gi"), " ");
  }

  cleaned = cleaned.replace(/\b\d+\b/g, "");
  cleaned = cleaned.replace(/[:;(),]/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\./g, "");

  return cleaned.trim();
}

function extractConcepts(text: string): string[] {
  const pieces = text.split(/\b(?:vs\.?|versus|minus|contrast)\b/i);
  const concepts: string[] = [];

  for (const piece of pieces) {
    const cleaned = cleanDescription(piece);
    if (cleaned.length >= 3) {
      concepts.push(cleaned);
    }
  }

  return concepts;
}

function getShortestCommonOverlap(terms: string[]): string[] {
  if (terms.length === 0) return [];
  if (terms.length === 1) return terms;

  const sorted = [...terms].sort();
  const condensed: string[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const similarity =
      (2 * getLongestCommonSubstring(current, next).length) /
      (current.length + next.length);

    if (similarity > 0.7) {
      current = getLongestCommonSubstring(current, next) || current;
    } else {
      if (current && !condensed.includes(current)) {
        condensed.push(current);
      }
      current = next;
    }
  }

  if (current && !condensed.includes(current)) {
    condensed.push(current);
  }

  return condensed;
}

function getLongestCommonSubstring(s1: string, s2: string): string {
  const lower1 = s1.toLowerCase();
  const lower2 = s2.toLowerCase();
  const lengths: number[][] = Array(lower1.length + 1)
    .fill(0)
    .map(() => Array(lower2.length + 1).fill(0));

  let longest = 0;
  let endPos = 0;

  for (let i = 1; i <= lower1.length; i++) {
    for (let j = 1; j <= lower2.length; j++) {
      if (lower1[i - 1] === lower2[j - 1]) {
        lengths[i][j] = lengths[i - 1][j - 1] + 1;
        if (lengths[i][j] > longest) {
          longest = lengths[i][j];
          endPos = i;
        }
      } else {
        lengths[i][j] = 0;
      }
    }
  }

  return s1.slice(endPos - longest, endPos).trim();
}

function buildPubMedQueryFromDescriptions(
  descriptions: string[]
): { allTerms: string[]; acronyms: string[]; terms: string[] } {
  const tempAcronyms = new Set<string>();
  const tempVariableNames = new Set<string>();
  const tempConcepts = new Set<string>();

  for (const desc of descriptions) {
    if (shouldExclude(desc)) continue;

    extractVariableNames(desc).forEach((v) => tempVariableNames.add(v));
    extractAcronyms(desc).forEach((a) => tempAcronyms.add(a));
    extractConcepts(desc).forEach((c) => tempConcepts.add(c));
  }

  const searchTerms = new Set<string>();
  searchTerms.forEach((term) => {
    if (tempVariableNames.has(term)) searchTerms.add(term);
  });
  tempVariableNames.forEach((v) => searchTerms.add(v));

  for (const concept of tempConcepts) {
    let preferredTerm = concept;
    for (const acronym of tempAcronyms) {
      if (new RegExp(`\\b${acronym}\\b`, "i").test(concept)) {
        preferredTerm = acronym;
        break;
      }
    }
    searchTerms.add(preferredTerm);
  }

  tempAcronyms.forEach((a) => searchTerms.add(a));

  const filtered = Array.from(searchTerms)
    .map((x) => x.trim())
    .filter((x) => x.length > 2 && !shouldExclude(x));

  const condensed = getShortestCommonOverlap(filtered);
  const allTerms = condensed
    .filter((s) => s.length <= 40)
    .sort();

  const acronyms = allTerms.filter((s) => isAcronym(s));
  const terms = allTerms.filter((s) => !isAcronym(s));

  return { allTerms, acronyms, terms };
}

function buildOrQuery(terms: string[]): string {
  return terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" AND ");
}

function buildOrGroup(terms: string[]): string {
  return `(${terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ")})`;
}

function queryTermsFromQuery(query: string): string[] {
  return query
    .split(" AND ")
    .map((part) => part.trim())
    .map((part) => {
      if (part.startsWith('"') && part.endsWith('"')) {
        return part.slice(1, -1);
      }
      return part;
    });
}

function parseXmlRecords(xmlText: string, query: string): PubMedRecord[] {
  const records: PubMedRecord[] = [];

  try {
    // Parse PMID elements
    const pmidMatches = xmlText.matchAll(/<PMID[^>]*>(\d+)<\/PMID>/g);
    const pmids: string[] = [];
    for (const match of pmidMatches) {
      pmids.push(match[1]);
    }

    // For each PMID, extract article data
    const articleRegex =
      /<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g;
    const articles = xmlText.match(articleRegex) || [];

    articles.forEach((article) => {
      // Extract PMID
      const pmidMatch = article.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      const pmid = pmidMatch ? pmidMatch[1] : "";
      if (!pmid) return;

      // Extract Title — use [\s\S]*? to match across nested tags (e.g. <i>, <sup>),
      // then strip inner tags. [^<]* would silently return "" for any formatted title.
      const titleMatch = article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
      const title = titleMatch
        ? decodeXmlEntities(titleMatch[1].replace(/<[^>]+>/g, "")).trim()
        : "";

      // Extract Abstract — same nested-tag handling
      const abstractMatches = article.matchAll(
        /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g
      );
      const abstractParts: string[] = [];
      for (const match of abstractMatches) {
        const text = decodeXmlEntities(match[1].replace(/<[^>]+>/g, "")).trim();
        if (text) abstractParts.push(text);
      }
      const abstract =
        abstractParts.join("\n").trim() || "No abstract available.";

      // Build article URL
      const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

      // Extract authors — each <Author> has <LastName> and optionally <Initials>
      const authorMatches = article.matchAll(/<Author[^>]*>([\s\S]*?)<\/Author>/g);
      const authors: string[] = [];
      for (const match of authorMatches) {
        const block = match[1];
        const lastName = block.match(/<LastName>([\s\S]*?)<\/LastName>/)?.[1]?.trim() ?? "";
        const initials = block.match(/<Initials>([\s\S]*?)<\/Initials>/)?.[1]?.trim() ?? "";
        if (lastName) authors.push(initials ? `${lastName} ${initials}` : lastName);
      }

      // Find matched terms
      const content = `${title}\n${abstract}`.toLowerCase();
      const matchedTerms = queryTermsFromQuery(query).filter((term) =>
        content.includes(term.toLowerCase())
      );

      records.push({
        pmid,
        title,
        abstract,
        url,
        authors,
        matched_terms: matchedTerms,
      });
    });
  } catch (error) {
    console.error("Error parsing XML records:", error);
  }

  return records;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

async function fetchPubMedRecords(
  query: string,
  maxResults: number = 5
): Promise<{ records: PubMedRecord[]; totalCount: number }> {
  if (!query) return { records: [], totalCount: 0 };

  try {
    // sort=relevance matches PubMed.gov "Best Match" behaviour; without it
    // esearch defaults to date order and a broad OR query surfaces recent
    // off-topic papers ahead of genuinely relevant ones.
    const searchParams = new URLSearchParams({
      db: "pubmed",
      term: query,
      retmode: "json",
      retmax: String(maxResults),
      sort: "relevance",
    });

    const searchResponse = await fetch(`${ESEARCH_URL}?${searchParams}`, {
      headers: { "User-Agent": "NDAMapper/1.0" },
    });

    if (!searchResponse.ok) {
      throw new Error(`PubMed search failed: ${searchResponse.statusText}`);
    }

    const searchData = (await searchResponse.json()) as {
      esearchresult: { idlist: string[]; count: string };
    };
    const ids = searchData.esearchresult.idlist || [];
    const totalCount = parseInt(searchData.esearchresult.count ?? "0", 10);

    if (!ids.length) return { records: [], totalCount };

    const fetchParams = new URLSearchParams({
      db: "pubmed",
      id: ids.join(","),
      retmode: "xml",
    });

    const fetchResponse = await fetch(`${EFETCH_URL}?${fetchParams}`, {
      headers: { "User-Agent": "NDAMapper/1.0" },
    });

    if (!fetchResponse.ok) {
      throw new Error(`PubMed fetch failed: ${fetchResponse.statusText}`);
    }

    const xmlText = await fetchResponse.text();
    const records = parseXmlRecords(xmlText, query);

    return { records, totalCount };
  } catch (error) {
    console.error("Error fetching PubMed records:", error);
    return { records: [], totalCount: 0 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      descriptions = [],
      query,
      searchType = "combined", // 'combined', 'acronyms', 'terms'
      maxResults = 5,
    } = body;

    let finalQuery = "";

    if (query && descriptions.length > 0) {
      // Hybrid: title+category AND chain plus description terms OR'd together
      const { terms } = buildPubMedQueryFromDescriptions(descriptions);
      finalQuery = terms.length > 0
        ? `${query} AND ${buildOrGroup(terms)}`
        : query;
    } else if (descriptions.length > 0) {
      const { acronyms, terms, allTerms } =
        buildPubMedQueryFromDescriptions(descriptions);

      if (searchType === "acronyms" && acronyms.length > 0) {
        finalQuery = buildOrQuery(acronyms);
      } else if (searchType === "terms" && terms.length > 0) {
        finalQuery = buildOrQuery(terms);
      } else if (searchType === "combined" && allTerms.length > 0) {
        finalQuery = buildOrQuery(allTerms);
      }
    } else if (query) {
      finalQuery = query;
    }

    if (!finalQuery) {
      return NextResponse.json(
        { error: "No search query provided or generated" },
        { status: 400 }
      );
    }

    const { records, totalCount } = await fetchPubMedRecords(finalQuery, maxResults);

    return NextResponse.json({
      query: finalQuery,
      results: records,
      totalCount,
      searchType,
    });
  } catch (error) {
    console.error("Error in PubMed search:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

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

function normalizeQueryTerm(term: string): string {
  return term.trim();
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
    const { query, maxResults = 5 } = body;

    const finalQuery = typeof query === "string"
      ? normalizeQueryTerm(query)
      : "";

    if (!finalQuery) {
      return NextResponse.json(
        { error: "No search query provided" },
        { status: 400 }
      );
    }

    const { records, totalCount } = await fetchPubMedRecords(finalQuery, maxResults);

    return NextResponse.json({
      query: finalQuery,
      results: records,
      totalCount,
    });
  } catch (error) {
    console.error("Error in PubMed search:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

from flask import Flask, render_template, request
import csv
import difflib
import io
import re
import requests
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus
import pandas as pd

app = Flask(__name__)

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

IGNORE_ELEMENT_DESCRIPTIONS = {
    "the ndar global unique identifier (guid) for research subject",
    "subject id how it's defined in lab/project",
    "date on which the interview/genetic test/sampling/imaging/biospecimen was completed. mm/dd/yyyy",
    "age in months at the time of the interview/test/sampling/imaging.",
    "sex of subject at birth",
}

# Metadata patterns that should exclude the entire element from the search query.
EXCLUDED_METADATA_PATTERNS = [
    r"\bguid\b",
    r"\bdate(s)?\b",
    r"\bage\b",
    r"\bvisit\b(?:\s+name)?\b",
    r"\bsubject\b(?:\s+id)?\b",
]

# Words that should be removed from a term before it is used in the final query.
REMOVE_TERM_WORDS = ("percentile", "rank")


def normalize_element_description(term):
    if not term:
        return ""
    normalized = re.sub(r"[^a-z0-9 ]+", " ", term.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def contains_excluded_metadata(term):
    """Return True when a term looks like metadata that should be ignored."""
    text = normalize_element_description(term)
    return any(re.search(pattern, text) for pattern in EXCLUDED_METADATA_PATTERNS)


def clean_term_for_search(term):
    """
    Remove optional noise words from a term before using it in the search query.
    This is intentionally small and easy to extend if more cleanup rules are added.
    """
    if not term:
        return ""

    cleaned = term
    for word in REMOVE_TERM_WORDS:
        cleaned = re.sub(rf"\b{word}\b", " ", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def extract_element_descriptions(file_stream):
    content = file_stream.read()
    if isinstance(content, bytes):
        content = content.decode("utf-8", errors="replace")

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames or "ElementDescription" not in reader.fieldnames:
        raise ValueError("CSV must contain an ElementDescription column.")

    terms = []
    for row in reader:
        value = row.get("ElementDescription", "")
        if not value:
            continue

        cleaned = value.strip()
        normalized = normalize_element_description(cleaned)

        if not cleaned or not normalized:
            continue

        # Skip well-known metadata labels and any values that clearly contain
        # excluded metadata patterns such as GUID, dates, age, or visit names.
        if normalized in IGNORE_ELEMENT_DESCRIPTIONS or contains_excluded_metadata(cleaned):
            continue

        cleaned = clean_term_for_search(cleaned)
        if cleaned and normalize_element_description(cleaned):
            terms.append(cleaned)

    return terms


def longest_common_substring(s1, s2):
    if not s1 or not s2:
        return ""

    lower1 = s1.lower()
    lower2 = s2.lower()
    lengths = [[0] * (len(lower2) + 1) for _ in range(len(lower1) + 1)]
    longest = 0
    end_pos = 0

    for i in range(1, len(lower1) + 1):
        for j in range(1, len(lower2) + 1):
            if lower1[i - 1] == lower2[j - 1]:
                lengths[i][j] = lengths[i - 1][j - 1] + 1
                if lengths[i][j] > longest:
                    longest = lengths[i][j]
                    end_pos = i
            else:
                lengths[i][j] = 0

    return s1[end_pos - longest:end_pos].strip()


class UnionFind:
    def __init__(self, size):
        self.parent = list(range(size))

    def find(self, index):
        if self.parent[index] != index:
            self.parent[index] = self.find(self.parent[index])
        return self.parent[index]

    def union(self, a, b):
        root_a = self.find(a)
        root_b = self.find(b)
        if root_a != root_b:
            self.parent[root_b] = root_a


def cluster_similar_terms(terms):
    unique_terms = []
    seen = set()
    for term in terms:
        if term not in seen:
            seen.add(term)
            unique_terms.append(term)

    size = len(unique_terms)
    if size <= 1:
        return unique_terms

    union_find = UnionFind(size)
    for i in range(size):
        for j in range(i + 1, size):
            ratio = difflib.SequenceMatcher(None, unique_terms[i], unique_terms[j]).ratio()
            if ratio > 0.7:
                union_find.union(i, j)

    groups = {}
    for index, term in enumerate(unique_terms):
        root = union_find.find(index)
        groups.setdefault(root, []).append((index, term))

    results = []
    for root_index in sorted(groups):
        members = groups[root_index]
        if len(members) == 1:
            results.append(members[0][1])
            continue

        sorted_members = sorted(members, key=lambda item: item[0])
        representative = sorted_members[0][1]
        for _, term in sorted_members[1:]:
            lcs = longest_common_substring(representative, term)
            representative = lcs or representative

        representative = representative.strip(" -_:;,.\n\r\t")
        if len(representative) < 3:
            representative = max((member[1] for member in sorted_members), key=len)

        results.append(representative)

    return results


# --- New query-builder helpers (ported from requested implementation) ---

REMOVE_TERMS = [
    "score", "scaled score", "raw score",
    "percentile rank", "percentile",
    "confidence interval", "classification level",
    "significance level", "confidence level",
    "item", "response", "demonstration",
    "selected", "highest value", "lowest value",
    "completed", "date", "time", "TOTAL RAW"
]

EXCLUDE_PATTERNS = [
    r"\bage\b",
    r"\bdate\b",
    r"\btime\b",
    r"confidence level selected",
    r"significance level selected",
    r"difference",
    r"sex",
    r"GUID",
    r"visit name",
    r"Standard",
    r"sum",
    r"assessment name",
    r"\bMAPPED\b",
    r"\bNEED\b",
    r"\bNOT\b",
    r"\bINTERNAL\b",
    r"\bVARIABLE\b",
    r"\bContent\b",
    r"\bScaled\b"
]


def get_longest_common_substring(s1, s2):
    matcher = difflib.SequenceMatcher(None, s1, s2)
    longest_common_string = ""
    max_length = 0
    for block in matcher.get_matching_blocks():
        a, b, size = block.a, block.b, block.size
        if size > max_length:
            max_length = size
            longest_common_string = s1[a : a + size]
    return longest_common_string.strip()


def is_acronym(s):
    acronym = False
    if bool(re.fullmatch(r'\b[a-zA-Z]+\d*_[a-zA-Z0-9_]+\b', s)) or bool(re.fullmatch(r'[A-Z]{2,10}', s)):
      acronym=True

    return acronym


def condense_shared(query_list, ratio=70):
  query_list=sorted(query_list)
  if not query_list:
    return []

  condensed_list = []
  current_consolidated_string = None

  for element in query_list:
    if is_acronym(element):
        if current_consolidated_string is not None:
            if current_consolidated_string and current_consolidated_string not in condensed_list:
                condensed_list.append(current_consolidated_string)
        if element and element not in condensed_list:
            condensed_list.append(element)
        current_consolidated_string = None
        continue

    if current_consolidated_string is None:
      current_consolidated_string = element
    else:
      matcher = difflib.SequenceMatcher(None, current_consolidated_string, element)
      similarity_ratio = matcher.ratio()
      similarity_percentage = similarity_ratio * 100

      if similarity_percentage > ratio:
        current_consolidated_string = get_longest_common_substring(current_consolidated_string, element)
      else:
        if current_consolidated_string and current_consolidated_string not in condensed_list:
            condensed_list.append(current_consolidated_string)
        current_consolidated_string = element

  if current_consolidated_string is not None:
    if current_consolidated_string and current_consolidated_string not in condensed_list:
        condensed_list.append(current_consolidated_string)

  return condensed_list


def should_exclude(text):
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return True

    return False


def extract_acronyms(text):
    return re.findall(r'\b[A-Z]{2,10}\b', text)


def extract_variable_names(text):
    return re.findall(r'\b[a-zA-Z]+\d*_[a-zA-Z0-9_]+\b', text)


def clean_description(text):

    cleaned = text

    for term in REMOVE_TERMS:
        cleaned = re.sub(
            re.escape(term),
            "",
            cleaned,
            flags=re.IGNORECASE
        )

    cleaned = re.sub(r'\b\d+\b', '', cleaned)

    cleaned = re.sub(r'[:;(),]', ' ', cleaned)

    cleaned = re.sub(r'\s+', ' ', cleaned)

    cleaned = re.sub(r'\.', '', cleaned)

    return cleaned.strip()


def extract_concepts(text):

    concepts = []
    pieces = re.split(
        r'\b(?:vs\.?|versus|minus|contrast)\b',
        text,
        flags=re.IGNORECASE
    )

    for piece in pieces:

        piece = clean_description(piece)

        if len(piece) < 3:
            continue

        concepts.append(piece)

    return concepts


def build_pubmed_query_from_stream(file_stream):
    # Read into pandas from the provided file-like object
    file_stream.seek(0)
    df = pd.read_csv(file_stream)

    if "ElementDescription" not in df.columns:
        raise ValueError("CSV must contain column named ElementDescription")

    temp_acronyms = set()
    temp_variable_names = set()
    temp_concepts = set()

    for desc in df["ElementDescription"].dropna():
        desc = str(desc)
        if should_exclude(desc):
            continue

        temp_variable_names.update(extract_variable_names(desc))
        temp_acronyms.update(extract_acronyms(desc))
        temp_concepts.update(extract_concepts(desc))

    search_terms = set()
    search_terms.update(temp_variable_names)

    for concept in temp_concepts:
        preferred_term = concept
        for acronym in temp_acronyms:
            if re.search(r'\b' + re.escape(acronym) + r'\b', concept, re.IGNORECASE):
                preferred_term = acronym
                break
        search_terms.add(preferred_term)

    search_terms.update(temp_acronyms)

    search_terms = {
        x.strip()
        for x in search_terms
        if len(x.strip()) > 2 and not should_exclude(x)
    }

    shared_strings=condense_shared(search_terms, ratio=70)
    shared_all=condense_shared(shared_strings, ratio=70)
    shared_all = sorted(list(set(shared_all)))
    shared_all = [s for s in shared_all if len(s) <= 40]

    shared_acronyms = [s for s in shared_all if is_acronym(s)]
    shared_terms = [s for s in shared_all if not is_acronym(s)]

    return search_terms, shared_all, shared_acronyms, shared_terms



def build_or_query(terms):
    quoted_items = ['"{}"'.format(term.replace('"', '')) for term in terms]
    return " OR ".join(quoted_items)


def pubmed_search_link(query):
    return f"https://pubmed.ncbi.nlm.nih.gov/?term={quote_plus(query)}"


def fetch_pubmed_records(query, max_results=5):
    if not query:
        return []

    search_params = {
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": str(max_results),
    }
    response = requests.get(ESEARCH_URL, params=search_params, timeout=20)
    response.raise_for_status()
    data = response.json()
    ids = data.get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []

    fetch_params = {
        "db": "pubmed",
        "id": ",".join(ids),
        "retmode": "xml",
    }
    response = requests.get(EFETCH_URL, params=fetch_params, timeout=20)
    response.raise_for_status()

    root = ET.fromstring(response.text)
    records = []
    for article in root.findall(".//PubmedArticle"):
        pmid = article.findtext(".//PMID") or ""
        title = article.findtext(".//ArticleTitle") or ""

        abstract_texts = []
        for abstract_text in article.findall(".//AbstractText"):
            text_value = (abstract_text.text or "").strip()
            if text_value:
                abstract_texts.append(text_value)

        abstract = "\n".join(abstract_texts).strip() or "No abstract available."
        article_url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"

        content = f"{title}\n{abstract}".lower()
        matched_terms = [term for term in query_terms_from_query(query) if term.lower() in content]

        records.append({
            "pmid": pmid,
            "title": title,
            "abstract": abstract,
            "url": article_url,
            "matched_terms": matched_terms,
        })

    return records


def query_terms_from_query(query):
    parts = [part.strip() for part in query.split(" OR ") if part.strip()]
    terms = []
    for part in parts:
        if part.startswith('"') and part.endswith('"'):
            terms.append(part[1:-1])
        else:
            terms.append(part)
    return terms


def clean_name(name):
    text = name
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\[[^\]]*\]", " ", text)

    edition_words = r"first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth"
    text = re.sub(rf"\b(?:\d+(?:st|nd|rd|th)|{edition_words})\s+edition\b", " ", text, flags=re.I)
    text = re.sub(rf"\bedition\s+(?:\d+(?:st|nd|rd|th)?|{edition_words})\b", " ", text, flags=re.I)
    text = re.sub(r"\b\d+(?:st|nd|rd|th)\s+ed\b", " ", text, flags=re.I)

    tokens = text.split()
    tokens = [token for token in tokens if not (len(token) >= 2 and token.isupper())]
    text = " ".join(tokens)
    text = re.sub(r"[^A-Za-z0-9 \-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


@app.route("/", methods=["GET", "POST"])
def index():
    error = None
    results = None
    search_query = ""
    cleaned_name = ""
    name_search_link = ""
    query_acronyms = ""
    query_terms = ""
    acronym_search_link = ""
    terms_search_link = ""

    if request.method == "POST":
        csv_file = request.files.get("csv_file")
        name = request.form.get("name", "").strip()

        # Require at least one input: CSV or name
        if (not csv_file or not getattr(csv_file, 'filename', None)) and not name:
            error = "Please upload a CSV file or enter a name."
        else:
            try:
                # If a CSV was provided, build queries from it and run searches
                if csv_file and getattr(csv_file, 'filename', None):
                    search_terms, shared_all, shared_acronyms, shared_terms = build_pubmed_query_from_stream(csv_file.stream)

                    query_acronyms = " OR ".join(f'"{term}"' for term in sorted(shared_acronyms))
                    query_terms_query = " OR ".join(f'"{term}"' for term in sorted(shared_terms))

                    acronym_search_link = pubmed_search_link(query_acronyms) if query_acronyms else ""
                    terms_search_link = pubmed_search_link(query_terms_query) if query_terms_query else ""

                    results_acronyms = fetch_pubmed_records(query_acronyms) if query_acronyms else []
                    results_terms = fetch_pubmed_records(query_terms_query) if query_terms_query else []

                    # Provide top-level combined search_query for template
                    search_query = " OR ".join(f'"{t}"' for t in sorted(shared_all))
                    query_terms = query_terms_query

                    # Initialize results dict with CSV-derived results
                    results = {
                        "acronyms": results_acronyms,
                        "terms": results_terms,
                    }

                # If a name was provided, always run name search (in addition to CSV searches if present)
                if name:
                    cleaned_name = clean_name(name)
                    name_search_link = pubmed_search_link(cleaned_name) if cleaned_name else ""
                    results_name = fetch_pubmed_records(f'"{cleaned_name}"') if cleaned_name else []

                    # Ensure results dict exists and include name results
                    if results is None:
                        results = {}
                    results["name"] = results_name
            except Exception as exc:
                error = str(exc)

    return render_template(
        "index.html",
        error=error,
        results=results,
        search_query=search_query,
        cleaned_name=cleaned_name,
        name_search_link=name_search_link,
        query_acronyms=query_acronyms,
        query_terms=query_terms,
        acronym_search_link=acronym_search_link,
        terms_search_link=terms_search_link,
    )


if __name__ == "__main__":
    app.run(debug=True)

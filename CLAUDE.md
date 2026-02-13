# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NDA Data Structure Validator - A Next.js web application for exploring NIMH Data Archive (NDA) data structures and validating CSV files against NDA requirements. The app fetches real-time data from NDA APIs and integrates with an IMPACT-MH backend database.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

Development server runs at http://localhost:3000

## Architecture

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, Tailwind CSS, Lucide icons
- **APIs**: NDA public API, IMPACT-MH backend API

### Application Structure

The app has 4 main features/tabs:
1. **Data Dictionary** (`DataCategorySearch`) - Search structures by category/data type tags and research partners
2. **Data Structures** (`DataStructureSearch`) - Search and view structure details
3. **Data Elements** (`DataElementSearch`) - Search by field/element names
4. **Reverse Lookup** (`CSVHeaderAnalyzer`) - Find structures from CSV headers

Navigation flow: Users typically start at Data Dictionary → select a structure → validate CSV against it.

### Key Components

**`src/app/components/HomePage.js`**
- Main orchestrator component managing all tab state and data fetching
- Handles database filtering toggle (filters NDA results to IMPACT-MH database)
- Coordinates navigation between tabs
- Manages shared state: search terms, selected structure, CSV file, validation results

**`src/app/components/DataStructureSearch.js`**
- Primary search interface for finding data structures
- Displays structure metadata and data elements
- Integrates CSV validation when a file is uploaded
- Shows category/data type tags for each structure

**`src/app/components/CSVValidator.js`**
- Validates uploaded CSV files against selected structure
- Maps CSV headers to expected data elements
- Validates cell values against type/range requirements
- Auto-standardizes common formats (handedness, binary Y/N values)
- Generates downloadable corrected CSV

**`src/app/components/CSVHeaderAnalyzer.js`**
- Reverse lookup: analyzes CSV headers to suggest matching structures
- Scores matches based on header overlap
- Enables "Element to Structure" workflow

### API Integration

**External APIs:**
- **NDA API** (`https://nda.nih.gov/api`) - Public NDA data dictionary
  - `/datadictionary/v2/datastructure` - Search structures
  - `/datadictionary/datastructure/{shortName}` - Get structure details
  - `/datadictionary/datastructure/dataElement/{field}` - Find element
- **IMPACT-MH API** (`https://nda.impact-mh.org/api/v1`) - Backend database
  - `/data-structures` - Get database structures and elements
  - `/tags` - Get custom category/data type tags
  - `/tags/{id}/dataStructures` - Get structures with specific tag

**Local API Routes** (`src/app/api/v1/`)
- Proxy routes to IMPACT-MH backend
- Handle CORS and caching
- Use custom HTTPS client (`src/lib/api-client.js`) that accepts self-signed certificates

### Utilities

**`src/utils/csvUtils.js`**
- CSV parsing with proper quote handling
- Used throughout CSV processing pipeline

**`src/utils/valueValidation.js`**
- Parses NDA value range specifications (e.g., "0::9999; -777; -999")
- Validates cell values against type and range constraints
- Handles both numeric ranges and categorical enums

**`src/utils/valueStandardization.js`**
- Normalizes common data formats (handedness: L/R/A, binary: Y/N/1/0)
- Transforms values to match NDA requirements
- Tracks transformation counts for user visibility

**`src/utils/fetchWithTimeout.js`**
- Wrapper for fetch with timeout handling
- Used for external API calls

### Data Flow Patterns

**Search Flow:**
1. User enters search term in HomePage tab
2. HomePage fetches matching structures from NDA API
3. Search matches against: shortName, title, categories, dataTypes, and research partners (submittedByProjects)
4. If database filter enabled, filter results to structures in IMPACT-MH database
5. Results sorted by relevance (exact match → partial match)
6. User selects structure → fetches full data elements

**Validation Flow:**
1. User uploads CSV and selects structure
2. CSVValidator parses headers and data
3. Maps CSV headers to structure's data elements (fuzzy matching)
4. Validates each cell value against element's type/range
5. Standardizes values where possible
6. Shows errors and allows download of corrected CSV

**Category/Tag Searches:**
- Format: `category:{name}` or `datatype:{name}`
- First checks for custom IMPACT-MH tags
- Falls back to NDA native categories/data types
- Supports both built-in NDA taxonomies and user-defined tags

### Database Filtering

The app includes a toggle to filter all searches to only structures present in the IMPACT-MH database:
- When enabled, fetches all database structures once on mount
- Filters NDA API results to only matching structures
- Extracts all unique data elements for element search
- Shows connection errors if IMPACT-MH API unavailable

## Important Notes

- All searches use debouncing (300ms) to avoid excessive API calls
- The app defaults to Data Dictionary tab on every page load/refresh
- Structure searches handle both shortName and title matching with normalization (removes hyphens/underscores)
- Data Dictionary search includes research partners: typing a research partner name (e.g., "JASPer") returns all associated structures
- Research partner search uses case-insensitive partial matching against `submittedByProjects` field from IMPACT-MH database
- CSV validation performs automatic value standardization and tracks transformations
- Custom tags in IMPACT-MH database override NDA native category/datatype searches
- API routes include 5-minute caching to reduce backend load

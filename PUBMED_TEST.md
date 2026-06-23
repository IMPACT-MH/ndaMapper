# PubMed Search Integration - Testing Guide

## Implementation Complete ✅

### Files Created/Modified
1. ✅ `src/app/api/v1/research/pubmed/route.ts` - Backend API for PubMed search
2. ✅ `src/app/components/PubMedSearchPanel.tsx` - Frontend UI component
3. ✅ `src/app/components/DataStructureSearch.tsx` - Integrated component

### How to Test

#### Step 1: Start Development Server
```bash
npm run dev
```
The app will run at `http://localhost:3000`

#### Step 2: Navigate to Data Structures
1. Click on the "Data Structures" tab
2. Search for a data structure (e.g., "core", "NDA")
3. Select a structure from the results

#### Step 3: View Data Elements
1. The selected structure details will display
2. Scroll down to the "Data Elements" table
3. Below the table, you'll see the "PubMed Search" collapsible section

#### Step 4: Perform a Search
1. Click "PubMed Search" to expand the panel
2. Choose a search type:
   - **Combined**: Searches all extracted terms (default)
   - **Acronyms**: Only searches uppercase acronyms
   - **Terms**: Only searches regular text terms
3. Click "Search PubMed"
4. Wait for results (may take 3-5 seconds)

#### Step 5: View Results
- Results show as expandable cards
- Click on a result to see the full abstract
- Yellow badges show matched search terms
- Click "View on PubMed" to open the full article

### Example Test Cases

#### Test Case 1: Basic Search
- **Structure**: "ADHD_RS" (ADHD Rating Scale)
- **Expected**: Should find PubMed articles about ADHD rating scales
- **Search Type**: Combined

#### Test Case 2: Acronym Search
- **Structure**: Any structure with many acronyms
- **Expected**: Only acronyms extracted and searched
- **Search Type**: Acronyms only

#### Test Case 3: Empty Results
- **Structure**: "GUID" (contains mostly metadata)
- **Expected**: May return few or no results (filtered out)
- **Search Type**: Any

### Troubleshooting

#### Issue: "No search query provided or generated"
- **Cause**: Data elements don't contain searchable terms
- **Solution**: Select a structure with more descriptive elements

#### Issue: API Returns 500 Error
- **Cause**: PubMed API may be rate limited
- **Solution**: Wait a moment and try again

#### Issue: No Results Returned
- **Cause**: Search terms don't match any PubMed articles
- **Solution**: Try a different search type (combined vs acronyms vs terms)

### Implementation Details

#### Search Logic
The PubMed search extracts terms from data element descriptions:
- Removes common noise words (score, percentile, date, etc.)
- Filters metadata patterns (age, date, visit, subject id)
- Extracts acronyms (e.g., ADHD, CBT)
- Extracts variable names (e.g., item_01, response_type)
- Extracts concepts by splitting on comparison words (vs, versus, minus)
- Condenses similar terms for better results

#### API Flow
1. Frontend sends data element descriptions to `/api/v1/research/pubmed`
2. Backend extracts and condenses search terms
3. Backend queries PubMed ESEARCH API (gets PMIDs)
4. Backend fetches details via EFETCH API (gets titles/abstracts)
5. Backend returns formatted results with matched terms highlighted

### Performance Notes
- First search may take 3-5 seconds (PubMed API latency)
- Subsequent searches are faster
- Maximum 5 results per search (configurable)
- Component only renders when data elements are available

### Browser Console
Open browser DevTools (F12) to see:
- Request/response timing to PubMed API
- Any parsing errors or API failures
- Search term extraction debugging

## Ready for Use! 🚀

The PubMed integration is fully functional and ready to be tested. Start the dev server and navigate through the Data Structures tab to try it out.

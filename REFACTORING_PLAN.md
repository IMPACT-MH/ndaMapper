# DataCategorySearch.js Refactoring Plan

## Critical Issues Found

### 1. **Performance Issues**

#### Problem: `combinedMap` recalculated on every render
**Location:** Lines 147-177
```javascript
const combinedMap = new Map(); // Created on EVERY render!
```

**Fix:** Use `useMemo` to memoize this expensive computation:
```javascript
const combinedAvailableCategories = useMemo(() => {
    const combinedMap = new Map();
    // ... rest of logic
    return Array.from(combinedMap.values());
}, [filteredAvailableTags, filteredNdaCategories, availableTags]);
```

#### Problem: Multiple useEffect hooks that could cause race conditions
**Location:** Lines 179-347
- Multiple independent useEffect hooks fetching data
- No cleanup or cancellation tokens
- Potential race conditions if component unmounts during fetch

**Fix:** Combine related fetches, add cleanup:
```javascript
useEffect(() => {
    const abortController = new AbortController();
    
    const fetchAll = async () => {
        await Promise.all([
            fetchDataStructures(abortController.signal),
            fetchTags(abortController.signal),
            fetchRemovedItems(abortController.signal)
        ]);
    };
    
    fetchAll();
    return () => abortController.abort();
}, []);
```

### 2. **Error Handling Issues**

#### Problem: Silent failures
**Location:** Lines 232, 296
```javascript
if (!response.ok) return; // Silent failure - no error logged!
```

**Fix:** Always log errors and set error state:
```javascript
if (!response.ok) {
    console.error(`API error: ${response.status} ${response.statusText}`);
    setError(`Failed to fetch: ${response.statusText}`);
    return;
}
```

#### Problem: JSON parsing without try-catch
**Location:** Multiple locations (lines 234, 297, 400, etc.)
```javascript
const data = await response.json(); // Could throw!
```

**Fix:** Wrap in try-catch:
```javascript
let data;
try {
    data = await response.json();
} catch (err) {
    console.error('Failed to parse JSON:', err);
    setError('Invalid response from server');
    return;
}
```

#### Problem: Missing null/undefined checks
**Location:** Throughout the file
- `structure.shortName?.toLowerCase()` - good
- But many places assume arrays exist: `structure.categories.forEach()` without checking

**Fix:** Add comprehensive null checks:
```javascript
(structure.categories || []).forEach(...)
```

### 3. **State Management Issues**

#### Problem: Too many useState calls (30+)
**Location:** Lines 27-129

**Fix:** Consolidate related state:
```javascript
// Instead of separate states for modal
const [modal, setModal] = useState({
    isCategoriesOpen: false,
    isDataTypesOpen: false,
    structure: null,
    searchTerm: "",
    error: null,
    loading: false
});

// Instead of separate tag states
const [tags, setTags] = useState({
    categories: {
        available: [],
        selected: new Set(),
        newName: "",
        showCreate: false,
        editing: { id: null, name: "" }
    },
    dataTypes: {
        available: [],
        selected: new Set(),
        newName: "",
        showCreate: false,
        editing: { id: null, name: "" }
    }
});
```

#### Problem: Inconsistent Set vs Array usage
**Location:** Throughout
- `selectedSocialTags` is Set
- `selectedNdaCategories` is Set
- But `selectedSocialTags` was changed to Array in some places, Set in others

**Fix:** Standardize on one approach. Recommendation: Use Set for selections (better performance for lookups).

### 4. **Code Duplication**

#### Problem: Similar logic for categories and data types
**Location:** Multiple locations
- `createTag` vs `createDataTypeTag` (lines 1260-1305, 1307-1352)
- `fetchTags` vs `fetchDataTypeTags` (lines 1212-1234, 1236-1258)
- Modal rendering logic duplicated

**Fix:** Create generic functions:
```javascript
const useTagManagement = (tagType) => {
    const [available, setAvailable] = useState([]);
    const [selected, setSelected] = useState(new Set());
    // ... shared logic
    
    const createTag = async (name) => {
        // Generic create logic
    };
    
    return { available, selected, createTag, ... };
};

// Usage:
const categoryTags = useTagManagement('Category');
const dataTypeTags = useTagManagement('Data Type');
```

### 5. **API Call Patterns**

#### Problem: Repeated fetch patterns without abstraction
**Location:** Throughout

**Fix:** Create API utility:
```javascript
const apiCall = async (endpoint, options = {}) => {
    try {
        const response = await fetch(`${apiBaseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (err) {
        console.error(`API call failed [${endpoint}]:`, err);
        throw err;
    }
};
```

### 6. **Edge Cases Not Handled**

#### Problem: Missing validations
- Empty API responses
- Malformed tag names
- Duplicate tag creation
- Race conditions on rapid clicks

**Fix:** Add validation helpers:
```javascript
const validateTagName = (name) => {
    if (!name || !name.trim()) {
        throw new Error('Tag name cannot be empty');
    }
    if (name.length > 100) {
        throw new Error('Tag name too long');
    }
    if (name.includes(':')) {
        throw new Error('Tag name cannot contain colons');
    }
    return name.trim();
};
```

### 7. **Memory Leaks**

#### Problem: No cleanup in useEffect
**Location:** Lines 328-334
```javascript
useEffect(() => {
    const timer = setTimeout(() => {
        fetchStructureTags();
    }, 500);
    return () => clearTimeout(timer); // Good!
}, []);
```

But other useEffects don't have cleanup for:
- AbortControllers
- Event listeners
- Intervals

### 8. **Type Safety**

#### Problem: No TypeScript or PropTypes
**Fix:** Add PropTypes or migrate to TypeScript:
```javascript
DataCategorySearch.propTypes = {
    onStructureSelect: PropTypes.func.isRequired,
    databaseFilterEnabled: PropTypes.bool,
    // ...
};
```

## Recommended Refactoring Steps

### Phase 1: Critical Fixes (Do First)
1. ✅ Add `useMemo` for `combinedAvailableCategories`
2. ✅ Add error handling to all API calls
3. ✅ Add null checks throughout
4. ✅ Fix silent failures

### Phase 2: State Consolidation
1. ✅ Consolidate modal state
2. ✅ Consolidate tag state
3. ✅ Standardize Set vs Array usage

### Phase 3: Code Deduplication
1. ✅ Extract custom hooks for tag management
2. ✅ Create API utility functions
3. ✅ Extract common modal logic

### Phase 4: Performance & Safety
1. ✅ Add memoization where needed
2. ✅ Add cleanup to all useEffects
3. ✅ Add validation helpers
4. ✅ Add PropTypes or TypeScript

## Example Refactored Code Structure

```javascript
// hooks/useTagManagement.js
export const useTagManagement = (tagType) => {
    // Shared tag management logic
};

// hooks/useModal.js
export const useModal = () => {
    // Shared modal state management
};

// utils/api.js
export const apiCall = async (endpoint, options) => {
    // Centralized API calls with error handling
};

// utils/validation.js
export const validateTagName = (name) => {
    // Validation logic
};

// components/DataCategorySearch.js
const DataCategorySearch = ({ ...props }) => {
    const categoryTags = useTagManagement('Category');
    const dataTypeTags = useTagManagement('Data Type');
    const modal = useModal();
    
    // Much cleaner component
};
```


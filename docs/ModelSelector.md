# ModelSelector Component Documentation

## Overview

The `ModelSelector` is a React component that provides a two-step dropdown interface for selecting AI models and their providers. It displays models grouped by name and allows users to choose specific provider endpoints for each model.

**Location:** [src/components/chat/ModelSelector.tsx](../src/components/chat/ModelSelector.tsx)

## Purpose

The component solves the problem of selecting from models that may be available through multiple providers. Instead of showing a flat list of all provider/model combinations, it:

1. First shows available model names
2. Then shows available providers for the selected model
3. Automatically skips provider selection if only one provider offers the model

## Component Interface

### Props

```typescript
interface ModelSelectorProps {
  selectedModel: string;      // Currently selected model ID (can be "modelName" or "provider/modelName")
  onModelChange?: (modelId: string) => void;  // Callback when model selection changes
}
```

### Usage Example

```tsx
<ModelSelector
  selectedModel="gpt-4"
  onModelChange={(modelId) => console.log('Selected:', modelId)}
/>
```

## Data Structure

### Dependencies

The component relies on:

- **LocalModelsContext**: Provides the list of available models
- **LocalModel type**: Defines the structure of model data
- **ModelProviderInfo type**: Defines provider endpoint information

### Model ID Format

The component handles two model ID formats:

1. **Simple format**: `"modelName"` (e.g., `"gpt-4"`)
2. **Full format**: `"provider/modelName"` (e.g., `"openai/gpt-4"`)

## Internal State

```typescript
const [open, setOpen] = useState(false);                    // Controls dropdown visibility
const [currentStep, setCurrentStep] = useState<'model' | 'provider'>('model'); // Navigation step
const [searchTerm, setSearchTerm] = useState('');          // Search filter text
```

## Core Logic

### 1. Model Information Resolution

**selectedModelInfo** (lines 29-43):
- Parses the `selectedModel` prop to extract the model name
- Handles both simple and full format IDs
- Finds matching model from the models list
- Returns `LocalModel` object or `undefined`

```typescript
// Example: "openai/gpt-4" → finds model with model === "gpt-4"
// Example: "gpt-4" → finds model with model === "gpt-4"
```

### 2. Provider Information Resolution

**selectedProvider** (lines 44-56):
- Only applicable when `selectedModel` is in full format (contains `/`)
- Extracts provider name from the full model ID
- Searches the model's endpoints array for matching provider
- Returns `ModelProviderInfo` or `undefined`

### 3. Icon Resolution

**getIconForModel** (lines 58-68):
- Determines which icon to display for a model
- For full format IDs: uses the provider name
- For simple format IDs: uses the model's default provider (`model_provider`)

### 4. Model Grouping

**modelNameGroups** (lines 71-78):
- Creates a map of model names to their full model objects
- Key: model name (e.g., `"gpt-4"`)
- Value: `LocalModel` object

### 5. Filtering

**filteredModelNames** (lines 81-86):
- Filters model names based on search term
- Case-insensitive matching
- Returns empty array if no matches

**filteredProviders** (lines 89-98):
- Filters providers for the currently selected model
- Only active in provider selection step
- Case-insensitive matching on provider name

## User Flow

### Step 1: Model Selection

1. User opens dropdown (shows model list)
2. Search bar displays "Search models..."
3. User can:
   - Browse available models
   - Search by typing
   - See provider count for each model

### Step 2: Provider Selection

1. User clicks on a model name
2. Component checks if model has multiple providers:
   - **Single provider**: Automatically selects and closes (line 110-113)
   - **Multiple providers**: Shows provider selection view
3. Header shows "Back" button to return to model list
4. Search bar displays "Search providers..."
5. User selects a provider

### Auto-Skip Logic

```typescript
if (availableModels.endpoints?.length === 1) {
  handleModelSelect(modelName);  // Skip provider selection
  return;
}
```

This optimization improves UX when there's no choice to be made.

## Event Handlers

### handleModelNameSelect (lines 106-117)
- Called when user clicks a model name
- Checks if provider selection is needed
- Updates parent component via `onModelChange`
- Transitions to provider step if needed

### handleModelSelect (lines 100-104)
- Final selection handler
- Calls `onModelChange` callback
- Closes dropdown
- Clears search term

### handleBack (lines 119-122)
- Returns from provider view to model view
- Resets to step 1
- Clears search term

### handleOpenChange (lines 124-129)
- Controls dropdown open/closed state
- Clears search on close

## UI Structure

### Trigger Button
```
[Icon] [Model Name] [Chevron]
```
- Shows current model's provider icon
- Displays model name (without provider prefix if in full format)
- Chevron rotates when dropdown is open
- Fixed width: 200px with text truncation

### Dropdown Content

**Header (Provider step only)**:
- Back button with left chevron
- Selected provider name

**Search Input**:
- Always visible
- Auto-focused when opened
- Context-aware placeholder text

**Content Area**:
- Max height: 320px (80 * 4)
- Scrollable if content exceeds height
- Conditional rendering based on `currentStep`

### Model List Item
```
┌─────────────────────────────────┐
│ Model Name              →       │
│ X provider(s)                   │
└─────────────────────────────────┘
```

### Provider List Item
```
┌─────────────────────────────────┐
│ [Icon] Provider Name            │
│        provider                  │
└─────────────────────────────────┘
```
- Selected provider has accent background (`bg-accent/50`)

## Utility Functions

### getModelFullName
**Location**: [src/utils/model-fullname.ts](../src/utils/model-fullname.ts:6)

```typescript
export const getModelFullName = (
  model: LocalModel,
  provider: ModelProviderInfo
) => {
  return `${provider.provider.provider}/${model.model}`;
};
```

Constructs the full model identifier in the format `"provider/modelName"`.

## Styling

The component uses:
- **Tailwind CSS** for styling
- **shadcn/ui DropdownMenu** components
- **Theme variables** (foreground, background, muted-foreground, etc.)
- **Responsive text truncation** for long names
- **Smooth transitions** for interactive elements

### Key CSS Classes
- `text-muted-foreground`: Subtle text color
- `hover:text-foreground`: Darker on hover
- `truncate`: Text overflow ellipsis
- `transition-transform`: Smooth animations

## Dependencies

### External Libraries
- `react`: Core framework
- `lucide-react`: Icon library (ChevronDown, ChevronLeft, ChevronRight)

### Internal Modules
- `@/contexts/LocalModelsContext`: Model data provider
- `@/components/Icons/ProviderIcons`: Provider-specific icons
- `@/components/ui/dropdown-menu`: Base dropdown UI components
- `@/types/models`: TypeScript type definitions
- `@/utils/model-fullname`: Utility for formatting model names

## Performance Optimizations

1. **useMemo hooks**: All expensive computations are memoized
   - Model info lookup (line 29)
   - Provider info lookup (line 44)
   - Model grouping (line 71)
   - Filtering operations (lines 81, 89)

2. **useCallback**: `handleModelNameSelect` and `getIconForModel` are memoized to prevent unnecessary re-renders

3. **Conditional rendering**: Only renders the current step's content

## Edge Cases Handled

1. **No models available**: Shows "No models found" message
2. **No providers available**: Shows "No providers found" message
3. **Single provider**: Auto-selects without showing provider step
4. **Empty search results**: Shows appropriate "not found" message
5. **Missing model info**: Safe fallback with `undefined` checks

## Type Safety

The component uses TypeScript with strict types:
- All props are typed via `ModelSelectorProps`
- Model and provider data use defined interfaces
- Optional chaining (`?.`) prevents runtime errors
- Type guards ensure data validity

## Accessibility Considerations

- Auto-focus on search input when dropdown opens
- Keyboard navigation support via DropdownMenu component
- Clear visual feedback for selected items
- Semantic HTML structure
- Descriptive text for screen readers (provider count)

## Known Limitations

1. **Search scope**: Search only matches against names, not descriptions or other metadata
2. **No keyboard shortcuts**: No hotkeys for quick selection
3. **No favorites**: Cannot pin frequently used models
4. **No recents**: No history of recently selected models
5. **Fixed width**: Trigger button is fixed at 200px which may truncate very long names

## Future Enhancement Opportunities

1. Add keyboard shortcuts (e.g., "/" to focus search)
2. Implement favorites/pinning system
3. Show recently selected models at the top
4. Add model metadata in tooltips (context size, pricing, etc.)
5. Support multi-select for comparison features
6. Add "Set as default" option
7. Include model availability status indicators
8. Add loading states for async operations

# Datasets Page Documentation

## Overview

The Datasets page (`/datasets`) provides a unified interface for managing span collections with integrated AI assistance. Users can create, view, edit, and delete datasets containing spans that they've selected from the Traces or Threads views.

**Key Features:**
- Two-column layout with Lucy AI assistant on the left and datasets list on the right
- Create, rename, and delete datasets
- View and manage individual records within datasets
- Inline topic editing for records
- Sort records by timestamp, topic, or evaluation (via toolbar or clickable column headers)
- Click-to-expand record data with Monaco JSON editor for viewing and editing
- Context-aware AI assistance with Lucy

**Route:** `/datasets`

---

## Architecture

### Page Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              /datasets                                        │
├───────────────────────────┬──────────────────────────────────────────────────┤
│                           │                                                  │
│   Lucy Chat Panel         │        Datasets List Panel                       │
│   (384px fixed width)     │        (flexible width, scrollable)              │
│                           │                                                  │
│   ┌───────────────────┐   │   ┌──────────────────────────────────────────┐   │
│   │ Lucy Assistant    │   │   │ 🗄️ Datasets         [🔍 Search...]      │   │
│   │ BETA              │   │   │ Manage and monitor...    [+ New Dataset] │   │
│   │ [+ New Chat]      │   │   ├──────────────────────────────────────────┤   │
│   ├───────────────────┤   │   │ ▼ Safety Test Suite          124 records │   │
│   │                   │   │   │   openai  kilo_code_1  Topic: SAFETY     │   │
│   │  LucyChat         │   │   │   openai  kilo_code_2  Topic: JAILBREAK  │   │
│   │  Component        │   │   │   anthropic kilo_code_3  Topic: none     │   │
│   │  (quick actions)  │   │   │   ...                                    │   │
│   │                   │   │   │             See all 124 records →        │   │
│   │                   │   │   │                                          │   │
│   │                   │   │   │ ▶ RAG Accuracy Logs        1,402 records │   │
│   │                   │   │   │ ▶ Latency Benchmarks          45 records │   │
│   └───────────────────┘   │   └──────────────────────────────────────────┘   │
│                           ├──────────────────────────────────────────────────┤
│                           │ ● Active: 12  ● Records: 12.4k  ☁ Sync  Project │
└───────────────────────────┴──────────────────────────────────────────────────┘
```

### Component Hierarchy

```
DatasetsPage
├── Left Panel (384px)
│   ├── Lucy Header (LucyAvatar + "Lucy Assistant" + Beta badge + New Chat)
│   └── LucyChat / LucyProviderCheck / Loading states
│
└── Right Panel (flex-1, overflow-hidden)
    ├── Scrollable Content Area
    │   ├── Page Header
    │   │   ├── Icon + Title + Subtitle
    │   │   ├── Search Input
    │   │   └── New Dataset Button
    │   ├── Loading / Error / Empty / No Results states
    │   └── Dataset List
    │       └── Dataset Card (expandable)
    │           ├── Header (chevron, name, record count, actions dropdown)
    │           └── Records List (when expanded, max 5 visible)
    │               ├── Record Row (provider badge, name, topic badge, eval placeholder, delete)
    │               └── "See all X records →" link (if > 5 records)
    │
    └── Footer Status Bar (fixed)
        ├── Active Datasets count
        ├── Total Records Indexed
        ├── Sync Status
        └── Workspace name
```

---

## File Structure

### Primary Files

| File | Purpose |
|------|---------|
| `ui/src/pages/datasets/index.tsx` | Main page component with Lucy integration |
| `ui/src/hooks/useDatasets.ts` | React hook for IndexedDB operations |
| `ui/src/services/datasets-db.ts` | Low-level IndexedDB service |
| `ui/src/types/dataset-types.ts` | TypeScript interfaces |
| `ui/src/components/datasets/AddToDatasetDialog.tsx` | Dialog for adding spans to datasets |
| `ui/src/components/datasets/DatasetDetailView.tsx` | Full dataset view with records table |
| `ui/src/components/datasets/RecordsTable.tsx` | Virtualized records table with sorting |
| `ui/src/components/datasets/RecordsToolbar.tsx` | Toolbar with search, sort, and bulk actions |
| `ui/src/components/datasets/RecordRow.tsx` | Individual record row component |
| `ui/src/components/datasets/cells/DataCell.tsx` | Clickable data preview cell |
| `ui/src/components/datasets/cells/TopicCell.tsx` | Inline-editable topic cell |
| `ui/src/components/datasets/cells/EvaluationCell.tsx` | Evaluation display cell |
| `ui/src/components/datasets/cells/TimestampCell.tsx` | Timestamp display cell |

### Related Files

| File | Purpose |
|------|---------|
| `ui/src/components/chat/traces/TraceRow/span-info/SpanFooter.tsx` | Shows datasets a span belongs to |
| `ui/src/components/agent/useAgentChat.ts` | Shared Lucy agent chat state |
| `ui/src/components/agent/lucy-agent/LucyChat.tsx` | Lucy chat component |
| `ui/src/components/agent/lucy-agent/LucyWelcome.tsx` | Quick actions component |

---

## Data Models

### Dataset Interface

```typescript
// File: ui/src/types/dataset-types.ts

export interface Dataset {
  id: string;              // UUID (crypto.randomUUID())
  name: string;            // User-provided name (required)
  createdAt: number;       // Timestamp in milliseconds
  updatedAt: number;       // Timestamp in milliseconds
}
```

### DatasetRecord Interface

```typescript
// File: ui/src/types/dataset-types.ts

export interface DatasetRecord {
  id: string;              // UUID (crypto.randomUUID())
  datasetId: string;       // Foreign key to dataset
  data: Span;              // Full Span object
  spanId: string;          // Copied from data.span_id (for indexing)
  topic?: string;          // Optional category/classification
  evaluation?: DatasetEvaluation;  // For future use
  createdAt: number;       // Timestamp when record was added
}

export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
}

export interface DatasetWithRecords extends Dataset {
  records: DatasetRecord[];
}
```

### IndexedDB Schema

**Database Name:** `vllora-datasets`
**Version:** `1`

**Object Stores:**

1. **`datasets`** - Dataset metadata
   - Key path: `id`
   - Indexes: `name`, `createdAt`, `updatedAt`

2. **`records`** - Individual span records
   - Key path: `id`
   - Indexes: `datasetId`, `topic`, `createdAt`, `spanId`, `datasetId_spanId` (composite)

---

## Storage Layer

### IndexedDB Service (`datasets-db.ts`)

The service provides async functions for all database operations:

```typescript
// Database initialization
export async function getDB(): Promise<IDBDatabase>

// Dataset operations
export async function getAllDatasets(): Promise<Dataset[]>
export async function createDataset(name: string): Promise<Dataset>
export async function renameDataset(datasetId: string, newName: string): Promise<void>
export async function deleteDataset(datasetId: string): Promise<void>

// Record operations
export async function getRecordsByDatasetId(datasetId: string): Promise<DatasetRecord[]>
export async function getRecordCount(datasetId: string): Promise<number>
export async function addSpansToDataset(datasetId: string, spans: Span[], topic?: string): Promise<number>
export async function deleteRecord(datasetId: string, recordId: string): Promise<void>
export async function updateRecordTopic(datasetId: string, recordId: string, topic: string): Promise<void>
export async function updateRecordData(datasetId: string, recordId: string, data: unknown): Promise<void>

// Query by span
export async function getDatasetsBySpanId(spanId: string): Promise<Dataset[]>
export async function spanExistsInDataset(datasetId: string, spanId: string): Promise<boolean>
```

### React Hook (`useDatasets.ts`)

Wraps the IndexedDB service with React state management:

```typescript
export function useDatasets() {
  return {
    // State
    datasets: Dataset[],
    isLoading: boolean,
    error: Error | null,

    // Actions
    loadDatasets: () => Promise<void>,
    getDatasetWithRecords: (datasetId: string) => Promise<DatasetWithRecords | null>,
    getRecordCount: (datasetId: string) => Promise<number>,
    createDataset: (name: string) => Promise<Dataset>,
    addSpansToDataset: (datasetId: string, spans: Span[], topic?: string) => Promise<number>,
    deleteDataset: (datasetId: string) => Promise<void>,
    deleteRecord: (datasetId: string, recordId: string) => Promise<void>,
    updateRecordTopic: (datasetId: string, recordId: string, topic: string) => Promise<void>,
    updateRecordData: (datasetId: string, recordId: string, data: unknown) => Promise<void>,
    renameDataset: (datasetId: string, newName: string) => Promise<void>,
    spanExistsInDataset: (datasetId: string, spanId: string) => Promise<boolean>,
    getDatasetsBySpanId: (spanId: string) => Promise<Dataset[]>,
  };
}
```

---

## Lucy AI Integration

### Overview

Lucy is an AI assistant powered by OpenAI models. On the datasets page, Lucy has context about the user's datasets and can help with organization and analysis.

### Quick Actions

Dataset-specific quick actions shown in Lucy's welcome screen:

```typescript
const DATASET_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "list-datasets",
    icon: "📋",
    label: "List all my datasets",
  },
  {
    id: "analyze-dataset",
    icon: "🔍",
    label: "Analyze records in a dataset",
  },
  {
    id: "help-organize",
    icon: "🗂",
    label: "Help me organize my datasets",
  },
  {
    id: "export-dataset",
    icon: "📤",
    label: "How do I export a dataset?",
  },
];
```

### Context Injection

Before each message is sent to Lucy, context about the current datasets is injected:

```typescript
const handleBeforeSendMessage = useCallback(
  async (message: DistriMessage): Promise<DistriMessage> => {
    const ctx = {
      page: "datasets",
      datasets_count: datasets.length,
      dataset_names: datasets.map(d => d.name),
    };

    const contextText = `Context:\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``;
    const contextPart = { part_type: "text" as const, data: contextText };

    return { ...message, parts: [contextPart, ...message.parts] };
  },
  [datasets]
);
```

This allows Lucy to know:
- User is on the `/datasets` page
- How many datasets exist
- Names of all datasets

### Provider Check

Before Lucy can be used, OpenAI credentials must be configured:

```typescript
const isOpenAIConfigured = useMemo(() => {
  const openaiProvider = providers.find(p => p.name.toLowerCase() === "openai");
  return openaiProvider?.has_credentials ?? false;
}, [providers]);
```

If not configured, `LucyProviderCheck` component is shown instead of the chat.

### Connection States

The page handles multiple states for Lucy:
1. **Loading providers** - Checking configuration
2. **Not configured** - Show `LucyProviderCheck` setup UI
3. **Loading agent** - Agent is initializing
4. **Connected** - Show `LucyChat` component
5. **Disconnected** - Show connecting state

---

## Key Components

### DatasetsPage State

```typescript
// Lucy state (from useAgentChat hook)
const {
  agent,           // Distri agent instance
  agentLoading,    // Agent loading state
  selectedThreadId,// Lucy chat thread ID
  tools,           // Available tools for Lucy
  messages,        // Chat history
  handleNewChat,   // Create new Lucy chat thread
} = useAgentChat();

// Dataset management state
const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
const [datasetRecords, setDatasetRecords] = useState<Record<string, DatasetRecord[]>>({});
const [loadingRecords, setLoadingRecords] = useState<Set<string>>(new Set());
const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
const [editingDatasetName, setEditingDatasetName] = useState("");
const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
const [editingRecordTopic, setEditingRecordTopic] = useState("");
const [deleteConfirm, setDeleteConfirm] = useState<{...} | null>(null);
const [showNewDatasetInput, setShowNewDatasetInput] = useState(false);
const [newDatasetName, setNewDatasetName] = useState("");
```

### Dataset Expand/Collapse

Records are lazy-loaded when a dataset is expanded:

```typescript
const toggleDataset = async (datasetId: string) => {
  const newExpanded = new Set(expandedDatasets);
  if (newExpanded.has(datasetId)) {
    newExpanded.delete(datasetId);
  } else {
    newExpanded.add(datasetId);
    // Lazy load records if not already loaded
    if (!datasetRecords[datasetId] && !loadingRecords.has(datasetId)) {
      setLoadingRecords(prev => new Set(prev).add(datasetId));
      const datasetWithRecords = await getDatasetWithRecords(datasetId);
      if (datasetWithRecords) {
        setDatasetRecords(prev => ({ ...prev, [datasetId]: datasetWithRecords.records }));
      }
      setLoadingRecords(prev => {
        const newSet = new Set(prev);
        newSet.delete(datasetId);
        return newSet;
      });
    }
  }
  setExpandedDatasets(newExpanded);
};
```

### Record Display Helpers

```typescript
// Determine operation type from span
const getOperationType = (record: DatasetRecord): string => {
  const opName = record.data.operation_name;
  if (opName.includes("ModelCall") || opName.includes("model_call")) return "ModelCall";
  if (opName.includes("ToolCall") || opName.includes("tool_call")) return "ToolCall";
  if (opName.includes("ApiCall") || opName.includes("api_call")) return "ApiCall";
  return opName;
};

// Get label from span attributes
const getLabel = (record: DatasetRecord): string | undefined => {
  const attr = record.data.attribute as Record<string, unknown> | undefined;
  return attr?.label as string | undefined;
};
```

---

## SpanFooter Integration

The `SpanFooter` component shows which datasets a span belongs to:

### Features
- Shows up to 3 dataset badges
- "+N more" badge with tooltip for overflow
- "Add to Dataset" button
- Refreshes after adding to dataset

### Implementation

```typescript
// File: ui/src/components/chat/traces/TraceRow/span-info/SpanFooter.tsx

const MAX_VISIBLE_DATASETS = 3;

export const SpanFooter = () => {
  const { detailSpan } = ChatWindowConsumer();
  const [spanDatasets, setSpanDatasets] = useState<Dataset[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const loadSpanDatasets = useCallback(() => {
    if (detailSpan?.span_id) {
      datasetsDB.getDatasetsBySpanId(detailSpan.span_id).then(setSpanDatasets);
    }
  }, [detailSpan?.span_id]);

  // Layout: datasets on left, "Add to Dataset" button on right
  return (
    <div className="flex items-center justify-between ...">
      {/* Dataset badges (max 3, +N more with tooltip) */}
      {/* Add to Dataset button */}
    </div>
  );
};
```

---

## User Flows

### Creating a New Dataset

1. User clicks "+ New Dataset" button in header
2. Input field appears with confirm/cancel buttons
3. User enters name and presses Enter or clicks confirm
4. `createDataset()` is called
5. Toast notification confirms creation
6. New dataset appears in list

### Adding Spans to Dataset

**From Traces/Threads view:**
1. User enables select mode (click "Select" button)
2. Checkboxes appear on span rows
3. User selects spans → FloatingActionBar shows count
4. User clicks "Add to Dataset"
5. `AddToDatasetDialog` opens
6. User chooses new or existing dataset
7. User optionally enters topic
8. User clicks "Add X Spans"
9. Records created, toast shown, selection cleared

**From Span Detail view:**
1. User opens span detail (SpanInfo panel)
2. SpanFooter shows at bottom with "Add to Dataset" button
3. User clicks "Add to Dataset"
4. `AddToDatasetDialog` opens with single span
5. Same flow as above

### Managing Datasets

**Expand/Collapse:**
- Click dataset row → expands to show records
- Records lazy-loaded on first expand
- Click again → collapses

**Rename Dataset:**
1. Click "⋯" menu → "Rename"
2. Inline input appears
3. Edit name, press Enter or click checkmark
4. `renameDataset()` called
5. Toast confirms

**Delete Dataset:**
1. Click "⋯" menu → "Delete"
2. Confirmation dialog appears
3. Click "Delete"
4. `deleteDataset()` called
5. Toast confirms

**Edit Record Topic:**
1. Click topic text in record row
2. Inline input appears
3. Edit topic, press Enter
4. `updateRecordTopic()` called
5. Toast confirms

**Delete Record:**
1. Click trash icon on record row
2. Confirmation dialog appears
3. Click "Delete"
4. `deleteRecord()` called
5. Toast confirms

**View & Edit Record Data:**
1. Click on data preview text in record row (hover shows "Click to view & edit" tooltip)
2. Expand dialog opens with full JSON in Monaco editor
3. Edit JSON data as needed
4. Editor validates JSON in real-time (errors shown if invalid)
5. Click "Save Changes" to persist
6. `updateRecordData()` called
7. Toast confirms, dialog closes

**Sort Records:**
1. Click sort dropdown in toolbar OR click sortable column header (Topic, Evaluation, Timestamp)
2. Select sort field (timestamp, topic, or evaluation)
3. Click same header again to toggle ascending/descending
4. Records reorder immediately
5. Sort indicator (↑/↓) shows current sort state

---

## UI States

### Loading States

```typescript
// Initial page load
if (isLoading) {
  return <Loader2 /> + "Loading datasets..."
}

// Record loading (per dataset)
if (isLoadingRecords) {
  return "Loading records..."
}

// Lucy states
if (providersLoading) → "Checking configuration..."
if (agentLoading) → "Loading assistant..."
if (!isConnected) → "Connecting to assistant..."
```

### Error States

```typescript
if (error) {
  return "Error: {error.message}"
}
```

### Empty States

```typescript
if (datasets.length === 0) {
  return (
    <Database icon />
    "No datasets yet"
    "Select spans from traces and add them to a dataset"
    "Ask Lucy to help you get started!"
  )
}

if (records.length === 0) {
  return "No records in this dataset"
}
```

---

## Styling Patterns

### Theme Colors

```typescript
// Primary theme color
className="text-[rgb(var(--theme-500))]"
className="bg-[rgb(var(--theme-500))]/10"
className="border-[rgb(var(--theme-500))]/30"

// Hover states
className="hover:bg-muted/50"
className="hover:text-[rgb(var(--theme-500))]"
```

### Component Classes

```typescript
// Page layout
<section className="flex-1 flex overflow-hidden bg-background text-foreground">

// Left panel (Lucy)
<div className="w-[384px] flex-shrink-0 border-r border-border flex flex-col bg-background">

// Right panel (datasets)
<div className="flex-1 flex flex-col overflow-auto">
  <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

// Dataset card
<div className="border border-border rounded-lg overflow-hidden bg-card">
```

---

## Dependencies

### External Libraries

| Library | Purpose |
|---------|---------|
| `@distri/core` | Agent/chat message types |
| `@distri/react` | React hooks for Distri |
| `lucide-react` | Icons |
| `sonner` | Toast notifications |
| shadcn/ui | UI components (Button, Input, Dialog, etc.) |

### Internal Dependencies

| Import | Purpose |
|--------|---------|
| `useDatasets` | Dataset CRUD operations |
| `useAgentChat` | Lucy chat state |
| `useDistriConnection` | Connection state |
| `ProviderKeysConsumer` | Provider credentials |
| `LucyChat` | Chat component |
| `LucyProviderCheck` | Setup UI |
| `LucyAvatar` | Lucy's avatar |

---

## Implemented Features

### Sorting
Records can be sorted by:
- **Timestamp** (default, descending) - When the record was added
- **Topic** - Alphabetical by topic name (empty topics sort last)
- **Evaluation** - By evaluation score (unevaluated sort last)

Sorting is available via:
- Dropdown in the toolbar
- Clickable column headers with direction indicators

### Bulk Operations
- **Select All** - Checkbox in table header
- **Bulk Delete** - Delete multiple selected records
- **Bulk Topic Assignment** - Assign same topic to selected records

### Search
- Search box in toolbar filters by label, topic, or span ID

### Record Data Editing
- Click data preview to open expand dialog
- Monaco JSON editor for viewing/editing
- Real-time JSON validation
- Save changes persisted to IndexedDB

### Export
- Export dataset as JSON file (includes all records)

---

## Future Considerations

1. **Import**: Add ability to import datasets from JSON files

2. **Lucy Tools**: Add dataset-specific tools Lucy can use:
   - `list_datasets` - List all datasets
   - `get_dataset_records` - Get records from a dataset
   - `create_dataset` - Create a new dataset
   - `add_to_dataset` - Add current view spans to dataset

5. **Cloud Sync**: Backend API for storing datasets server-side (currently IndexedDB only)

6. **Evaluation Features**: Use the prepared `DatasetEvaluation` interface for scoring/feedback

---

## Troubleshooting

### Common Issues

**Datasets not persisting:**
- Check browser IndexedDB storage in DevTools (Application → IndexedDB → vllora-datasets)
- Private/incognito mode doesn't persist IndexedDB
- Clear site data may remove datasets

**Lucy not loading:**
- Check OpenAI credentials in Settings → Providers
- Check Distri server connection
- Look for errors in browser console

**Records not loading:**
- Check if dataset is expanded
- Look for IndexedDB errors in console
- Try refreshing the page

### Debug Commands

```javascript
// Check IndexedDB in browser console
const request = indexedDB.open('vllora-datasets', 1);
request.onsuccess = () => {
  const db = request.result;
  console.log('Object stores:', db.objectStoreNames);

  // List all datasets
  const tx = db.transaction('datasets', 'readonly');
  tx.objectStore('datasets').getAll().onsuccess = (e) => {
    console.log('Datasets:', e.target.result);
  };
};
```

---

## Related Documentation

- [Add Spans to Dataset Feature](./add-spans-to-dataset.md) - Detailed implementation of adding spans
- [Distri Agent Integration](../distri-agent-integration.md) - Lucy agent documentation
- [State Management Pattern](../state-management-pattern.md) - Context/Provider patterns

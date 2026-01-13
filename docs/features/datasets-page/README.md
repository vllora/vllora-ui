# Datasets Page - Technical Reference

> **For AI Agents**: Start with the [Quick Context](#quick-context) section below for rapid understanding.

---

## Quick Context

**What is this?** A page (`/datasets`) for managing collections of LLM trace data stored in IndexedDB. Users add spans from traces, organize them with topics, and can edit the underlying data.

**Key Files:**
| File | Purpose |
|------|---------|
| `pages/datasets/index.tsx` | Main page with Lucy AI assistant integration |
| `hooks/useDatasets.ts` | React hook wrapping IndexedDB operations |
| `services/datasets-db.ts` | Low-level IndexedDB CRUD operations |
| `types/dataset-types.ts` | TypeScript interfaces |
| `components/datasets/DatasetDetailView.tsx` | Full dataset view with records table |
| `components/datasets/RecordsTable.tsx` | Virtualized table with sorting |
| `components/datasets/AddToDatasetDialog.tsx` | Dialog for adding spans |

**Core Data Models:**
```typescript
// Dataset metadata (stored in 'datasets' object store)
interface Dataset {
  id: string;           // crypto.randomUUID()
  name: string;         // User-provided name
  createdAt: number;    // Timestamp ms
  updatedAt: number;    // Timestamp ms
}

// Record within a dataset (stored in 'records' object store)
interface DatasetRecord {
  id: string;           // crypto.randomUUID()
  datasetId: string;    // Foreign key to Dataset
  data: DataInfo;       // Extracted input/output (NOT full span)
  spanId?: string;      // For duplicate detection
  topic?: string;       // Optional category
  evaluation?: DatasetEvaluation;
  createdAt: number;
  updatedAt: number;    // Last modified timestamp
}

// Extracted from span when adding to dataset
interface DataInfo {
  input: {
    messages?: any[];   // From request.messages
    tools?: any[];      // From request.tools
    tool_choice?: string;
    metadata?: any;
  };
  output: {
    messages?: any[];   // From response.choices[0].message
    tool_calls?: any[]; // From response.choices[0].tool_calls
    metadata?: any;
    finish_reason?: string;
  };
}
```

**Database:** IndexedDB database `vllora-datasets` with two object stores: `datasets` (key: `id`) and `records` (key: `id`, indexes: `datasetId`, `spanId`, `datasetId_spanId`).

**Pattern for adding features:**
1. Add types to `dataset-types.ts`
2. Add IndexedDB function to `datasets-db.ts`
3. Expose via `useDatasets.ts` hook
4. Use in components

---

## File Structure

### Primary Components

```
ui/src/
├── pages/datasets/
│   └── index.tsx                    # Main page (Lucy + datasets list)
├── components/datasets/
│   ├── AddToDatasetDialog.tsx       # Dialog for adding spans
│   ├── DatasetDetailView.tsx        # Full dataset view with table
│   ├── DatasetDetailHeader.tsx      # Header with name, actions
│   ├── DeleteConfirmationDialog.tsx # Reusable delete confirmation
│   ├── RecordsTable.tsx             # Virtualized records table
│   ├── RecordsToolbar.tsx           # Search, sort, bulk actions
│   ├── RecordRow.tsx                # Individual record row
│   ├── record-utils.ts              # Helper functions for records
│   └── cells/
│       ├── DataCell.tsx             # Clickable data preview
│       ├── TopicCell.tsx            # Inline-editable topic
│       ├── EvaluationCell.tsx       # Evaluation display
│       └── TimestampCell.tsx        # Timestamp display
├── hooks/
│   └── useDatasets.ts               # React hook for IndexedDB
├── services/
│   └── datasets-db.ts               # IndexedDB operations
└── types/
    └── dataset-types.ts             # TypeScript interfaces
```

### Related Files

```
ui/src/components/
├── chat/traces/TraceRow/span-info/
│   └── SpanFooter.tsx               # Shows datasets a span belongs to
└── chat/conversation/model-config/
    └── json-editor.tsx              # Monaco editor for data editing
```

---

## Storage Layer

### IndexedDB Schema

**Database:** `vllora-datasets`
**Version:** `1`

**Object Stores:**

1. **`datasets`**
   - Key path: `id`
   - Indexes: `name`, `createdAt`, `updatedAt`

2. **`records`**
   - Key path: `id`
   - Indexes: `datasetId`, `topic`, `createdAt`, `spanId`, `datasetId_spanId` (composite)

### Service Functions (`datasets-db.ts`)

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
  // NOTE: Extracts DataInfo from each span (input/output messages, tools, tool_calls)
export async function deleteRecord(datasetId: string, recordId: string): Promise<void>
export async function updateRecordTopic(datasetId: string, recordId: string, topic: string): Promise<void>
export async function updateRecordData(datasetId: string, recordId: string, data: unknown): Promise<void>

// Query by span
export async function getDatasetsBySpanId(spanId: string): Promise<Dataset[]>
export async function spanExistsInDataset(datasetId: string, spanId: string): Promise<boolean>
```

### React Hook (`useDatasets.ts`)

```typescript
export function useDatasets() {
  return {
    // State
    datasets: Dataset[],
    isLoading: boolean,
    error: Error | null,

    // Actions (mirrors datasets-db.ts functions)
    loadDatasets,
    getDatasetWithRecords,
    getRecordCount,
    createDataset,
    addSpansToDataset,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    updateRecordData,
    renameDataset,
    spanExistsInDataset,
    getDatasetsBySpanId,
  };
}
```

---

## Key Components

### DatasetDetailView

The main view when a dataset is selected. Manages:
- Loading dataset and records
- Search filtering by label/topic/spanId
- Sorting by timestamp/topic/evaluation
- Selection state for bulk operations
- Expand dialog for editing record data

**Key State:**
```typescript
const [dataset, setDataset] = useState<Dataset | null>(null);
const [records, setRecords] = useState<DatasetRecord[]>([]);
const [searchQuery, setSearchQuery] = useState("");
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [sortConfig, setSortConfig] = useState<SortConfig>({ field: "timestamp", direction: "desc" });
const [expandedRecord, setExpandedRecord] = useState<DatasetRecord | null>(null);
const [editedJson, setEditedJson] = useState("");
```

### RecordsTable

Virtualized table using `@tanstack/react-virtual` for performance with large datasets.

**Props:**
```typescript
interface RecordsTableProps {
  records: DatasetRecord[];
  showHeader?: boolean;
  showFooter?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  sortConfig?: SortConfig;
  onSortChange?: (config: SortConfig) => void;
  emptyMessage?: string;
  onUpdateTopic?: (recordId: string, topic: string) => void;
  onDelete?: (recordId: string) => void;
  onExpand?: (record: DatasetRecord) => void;
  height?: number;
}
```

### SortConfig

```typescript
type SortField = "timestamp" | "topic" | "evaluation";
type SortDirection = "asc" | "desc";

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}
```

---

## Data Flow

### Adding Spans to Dataset

```
User selects spans → FloatingActionBar → AddToDatasetDialog
                                              ↓
                                    addSpansToDataset()
                                              ↓
                              Extract DataInfo from each span:
                              - input.messages from request.messages
                              - output.messages from response.choices[0].message
                              - tools/tool_calls if present
                              - finish_reason
                                              ↓
                              Create DatasetRecord for each span
                                              ↓
                              Store in IndexedDB 'records' store
```

### DataInfo Extraction Logic (in `addSpansToDataset`)

```typescript
let spanAttributes = span.attribute as Record<string, unknown>;
let requestStr = spanAttributes.request as string;
let outputStr = spanAttributes.output as string;
let requestJson = tryParseJson(requestStr);
let outputJson = tryParseJson(outputStr);

let dataInfo: DataInfo = {
  input: { messages: requestJson?.messages || [] },
  output: { messages: outputJson?.choices?.[0]?.message }
};

if (spanAttributes.finish_reason) {
  dataInfo.output.finish_reason = spanAttributes.finish_reason;
}
if (requestJson?.tools) {
  dataInfo.input.tools = requestJson.tools;
}
if (outputJson?.choices?.[0]?.tool_calls) {
  dataInfo.output.tool_calls = outputJson.choices[0].tool_calls;
}
```

### Updating Record Data

```
DataCell click → handleExpandRecord → Dialog with Monaco editor
                                              ↓
                                    User edits JSON
                                              ↓
                                    Real-time validation
                                              ↓
                               handleSaveRecordData()
                                              ↓
                               updateRecordData() in IndexedDB
                               (sets record.updatedAt = now)
                                              ↓
                               Update local state with new data
```

---

## Lucy AI Integration

Lucy is an OpenAI-powered assistant shown in the left panel.

### Context Injection

Before each message, dataset context is prepended:

```typescript
const ctx = {
  page: "datasets",
  datasets_count: datasets.length,
  dataset_names: datasets.map(d => d.name),
};
```

### Quick Actions

```typescript
const DATASET_QUICK_ACTIONS = [
  { id: "list-datasets", icon: "📋", label: "List all my datasets" },
  { id: "analyze-dataset", icon: "🔍", label: "Analyze records in a dataset" },
  { id: "help-organize", icon: "🗂", label: "Help me organize my datasets" },
  { id: "export-dataset", icon: "📤", label: "How do I export a dataset?" },
];
```

---

## Common Patterns

### Styling

```typescript
// Theme colors
className="text-[rgb(var(--theme-500))]"
className="bg-[rgb(var(--theme-500))]/10"
className="border-[rgb(var(--theme-500))]/30"

// Hover states
className="hover:bg-muted/50"
className="hover:text-[rgb(var(--theme-500))]"
```

### Toast Notifications

```typescript
import { toast } from "sonner";

toast.success("Record data updated");
toast.error("Failed to save record data");
toast.info("Run evaluation feature coming soon");
```

### Dialog Pattern

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>...</DialogTitle></DialogHeader>
    {/* content */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button onClick={handleSubmit}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## How to Add a Feature

### Example: Add a new field to DatasetRecord

1. **Update types** (`dataset-types.ts`):
   ```typescript
   export interface DatasetRecord {
     // ... existing fields
     newField?: string;
   }
   ```

2. **Update IndexedDB** (`datasets-db.ts`):
   - If it needs an index, update `onupgradeneeded` (increment DB_VERSION)
   - Add setter logic in relevant functions

3. **Update hook** (`useDatasets.ts`):
   - Add new function if needed
   - Expose in return object

4. **Update components**:
   - Add UI in `RecordRow.tsx` or new cell component
   - Wire up handlers in `DatasetDetailView.tsx`

### Example: Add bulk operation

1. **Add handler in `DatasetDetailView.tsx`**:
   ```typescript
   const handleBulkNewAction = async () => {
     const selectedRecordIds = Array.from(selectedIds);
     for (const recordId of selectedRecordIds) {
       await someOperation(dataset.id, recordId);
     }
     setSelectedIds(new Set());
     toast.success(`Updated ${selectedRecordIds.length} records`);
   };
   ```

2. **Add button in `RecordsToolbar.tsx`**:
   - Add prop: `onNewAction?: () => void`
   - Add button in bulk actions section

---

## Troubleshooting

### Debug IndexedDB

```javascript
// In browser console
const request = indexedDB.open('vllora-datasets', 1);
request.onsuccess = () => {
  const db = request.result;
  const tx = db.transaction(['datasets', 'records'], 'readonly');

  tx.objectStore('datasets').getAll().onsuccess = (e) => {
    console.log('Datasets:', e.target.result);
  };

  tx.objectStore('records').getAll().onsuccess = (e) => {
    console.log('Records:', e.target.result);
  };
};
```

### Common Issues

- **Datasets not persisting**: Check IndexedDB in DevTools (Application tab)
- **Lucy not loading**: Verify OpenAI credentials in Settings → Providers
- **Records not loading**: Check console for IndexedDB errors

---

## Dependencies

| Library | Purpose |
|---------|---------|
| `@monaco-editor/react` | JSON editor for record data |
| `@tanstack/react-virtual` | Virtualized scrolling |
| `lucide-react` | Icons |
| `sonner` | Toast notifications |
| shadcn/ui | UI components |

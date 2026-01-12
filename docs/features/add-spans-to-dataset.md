# Add Spans to Dataset Feature

## Overview

This feature allows users to select spans from the Traces or Threads view and add them to datasets stored in IndexedDB. Datasets serve as collections of spans for evaluation, analysis, and future comparison purposes.

**Why IndexedDB over localStorage?**
- Much larger storage limits (~50% of available disk space vs 5-10MB)
- Async API won't block the main thread
- Better suited for structured data like full Span objects
- Native support for indexes and queries

---

## User Story

As a user, I want to:
1. Select multiple spans using checkboxes in the timeline view
2. Click "Add to Dataset" from the floating action bar
3. Choose to create a new dataset or add to an existing one
4. Optionally assign a topic/category to the selected spans
5. View and manage my datasets from a dedicated page

---

## Current State Analysis

### Existing Multi-Select Infrastructure

The span selection system is already implemented in the codebase:

**Context State** (`ui/src/contexts/TracesPageContext.tsx` and `ui/src/contexts/ChatWindowContext.tsx`):
```typescript
// State for span selection
isSpanSelectModeEnabled: boolean;          // Toggle for checkbox visibility
selectedSpanIdsForActions: string[];       // Array of selected span IDs
toggleSpanSelection: (spanId: string) => void;
clearSpanSelection: () => void;
selectAllSpans: () => void;
```

**UI Components**:
- `SelectModeToggle` (`ui/src/components/chat/traces/components/SelectModeToggle.tsx`) - Button to enable selection mode
- `SpanSelectionCheckbox` (`ui/src/components/chat/traces/components/SpanSelectionCheckbox.tsx`) - Checkbox shown on each span row
- `FloatingActionBar` (`ui/src/components/chat/traces/components/FloatingActionBar.tsx`) - Action bar with "Add to Dataset" button

**Integration Points**:
- Traces Tab: `ui/src/pages/chat/traces/content.tsx` - Uses `TracesPageContext`
- Threads Tab: `ui/src/components/chat/traces/TraceView.tsx` - Uses `ChatWindowContext`

### Span Data Structure

From `ui/src/types/common-type.ts`:

```typescript
export interface Span {
  trace_id: string;
  span_id: string;
  thread_id: string;
  parent_span_id?: string;
  operation_name: string;
  start_time_us: number;
  finish_time_us?: number;
  attribute: Attributes;
  child_attribute?: Attributes;
  run_id: string;
  parent_trace_id?: string;
  spans?: Span[];
  isInProgress?: boolean;
  isInDebug?: boolean;
}

export type Attributes =
  | ModelCall
  | ToolCall
  | ApiCall
  | {
      message_id?: string;
      error?: string;
      output?: string;
      [key: string]: any;
    };

export interface ModelCall {
  input: Input | string;
  model: Model;
  output: string;
  label?: string;
  provider_name?: string;
  model_name?: string;
  error?: string;
}

export interface ToolCall {
  tool_name: string;
  arguments: object;
  output: object[];
  provider_name?: string;
  label?: string;
  tool_calls?: string;
  error?: string;
  response?: string;
  tool_results?: string;
  mcp_server?: string;
  mcp_template_definition_id?: string;
}

export interface ApiCall {
  request: string;
  output?: string;
  provider_name?: string;
  label?: string;
  error?: string;
}
```

---

## Data Models

### Dataset Interface

```typescript
// File: ui/src/types/dataset-types.ts

export interface Dataset {
  id: string;                    // UUID (crypto.randomUUID())
  name: string;                  // User-provided name (required, non-empty)
  createdAt: number;             // Timestamp in milliseconds
  updatedAt: number;             // Timestamp in milliseconds (updated when records change)
  records: DatasetRecord[];      // Array of span records
}

export interface DatasetRecord {
  id: string;                    // UUID (crypto.randomUUID())
  data: Span;                    // Full Span object from common-type.ts
  topic?: string;                // Optional category/classification (e.g., "flight_search", "error_handling")
  evaluation?: DatasetEvaluation; // Optional evaluation data (for future use)
  createdAt: number;             // Timestamp when record was added
}

export interface DatasetEvaluation {
  score?: number;                // Numeric score (e.g., 1-5 or 0-100)
  feedback?: string;             // Text feedback or notes
  evaluatedAt?: number;          // Timestamp of evaluation
}
```

### IndexedDB Schema

**Database Name**: `vllora-datasets`
**Version**: `1`

**Object Stores**:

1. **`datasets`** - Stores dataset metadata
   - Key path: `id`
   - Indexes: `name`, `createdAt`, `updatedAt`

2. **`records`** - Stores individual records (spans)
   - Key path: `id`
   - Indexes: `datasetId`, `topic`, `createdAt`, `spanId` (for duplicate detection)

**Schema Design**:
```typescript
// datasets store
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Flight Search Spans",
  createdAt: 1704067200000,
  updatedAt: 1704153600000,
}

// records store
{
  id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  datasetId: "550e8400-e29b-41d4-a716-446655440000",  // Foreign key
  data: { /* Full Span object */ },
  spanId: "span-123",  // For duplicate detection
  topic: "successful_search",
  evaluation: null,
  createdAt: 1704067200000
}
```

**Benefits of separate stores**:
- Faster queries for records within a dataset
- Can query records by topic across all datasets
- Easier pagination for large datasets

---

## Files to Create

### 1. Type Definitions

**File**: `ui/src/types/dataset-types.ts`

```typescript
import { Span } from './common-type';

export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
}

// Stored in 'records' object store
export interface DatasetRecord {
  id: string;
  datasetId: string;           // Foreign key to dataset
  data: Span;
  spanId: string;              // For duplicate detection (copied from data.span_id)
  topic?: string;
  evaluation?: DatasetEvaluation;
  createdAt: number;
}

// Stored in 'datasets' object store (metadata only, no records array)
export interface Dataset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// Combined view for UI (dataset + its records)
export interface DatasetWithRecords extends Dataset {
  records: DatasetRecord[];
}
```

### 2. IndexedDB Service

**File**: `ui/src/services/datasets-db.ts`

This service handles all IndexedDB operations for datasets.

```typescript
import { Dataset, DatasetRecord } from '@/types/dataset-types';
import { Span } from '@/types/common-type';

const DB_NAME = 'vllora-datasets';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

// Initialize and get database connection
export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create datasets store
      if (!db.objectStoreNames.contains('datasets')) {
        const datasetsStore = db.createObjectStore('datasets', { keyPath: 'id' });
        datasetsStore.createIndex('name', 'name', { unique: false });
        datasetsStore.createIndex('createdAt', 'createdAt', { unique: false });
        datasetsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Create records store
      if (!db.objectStoreNames.contains('records')) {
        const recordsStore = db.createObjectStore('records', { keyPath: 'id' });
        recordsStore.createIndex('datasetId', 'datasetId', { unique: false });
        recordsStore.createIndex('topic', 'topic', { unique: false });
        recordsStore.createIndex('createdAt', 'createdAt', { unique: false });
        recordsStore.createIndex('spanId', 'spanId', { unique: false });
        // Composite index for duplicate detection within a dataset
        recordsStore.createIndex('datasetId_spanId', ['datasetId', 'spanId'], { unique: false });
      }
    };
  });
}

// Get all datasets (metadata only)
export async function getAllDatasets(): Promise<Dataset[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by updatedAt descending
      const datasets = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(datasets);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get records for a dataset
export async function getRecordsByDatasetId(datasetId: string): Promise<DatasetRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.getAll(datasetId);

    request.onsuccess = () => {
      // Sort by createdAt descending
      const records = request.result.sort((a, b) => b.createdAt - a.createdAt);
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get record count for a dataset
export async function getRecordCount(datasetId: string): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId');
    const request = index.count(datasetId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Create a new dataset
export async function createDataset(name: string): Promise<Dataset> {
  const db = await getDB();
  const now = Date.now();
  const dataset: Dataset = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');
    const request = store.add(dataset);

    request.onsuccess = () => resolve(dataset);
    request.onerror = () => reject(request.error);
  });
}

// Add spans to a dataset
export async function addSpansToDataset(
  datasetId: string,
  spans: Span[],
  topic?: string
): Promise<number> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update dataset's updatedAt
    const getRequest = datasetsStore.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    // Add records
    let addedCount = 0;
    spans.forEach((span) => {
      const record: DatasetRecord = {
        id: crypto.randomUUID(),
        datasetId,
        data: span,
        spanId: span.span_id,
        topic: topic?.trim() || undefined,
        createdAt: now,
      };
      const addRequest = recordsStore.add(record);
      addRequest.onsuccess = () => addedCount++;
    });

    tx.oncomplete = () => resolve(addedCount);
    tx.onerror = () => reject(tx.error);
  });
}

// Delete a dataset and all its records
export async function deleteDataset(datasetId: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Delete dataset
    datasetsStore.delete(datasetId);

    // Delete all records for this dataset
    const index = recordsStore.index('datasetId');
    const cursorRequest = index.openCursor(datasetId);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Delete a single record
export async function deleteRecord(datasetId: string, recordId: string): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Delete record
    recordsStore.delete(recordId);

    // Update dataset's updatedAt
    const getRequest = datasetsStore.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Update a record's topic
export async function updateRecordTopic(
  datasetId: string,
  recordId: string,
  topic: string
): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'records'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const recordsStore = tx.objectStore('records');

    // Update record
    const getRecordRequest = recordsStore.get(recordId);
    getRecordRequest.onsuccess = () => {
      const record = getRecordRequest.result;
      if (record) {
        record.topic = topic.trim() || undefined;
        recordsStore.put(record);
      }
    };

    // Update dataset's updatedAt
    const getDatasetRequest = datasetsStore.get(datasetId);
    getDatasetRequest.onsuccess = () => {
      const dataset = getDatasetRequest.result;
      if (dataset) {
        dataset.updatedAt = now;
        datasetsStore.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Rename a dataset
export async function renameDataset(datasetId: string, newName: string): Promise<void> {
  const db = await getDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');

    const getRequest = store.get(datasetId);
    getRequest.onsuccess = () => {
      const dataset = getRequest.result;
      if (dataset) {
        dataset.name = newName.trim();
        dataset.updatedAt = now;
        store.put(dataset);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Check if span already exists in a dataset
export async function spanExistsInDataset(datasetId: string, spanId: string): Promise<boolean> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const store = tx.objectStore('records');
    const index = store.index('datasetId_spanId');
    const request = index.count([datasetId, spanId]);

    request.onsuccess = () => resolve(request.result > 0);
    request.onerror = () => reject(request.error);
  });
}
```

### 3. useDatasets Hook

**File**: `ui/src/hooks/useDatasets.ts`

This hook provides a React-friendly interface to the IndexedDB service.

```typescript
import { useState, useCallback, useEffect } from 'react';
import { Dataset, DatasetRecord, DatasetWithRecords } from '@/types/dataset-types';
import { Span } from '@/types/common-type';
import * as datasetsDB from '@/services/datasets-db';

export function useDatasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load datasets from IndexedDB on mount
  const loadDatasets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await datasetsDB.getAllDatasets();
      setDatasets(data);
    } catch (err) {
      console.error('Failed to load datasets:', err);
      setError(err instanceof Error ? err : new Error('Failed to load datasets'));
      setDatasets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get a dataset with its records
  const getDatasetWithRecords = useCallback(async (datasetId: string): Promise<DatasetWithRecords | null> => {
    try {
      const dataset = datasets.find(ds => ds.id === datasetId);
      if (!dataset) return null;

      const records = await datasetsDB.getRecordsByDatasetId(datasetId);
      return { ...dataset, records };
    } catch (err) {
      console.error('Failed to get dataset with records:', err);
      return null;
    }
  }, [datasets]);

  // Get record count for a dataset
  const getRecordCount = useCallback(async (datasetId: string): Promise<number> => {
    try {
      return await datasetsDB.getRecordCount(datasetId);
    } catch (err) {
      console.error('Failed to get record count:', err);
      return 0;
    }
  }, []);

  // Create a new dataset
  const createDataset = useCallback(async (name: string): Promise<Dataset> => {
    const newDataset = await datasetsDB.createDataset(name);
    setDatasets(prev => [newDataset, ...prev]);
    return newDataset;
  }, []);

  // Add spans to an existing dataset
  const addSpansToDataset = useCallback(async (
    datasetId: string,
    spans: Span[],
    topic?: string
  ): Promise<number> => {
    const addedCount = await datasetsDB.addSpansToDataset(datasetId, spans, topic);
    // Refresh datasets to get updated timestamps
    await loadDatasets();
    return addedCount;
  }, [loadDatasets]);

  // Delete a dataset
  const deleteDataset = useCallback(async (datasetId: string): Promise<void> => {
    await datasetsDB.deleteDataset(datasetId);
    setDatasets(prev => prev.filter(ds => ds.id !== datasetId));
  }, []);

  // Delete a single record from a dataset
  const deleteRecord = useCallback(async (datasetId: string, recordId: string): Promise<void> => {
    await datasetsDB.deleteRecord(datasetId, recordId);
    // Refresh datasets to get updated timestamps
    await loadDatasets();
  }, [loadDatasets]);

  // Update a record's topic
  const updateRecordTopic = useCallback(async (
    datasetId: string,
    recordId: string,
    topic: string
  ): Promise<void> => {
    await datasetsDB.updateRecordTopic(datasetId, recordId, topic);
  }, []);

  // Rename a dataset
  const renameDataset = useCallback(async (datasetId: string, newName: string): Promise<void> => {
    await datasetsDB.renameDataset(datasetId, newName);
    setDatasets(prev => prev.map(ds =>
      ds.id === datasetId ? { ...ds, name: newName.trim(), updatedAt: Date.now() } : ds
    ));
  }, []);

  // Check if span already exists in dataset
  const spanExistsInDataset = useCallback(async (
    datasetId: string,
    spanId: string
  ): Promise<boolean> => {
    return await datasetsDB.spanExistsInDataset(datasetId, spanId);
  }, []);

  // Load on mount
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  return {
    datasets,
    isLoading,
    error,
    loadDatasets,
    getDatasetWithRecords,
    getRecordCount,
    createDataset,
    addSpansToDataset,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    renameDataset,
    spanExistsInDataset,
  };
}
```

### 4. AddToDatasetDialog Component

**File**: `ui/src/components/datasets/AddToDatasetDialog.tsx`

**Props**:
```typescript
interface AddToDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spans: Span[];                    // Full Span objects to add
  onSuccess?: () => void;           // Callback after successful add (e.g., clear selection)
}
```

**UI Structure**:
```
┌──────────────────────────────────────────────────────────────┐
│  Add to Dataset                                         [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Adding 5 spans                                              │
│                                                              │
│  ┌─────────────────┐ ┌─────────────────┐                     │
│  │ ○ New Dataset   │ │ ● Existing      │    (Toggle tabs)    │
│  └─────────────────┘ └─────────────────┘                     │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Select dataset...                                  ▼  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  Topic (optional)                                            │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ e.g., flight_search, error_handling                   │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────┐  ┌─────────────────────────────────────┐   │
│  │   Cancel    │  │         Add 5 Spans                 │   │
│  └─────────────┘  └─────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**When "New Dataset" is selected**:
```
│  Dataset Name *                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ My Dataset                                            │   │
│  └───────────────────────────────────────────────────────┘   │
```

**Component Implementation Pattern**:
Follow the existing dialog pattern from `ui/src/components/chat/traces/TraceRow/new-timeline/timeline-row/EditRequestDialog.tsx`:

```typescript
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useDatasets } from "@/hooks/useDatasets";
import { Span } from "@/types/common-type";
import { toast } from "sonner";
import { Database, Plus, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddToDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spans: Span[];
  onSuccess?: () => void;
}

export function AddToDatasetDialog({
  open,
  onOpenChange,
  spans,
  onSuccess,
}: AddToDatasetDialogProps) {
  const { datasets, createDataset, addSpansToDataset } = useDatasets();
  const [mode, setMode] = useState<'new' | 'existing'>('existing');
  const [newDatasetName, setNewDatasetName] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [topic, setTopic] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-select "new" mode if no datasets exist
  const effectiveMode = datasets.length === 0 ? 'new' : mode;

  const handleSubmit = async () => {
    if (spans.length === 0) return;

    setIsSubmitting(true);
    try {
      let targetDatasetId = selectedDatasetId;

      if (effectiveMode === 'new') {
        if (!newDatasetName.trim()) {
          toast.error('Please enter a dataset name');
          setIsSubmitting(false);
          return;
        }
        const newDataset = await createDataset(newDatasetName);
        targetDatasetId = newDataset.id;
      } else {
        if (!targetDatasetId) {
          toast.error('Please select a dataset');
          setIsSubmitting(false);
          return;
        }
      }

      const addedCount = await addSpansToDataset(targetDatasetId, spans, topic || undefined);

      toast.success(`Added ${addedCount} spans to dataset`, {
        description: effectiveMode === 'new' ? `Created "${newDatasetName}"` : undefined,
      });

      // Reset form
      setNewDatasetName('');
      setSelectedDatasetId('');
      setTopic('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Failed to add spans to dataset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2 font-medium">
            <Database className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            <span>Add to Dataset</span>
          </div>

          <p className="text-sm text-muted-foreground">
            Adding {spans.length} span{spans.length !== 1 ? 's' : ''}
          </p>

          {/* Mode Toggle - only show if datasets exist */}
          {datasets.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setMode('new')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-all",
                  effectiveMode === 'new'
                    ? "bg-[rgb(var(--theme-500))]/10 border-[rgb(var(--theme-500))]/50 text-[rgb(var(--theme-500))]"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <Plus className="w-4 h-4" />
                New Dataset
              </button>
              <button
                onClick={() => setMode('existing')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-all",
                  effectiveMode === 'existing'
                    ? "bg-[rgb(var(--theme-500))]/10 border-[rgb(var(--theme-500))]/50 text-[rgb(var(--theme-500))]"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <FolderOpen className="w-4 h-4" />
                Existing
              </button>
            </div>
          )}

          {/* New Dataset Input */}
          {effectiveMode === 'new' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Dataset Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={newDatasetName}
                onChange={(e) => setNewDatasetName(e.target.value)}
                placeholder="Enter dataset name"
                autoFocus
              />
            </div>
          )}

          {/* Existing Dataset Select */}
          {effectiveMode === 'existing' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Dataset</label>
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a dataset..." />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>
                      {ds.name} ({ds.records.length} records)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Topic Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Topic <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., flight_search, error_handling"
            />
            <p className="text-xs text-muted-foreground">
              Applies to all {spans.length} span{spans.length !== 1 ? 's' : ''} being added
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              <Database className="w-4 h-4" />
              Add {spans.length} Span{spans.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 5. Datasets Management Page

**File**: `ui/src/pages/datasets/index.tsx`

**Route**: `/datasets`

**UI Structure**:
```
┌──────────────────────────────────────────────────────────────────────────┐
│  Datasets                                              [+ New Dataset]   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ▼ Flight Search Spans                           12 records  [⋯]   │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │ ModelCall: gpt-4         flight_search         [Edit] [Del] │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │ ToolCall: search_flights  flight_search        [Edit] [Del] │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │  ...                                                               │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ▶ Error Analysis                                 5 records   [⋯]  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Features**:
- Expandable/collapsible dataset cards
- Dataset actions dropdown: Rename, Delete
- Record list showing: operation type, label (from span), topic, created date
- Inline topic editing on records
- Delete individual records

**Component Pattern**:
Follow the existing page pattern from `ui/src/pages/settings/index.tsx`.

---

## Files to Modify

### 1. Traces Tab Integration

**File**: `ui/src/pages/chat/traces/content.tsx`

**Changes**:
1. Import `AddToDatasetDialog` and related hooks
2. Add dialog state management
3. Resolve span IDs to full Span objects
4. Wire up the FloatingActionBar

```typescript
// Add imports
import { AddToDatasetDialog } from '@/components/datasets/AddToDatasetDialog';
import { useState, useMemo } from 'react';

// Inside component, add state
const [showAddToDatasetDialog, setShowAddToDatasetDialog] = useState(false);

// Get flattenSpans from context for ID resolution
// Note: TracesPageContext already has flattenSpans via useWrapperHook

// Resolve selected span IDs to full Span objects
const selectedSpans = useMemo(() => {
  // Need to get flattenSpans from context
  // This may require adding it to the TracesPageConsumer return value
  return flattenSpans.filter(span => selectedSpanIdsForActions.includes(span.span_id));
}, [flattenSpans, selectedSpanIdsForActions]);

// Update FloatingActionBar onAddToDataset
<FloatingActionBar
  selectedCount={selectedSpanIdsForActions.length}
  onClearSelection={clearSpanSelection}
  onAddToDataset={() => setShowAddToDatasetDialog(true)}
  isVisible={isSpanSelectModeEnabled}
/>

// Add dialog component
<AddToDatasetDialog
  open={showAddToDatasetDialog}
  onOpenChange={setShowAddToDatasetDialog}
  spans={selectedSpans}
  onSuccess={clearSpanSelection}
/>
```

**Note**: The `TracesPageContext` needs to expose `flattenSpans` from `useWrapperHook`. Check if it's already exposed, if not, add it to the return value.

### 2. Threads Tab Integration

**File**: `ui/src/components/chat/traces/TraceView.tsx`

**Changes**:
Same pattern as traces tab, using `ChatWindowContext` instead.

```typescript
// Add imports
import { AddToDatasetDialog } from '@/components/datasets/AddToDatasetDialog';
import { useState, useMemo } from 'react';

// Inside component
const {
  // ... existing destructured values
  flattenSpans,  // Need to verify this is exposed from ChatWindowContext
  selectedSpanIdsForActions,
  clearSpanSelection,
  isSpanSelectModeEnabled,
} = ChatWindowConsumer();

const [showAddToDatasetDialog, setShowAddToDatasetDialog] = useState(false);

const selectedSpans = useMemo(() => {
  return flattenSpans.filter(span => selectedSpanIdsForActions.includes(span.span_id));
}, [flattenSpans, selectedSpanIdsForActions]);

// Update FloatingActionBar
<FloatingActionBar
  selectedCount={selectedSpanIdsForActions.length}
  onClearSelection={clearSpanSelection}
  onAddToDataset={() => setShowAddToDatasetDialog(true)}
  isVisible={isSpanSelectModeEnabled}
/>

// Add dialog
<AddToDatasetDialog
  open={showAddToDatasetDialog}
  onOpenChange={setShowAddToDatasetDialog}
  spans={selectedSpans}
  onSuccess={clearSpanSelection}
/>
```

### 3. Add Route for Datasets Page

**File**: `ui/src/App.tsx`

**Changes**:
Add the datasets route inside the protected routes:

```typescript
// Add import
import { DatasetsPage } from "./pages/datasets";

// Add route (inside protected routes, after "models" route)
<Route path="datasets" element={<DatasetsPage />} />
```

### 4. Add Navigation Link

**File**: `ui/src/components/layout/Sidebar.tsx` (or equivalent navigation component)

**Changes**:
Add a navigation link to the datasets page:

```typescript
import { Database } from 'lucide-react';

// Add to navigation items
{
  name: 'Datasets',
  href: '/datasets',
  icon: Database,
}
```

---

## Implementation Order

1. **Type definitions** (`ui/src/types/dataset-types.ts`)
   - Create the file with all interfaces
   - Export types for use in other files

2. **IndexedDB service** (`ui/src/services/datasets-db.ts`)
   - Implement database initialization with object stores and indexes
   - Implement all CRUD operations
   - Test with browser dev tools (Application > IndexedDB)

3. **useDatasets hook** (`ui/src/hooks/useDatasets.ts`)
   - Create React hook wrapper around IndexedDB service
   - Handle loading states and errors
   - Test with browser dev tools

4. **AddToDatasetDialog** (`ui/src/components/datasets/AddToDatasetDialog.tsx`)
   - Create the dialog component
   - Test in isolation if possible

5. **Integrate dialog in traces pages**
   - Update `ui/src/pages/chat/traces/content.tsx`
   - Update `ui/src/components/chat/traces/TraceView.tsx`
   - Verify `flattenSpans` is accessible from contexts

6. **DatasetsPage** (`ui/src/pages/datasets/index.tsx`)
   - Create the management page
   - Implement expand/collapse, edit, delete

7. **Add routing and navigation**
   - Update `ui/src/App.tsx` with route
   - Update sidebar/navigation with link

---

## Key Patterns to Follow

### IndexedDB Pattern

The IndexedDB service (`datasets-db.ts`) follows these patterns:

```typescript
// Database initialization with version control
const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result;
  // Create object stores and indexes
  const store = db.createObjectStore('datasets', { keyPath: 'id' });
  store.createIndex('name', 'name', { unique: false });
};

// All operations are Promise-wrapped for async/await
export async function getAllDatasets(): Promise<Dataset[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Multi-store transactions for consistency
const tx = db.transaction(['datasets', 'records'], 'readwrite');
```

**Database naming**: `vllora-datasets`

### Dialog Pattern

From `EditRequestDialog.tsx`:
```typescript
import { Dialog, DialogContent } from "@/components/ui/dialog";

<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-md p-0 gap-0" onClick={(e) => e.stopPropagation()}>
    {/* Content */}
  </DialogContent>
</Dialog>
```

### Toast Notifications

From existing code:
```typescript
import { toast } from "sonner";

toast.success('Added spans to dataset', {
  description: 'Created "My Dataset"',
});

toast.error('Failed to add spans');
```

### Theme Colors

Use CSS variables for consistent theming:
```typescript
className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
className="text-[rgb(var(--theme-500))]"
className="bg-[rgb(var(--theme-500))]/10 border-[rgb(var(--theme-500))]/50"
```

### State Management Pattern

Follow the Provider/Consumer pattern from `ui/src/docs/state-management-pattern.md`:
```typescript
// Context file structure
const MyContext = createContext<MyContextType | undefined>(undefined);

export function MyProvider({ children }: { children: ReactNode }) {
  // State and logic
  return <MyContext.Provider value={value}>{children}</MyContext.Provider>;
}

export function MyConsumer() {
  const context = useContext(MyContext);
  if (context === undefined) {
    throw new Error('MyConsumer must be used within a MyProvider');
  }
  return context;
}
```

---

## Testing Checklist

### Manual Testing Steps

1. **Enable selection mode**
   - Click "Select" button in header
   - Verify checkboxes appear on span rows

2. **Select spans**
   - Click checkboxes to select multiple spans
   - Verify FloatingActionBar shows correct count

3. **Add to new dataset**
   - Click "Add to Dataset"
   - Choose "New Dataset" mode
   - Enter name and optional topic
   - Click "Add X Spans"
   - Verify toast notification
   - Verify selection cleared

4. **Add to existing dataset**
   - Select more spans
   - Click "Add to Dataset"
   - Choose existing dataset from dropdown
   - Optionally add topic
   - Verify spans added

5. **View datasets page**
   - Navigate to `/datasets`
   - Verify datasets listed
   - Expand to see records

6. **Edit dataset**
   - Rename a dataset
   - Edit record topics
   - Delete records
   - Delete dataset

7. **Persistence**
   - Refresh page
   - Verify datasets persist
   - Check IndexedDB in dev tools (Application > IndexedDB > vllora-datasets)

### Edge Cases to Test

- Empty dataset name (should show error)
- No datasets exist (should auto-show "New" mode)
- Large number of spans selected
- Span already exists in dataset (optional: warn user)
- IndexedDB errors (handle gracefully with error state)
- Browser incognito mode (IndexedDB available but data won't persist)

---

## Future Considerations

1. **IndexedDB storage**: IndexedDB provides ~50% of available disk space, but for very large datasets consider:
   - Trimming span data to essential fields only
   - Implementing pagination for records list
   - Backend API storage for cloud sync

2. **Duplicate detection**: The `spanExistsInDataset` function is implemented to check for duplicates. Consider:
   - Warning users when adding a span that already exists
   - Skip duplicates automatically option
   - Show count of skipped duplicates in toast

3. **Export/Import**: Add ability to export datasets to JSON and import from files.

4. **Evaluation features**: The `DatasetEvaluation` interface is prepared for future scoring and feedback functionality.

5. **Batch operations**: Add "Select All" for records, bulk delete, bulk topic assignment.

6. **Database migrations**: For future schema changes, increment `DB_VERSION` and handle migrations in `onupgradeneeded`.

---

## Related Files Reference

### Existing Files
| File | Purpose |
|------|---------|
| `ui/src/types/common-type.ts` | Span type definition |
| `ui/src/contexts/TracesPageContext.tsx` | Traces tab state |
| `ui/src/contexts/ChatWindowContext.tsx` | Threads tab state |
| `ui/src/hooks/useWrapperHook.ts` | Span selection state |
| `ui/src/components/chat/traces/components/FloatingActionBar.tsx` | Action bar UI |
| `ui/src/components/chat/traces/components/SelectModeToggle.tsx` | Selection toggle |
| `ui/src/components/chat/traces/components/SpanSelectionCheckbox.tsx` | Checkbox UI |
| `ui/src/pages/chat/traces/content.tsx` | Traces tab page |
| `ui/src/components/chat/traces/TraceView.tsx` | Threads tab component |
| `ui/src/App.tsx` | Router configuration |

### New Files to Create
| File | Purpose |
|------|---------|
| `ui/src/types/dataset-types.ts` | Dataset and DatasetRecord interfaces |
| `ui/src/services/datasets-db.ts` | IndexedDB service with all CRUD operations |
| `ui/src/hooks/useDatasets.ts` | React hook wrapper for IndexedDB service |
| `ui/src/components/datasets/AddToDatasetDialog.tsx` | Dialog for adding spans to datasets |
| `ui/src/pages/datasets/index.tsx` | Datasets management page |

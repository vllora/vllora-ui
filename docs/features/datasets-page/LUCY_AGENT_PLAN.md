# Lucy Agent Integration for Datasets Page

> **Status**: ✅ **IMPLEMENTED**
>
> This document describes the Lucy AI assistant integration for the Datasets page. The implementation uses a specialized `vllora-dataset-orchestrator` with three sub-agents focused on dataset-specific operations.

---

## Agent Files Location

**Backend**: `/gateway/agents/finetune-dataset/`
- `vllora-dataset-orchestrator.md` - Main orchestrator
- `vllora-dataset-ui.md` - UI manipulation agent
- `vllora-dataset-data.md` - Data operations agent
- `vllora-dataset-analysis.md` - Analysis and insights agent

> **Note**: Distri automatically serves agent files from the backend. No need to copy to `ui/public/agents/`.

---

## Agent Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        vllora-dataset-orchestrator                            │
│                                                                              │
│  Routes requests to appropriate sub-agent based on intent:                   │
│  - UI manipulation → vllora-dataset-ui                                       │
│  - Data operations → vllora-dataset-data                                     │
│  - Analysis/suggestions → vllora-dataset-analysis                            │
│                                                                              │
│  sub_agents = ["vllora-dataset-ui", "vllora-dataset-data",                   │
│                "vllora-dataset-analysis"]                                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│   vllora-dataset-ui     │ │   vllora-dataset-data   │ │ vllora-dataset-analysis │
│                         │ │                         │ │                         │
│   Manipulates UI on     │ │   Manipulates dataset   │ │   Analyzes records and  │
│   the datasets route    │ │   data in IndexedDB     │ │   suggests improvements │
│                         │ │                         │ │                         │
│   Tools:                │ │   Tools:                │ │   Tools:                │
│   - navigate_to_dataset │ │   - list_datasets       │ │   - analyze_records     │
│   - expand_dataset      │ │   - get_dataset_records │ │   - suggest_topics      │
│   - collapse_dataset    │ │   - create_dataset      │ │   - find_duplicates     │
│   - select_records      │ │   - rename_dataset      │ │   - summarize_dataset   │
│   - clear_selection     │ │   - delete_dataset      │ │   - compare_records     │
│   - open_record_editor  │ │   - delete_records      │ │                         │
│   - close_record_editor │ │   - update_record_topic │ │                         │
│   - set_search_query    │ │   - update_record_data  │ │                         │
│   - set_sort            │ │   - bulk_assign_topic   │ │                         │
│   - show_assign_topic   │ │   - get_dataset_stats   │ │                         │
│   - export_dataset      │ │   - fetch_spans         │ │                         │
│                         │ │   - add_spans_to_dataset│ │                         │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
```

---

## Agent Definitions

### 1. vllora-dataset-orchestrator

**File:** `/gateway/agents/finetune-dataset/vllora-dataset-orchestrator.md`

```toml
---
name = "vllora-dataset-orchestrator"
description = "Orchestrates dataset management tasks by routing to specialized sub-agents for UI manipulation, data operations, and analysis"
sub_agents = ["vllora-dataset-ui", "vllora-dataset-data", "vllora-dataset-analysis"]
max_iterations = 10
tool_format = "provider"
temperature = 0.3
model = "gpt-4.1"

[tools]
builtin = ["final"]
---
```

**Responsibilities:**
- Classify user intent (UI action vs data operation vs analysis)
- Route to appropriate sub-agent
- Pass through sub-agent responses verbatim
- Handle greetings and help requests directly
- For destructive operations (delete), confirm with user before proceeding

**Workflow Classification:**

| Workflow | Description | Routes To |
|----------|-------------|-----------|
| UI Navigation | "go to dataset X", "show me dataset X" | vllora-dataset-ui |
| UI Selection | "select all records", "clear selection" | vllora-dataset-ui |
| UI Expand/Collapse | "expand dataset", "collapse all" | vllora-dataset-ui |
| UI Search/Sort | "search for X", "sort by topic" | vllora-dataset-ui |
| UI Export | "export this dataset" | vllora-dataset-ui |
| Data Query | "list datasets", "how many records" | vllora-dataset-data |
| Data Create | "create new dataset", "add spans" | vllora-dataset-data |
| Data Modify | "rename dataset", "update topic" | vllora-dataset-data |
| Data Delete | "delete dataset", "remove records" | vllora-dataset-data (with confirmation) |
| Analysis | "analyze records", "summarize dataset" | vllora-dataset-analysis |
| Topic Suggestions | "suggest topics", "help me organize" | vllora-dataset-analysis |
| Find Duplicates | "find duplicates", "check for duplicates" | vllora-dataset-analysis |
| Greetings/Help | "hello", "help me" | Direct response |

---

### 2. vllora-dataset-ui

**File:** `/gateway/agents/finetune-dataset/vllora-dataset-ui.md`

```toml
---
name = "vllora-dataset-ui"
description = "Controls UI interactions on the Datasets page - navigation, selection, expand/collapse, search, sort, and export"
max_iterations = 5
tool_format = "provider"
temperature = 0.2
model = "gpt-4.1-mini"

[tools]
builtin = ["final"]
external = [
  "navigate_to_dataset",
  "expand_dataset",
  "collapse_dataset",
  "select_records",
  "clear_selection",
  "open_record_editor",
  "close_record_editor",
  "set_search_query",
  "set_sort",
  "show_assign_topic_dialog",
  "export_dataset"
]
---
```

**Tools Specification:**

| Tool | Parameters | Description |
|------|------------|-------------|
| `navigate_to_dataset` | `dataset_id: string` | Navigate to dataset detail view |
| `expand_dataset` | `dataset_id: string` | Expand a dataset in list view |
| `collapse_dataset` | `dataset_id: string` | Collapse a dataset in list view |
| `select_records` | `record_ids: string[]` | Select specific records |
| `clear_selection` | - | Clear all selected records |
| `open_record_editor` | `record_id: string` | Open the JSON editor for a record |
| `close_record_editor` | - | Close the record editor dialog |
| `set_search_query` | `query: string` | Set search filter |
| `set_sort` | `field: string, direction: string` | Set sort configuration |
| `show_assign_topic_dialog` | - | Open bulk assign topic dialog |
| `export_dataset` | `dataset_id: string` | Trigger dataset export |

---

### 3. vllora-dataset-data

**File:** `/gateway/agents/finetune-dataset/vllora-dataset-data.md`

```toml
---
name = "vllora-dataset-data"
description = "Performs data operations on datasets - CRUD operations, record management, and span fetching"
max_iterations = 8
tool_format = "provider"
temperature = 0.2
model = "gpt-4.1"

[tools]
builtin = ["final"]
external = [
  "list_datasets",
  "get_dataset_records",
  "get_dataset_stats",
  "create_dataset",
  "rename_dataset",
  "delete_dataset",
  "delete_records",
  "update_record_topic",
  "update_record_data",
  "bulk_assign_topic",
  "fetch_spans",
  "add_spans_to_dataset"
]
---
```

**Tools Specification:**

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_datasets` | - | Array of datasets with record counts |
| `get_dataset_records` | `dataset_id: string, limit?: number` | Records for a dataset |
| `get_dataset_stats` | `dataset_id: string` | Stats (count, topics, spans, evaluations) |
| `create_dataset` | `name: string` | Created dataset object |
| `rename_dataset` | `dataset_id: string, new_name: string` | Success/failure |
| `delete_dataset` | `dataset_id: string` | Success/failure (requires confirmation) |
| `delete_records` | `dataset_id: string, record_ids: string[]` | Number of records deleted (requires confirmation) |
| `update_record_topic` | `dataset_id: string, record_id: string, topic: string` | Success/failure |
| `update_record_data` | `dataset_id: string, record_id: string, data: object` | Success/failure |
| `bulk_assign_topic` | `dataset_id: string, record_ids: string[], topic: string` | Number of records updated |
| `fetch_spans` | `filters?: object, limit?: number` | Array of spans from traces |
| `add_spans_to_dataset` | `dataset_id: string, span_ids: string[], topic?: string` | Number of records added |

---

### 4. vllora-dataset-analysis

**File:** `/gateway/agents/finetune-dataset/vllora-dataset-analysis.md`

```toml
---
name = "vllora-dataset-analysis"
description = "Analyzes dataset records and provides insights - topic suggestions, duplicate detection, and summarization"
max_iterations = 8
tool_format = "provider"
temperature = 0.3
model = "gpt-4.1"

[tools]
builtin = ["final"]
external = [
  "get_dataset_records",
  "analyze_records",
  "suggest_topics",
  "find_duplicates",
  "summarize_dataset",
  "compare_records"
]
---
```

**Tools Specification:**

| Tool | Parameters | Returns |
|------|------------|---------|
| `get_dataset_records` | `dataset_id: string, limit?: number` | Records for analysis |
| `analyze_records` | `dataset_id: string, record_ids?: string[]` | Deep analysis of record content |
| `suggest_topics` | `dataset_id: string` | Suggested topic assignments based on content similarity |
| `find_duplicates` | `dataset_id: string` | Groups of potential duplicate records |
| `summarize_dataset` | `dataset_id: string` | Summary statistics and content overview |
| `compare_records` | `record_ids: string[]` | Side-by-side comparison of records |

**Capabilities:**
- Analyze input/output patterns across records
- Cluster similar records and suggest topic groupings
- Detect duplicate or near-duplicate records
- Generate dataset summaries with key insights
- Compare records to identify differences

---

## Frontend Implementation

### File Structure

```
ui/src/
├── lib/
│   └── distri-dataset-tools/
│       ├── index.ts              # Export all tools
│       ├── ui-tools.ts           # UI manipulation tools (11 tools)
│       ├── data-tools.ts         # Data operation tools (12 tools)
│       ├── analysis-tools.ts     # Analysis tools (5 tools)
│       └── types.ts              # Shared types & event definitions
├── hooks/
│   ├── useDatasetAgentChat.ts    # Dataset-specific agent hook
│   └── useDatasetToolListeners.ts # Tool event listeners hook
└── pages/datasets/
    └── index.tsx                 # Uses dataset orchestrator agent
```

> **Note**: Agent markdown files are served from `/gateway/agents/finetune-dataset/` by the backend. Distri auto-injects tool documentation via `{{available_tools}}` template variable.

### Tool Implementation Pattern

**UI Tools (`ui-tools.ts`):**

```typescript
import { DistriFnTool } from '@distri/core';
import { eventEmitter } from '@/utils/eventEmitter';

// Event-based communication with React components
export const navigateToDataset: DistriFnTool = {
  name: 'navigate_to_dataset',
  description: 'Navigate to the detail view of a specific dataset',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The ID of the dataset to navigate to',
      },
    },
    required: ['dataset_id'],
  },
  handler: async ({ dataset_id }) => {
    eventEmitter.emit('dataset:navigate', { datasetId: dataset_id });
    return JSON.stringify({ success: true, navigated_to: dataset_id });
  },
};

export const setSearchQuery: DistriFnTool = {
  name: 'set_search_query',
  description: 'Set the search filter for records',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
    },
    required: ['query'],
  },
  handler: async ({ query }) => {
    eventEmitter.emit('dataset:search', { query });
    return JSON.stringify({ success: true, search_query: query });
  },
};
```

**Data Tools (`data-tools.ts`):**

```typescript
import { DistriFnTool } from '@distri/core';
import * as datasetsDB from '@/services/datasets-db';

export const listDatasets: DistriFnTool = {
  name: 'list_datasets',
  description: 'Get all datasets with their record counts',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    const datasets = await datasetsDB.getAllDatasets();
    const withCounts = await Promise.all(
      datasets.map(async (ds) => ({
        ...ds,
        record_count: await datasetsDB.getRecordCount(ds.id),
      }))
    );
    return JSON.stringify(withCounts);
  },
};

export const createDataset: DistriFnTool = {
  name: 'create_dataset',
  description: 'Create a new dataset with the given name',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the new dataset',
      },
    },
    required: ['name'],
  },
  handler: async ({ name }) => {
    const dataset = await datasetsDB.createDataset(name);
    return JSON.stringify({ success: true, dataset });
  },
};
```

### Datasets Page Integration

**Updated `pages/datasets/index.tsx`:**

```typescript
import { useAgentChat } from '@/components/agent/useAgentChat';
import { LucyChat } from '@/components/agent/lucy-agent/LucyChat';
import { datasetUITools, datasetDataTools } from '@/lib/distri-dataset-tools';

export default function DatasetsPage() {
  // Use dataset-specific agent instead of generic orchestrator
  const {
    agent,
    selectedThreadId,
    messages,
    handleNewChat,
  } = useAgentChat('vllora-dataset-orchestrator'); // Specify agent name

  // Combine UI and data tools
  const tools = [...datasetUITools, ...datasetDataTools];

  // Listen for tool events
  useEffect(() => {
    const handleNavigate = ({ datasetId }) => {
      setSelectedDatasetId(datasetId);
    };
    const handleSearch = ({ query }) => {
      setSearchQuery(query);
    };

    eventEmitter.on('dataset:navigate', handleNavigate);
    eventEmitter.on('dataset:search', handleSearch);

    return () => {
      eventEmitter.off('dataset:navigate', handleNavigate);
      eventEmitter.off('dataset:search', handleSearch);
    };
  }, []);

  // Inject context before sending message
  const handleBeforeSendMessage = useCallback(
    async (message: DistriMessage): Promise<DistriMessage> => {
      const ctx = {
        page: 'datasets',
        current_view: selectedDatasetId ? 'detail' : 'list',
        current_dataset_id: selectedDatasetId,
        datasets_count: datasets.length,
        dataset_names: datasets.map(d => ({ id: d.id, name: d.name })),
        selected_records_count: selectedIds.size,
      };
      // ... prepend context
    },
    [datasets, selectedDatasetId, selectedIds]
  );

  return (
    <LucyChat
      threadId={selectedThreadId}
      agent={agent}
      externalTools={tools}
      initialMessages={messages}
      beforeSendMessage={handleBeforeSendMessage}
      quickActions={DATASET_QUICK_ACTIONS}
    />
  );
}
```

---

## Quick Actions

Updated quick actions for the datasets page:

```typescript
const DATASET_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'list-datasets',
    icon: '📋',
    label: 'List all my datasets',
  },
  {
    id: 'create-dataset',
    icon: '➕',
    label: 'Create a new dataset',
  },
  {
    id: 'analyze-current',
    icon: '🔍',
    label: 'Analyze current dataset',
  },
  {
    id: 'bulk-organize',
    icon: '🗂',
    label: 'Help me organize records by topic',
  },
  {
    id: 'export-dataset',
    icon: '📤',
    label: 'Export this dataset',
  },
  {
    id: 'find-duplicates',
    icon: '🔄',
    label: 'Find duplicate records',
  },
];
```

---

## Implementation Checklist

> All phases completed ✅

### Phase 1: Agent Definitions (Gateway) ✅

1. [x] Created `/gateway/agents/finetune-dataset/vllora-dataset-orchestrator.md`
   - Routing logic for UI vs data vs analysis operations
   - Sub-agent delegation
   - Confirmation handling for destructive operations

2. [x] Created `/gateway/agents/finetune-dataset/vllora-dataset-ui.md`
   - UI manipulation behaviors
   - External tools listed in TOML frontmatter

3. [x] Created `/gateway/agents/finetune-dataset/vllora-dataset-data.md`
   - Data operation behaviors
   - External tools including span fetching

4. [x] Created `/gateway/agents/finetune-dataset/vllora-dataset-analysis.md`
   - Analysis and suggestion behaviors
   - External tools for analysis

> **Note**: Agent files served from backend. No need to copy to `ui/public/agents/`.

### Phase 2: Tool Implementation (Frontend) ✅

5. [x] Created `/ui/src/lib/distri-dataset-tools/` directory

6. [x] Implemented `ui-tools.ts` (11 tools)
   - `navigate_to_dataset`, `expand_dataset`, `collapse_dataset`
   - `select_records`, `clear_selection`
   - `open_record_editor`, `close_record_editor`
   - `set_search_query`, `set_sort`
   - `show_assign_topic_dialog`, `export_dataset`

7. [x] Implemented `data-tools.ts` (12 tools)
   - `list_datasets`, `get_dataset_records`, `get_dataset_stats`
   - `create_dataset`, `rename_dataset`, `delete_dataset`
   - `delete_records`, `update_record_topic`, `update_record_data`
   - `bulk_assign_topic`, `fetch_spans`, `add_spans_to_dataset`

8. [x] Implemented `analysis-tools.ts` (5 tools)
   - `analyze_records`, `suggest_topics`, `find_duplicates`
   - `summarize_dataset`, `compare_records`

9. [x] Created `index.ts` to export all tools

### Phase 3: Page Integration ✅

10. [x] Created `useDatasetAgentChat` hook for dataset-specific agent

11. [x] Created `useDatasetToolListeners` hook for tool event handling

12. [x] Updated `pages/datasets/index.tsx`
    - Uses `vllora_dataset_orchestrator` agent
    - Imports dataset tools (UI + data + analysis)
    - Event listeners for UI tools
    - Rich context injection (view, selection, search, sort)

13. [x] Updated quick actions for datasets

---

## Example Conversations

### Example 1: Create and Populate Dataset

```
User: "Create a dataset called 'Error Analysis' and add all error spans from the last hour"

Orchestrator: Classifies as data operation → delegates to vllora-dataset-data
Data Agent:
  1. Calls create_dataset("Error Analysis") → returns dataset_id
  2. (Would need to fetch spans - may delegate back or have access to trace tools)
  3. Calls add_spans_to_dataset(dataset_id, span_ids)
  4. Returns: "Created dataset 'Error Analysis' with 23 error spans added"

Orchestrator: Passes through response to user
```

### Example 2: Navigate and Edit

```
User: "Go to the Safety Test dataset and open the first record"

Orchestrator: Classifies as UI operation → delegates to vllora-dataset-ui
UI Agent:
  1. Calls navigate_to_dataset("safety-test-id")
  2. Calls get_dataset_records to find first record
  3. Calls open_record_editor(first_record_id)
  4. Returns: "Navigated to Safety Test dataset and opened record editor"

Orchestrator: Passes through response to user
```

### Example 3: Analysis

```
User: "Summarize the topics in this dataset"

Orchestrator: Classifies as data query → delegates to vllora-dataset-data
Data Agent:
  1. Calls get_dataset_stats(current_dataset_id)
  2. Analyzes topic distribution
  3. Returns formatted markdown summary

Orchestrator: Passes through response to user
```

---

## Considerations

### Cross-Agent Communication

Some operations may require both agents:
- "Create a dataset and navigate to it" → data + UI
- "Delete selected records" → UI (get selection) + data (delete)

The orchestrator handles this by chaining sub-agent calls.

### Context Requirements

The orchestrator needs rich context:
```json
{
  "page": "datasets",
  "current_view": "detail",
  "current_dataset_id": "abc-123",
  "current_dataset_name": "Safety Test",
  "datasets_count": 5,
  "dataset_names": [{"id": "...", "name": "..."}],
  "selected_records_count": 3,
  "selected_record_ids": ["r1", "r2", "r3"],
  "search_query": "",
  "sort_config": {"field": "timestamp", "direction": "desc"}
}
```

### Error Handling

Tools should return structured errors:
```json
{
  "success": false,
  "error": "Dataset not found",
  "error_code": "DATASET_NOT_FOUND"
}
```

Agents should interpret errors and provide helpful responses to users.

### Span Access

The data agent has access to span fetching tools (`fetch_spans`) to directly query and add spans to datasets without requiring users to go to the Traces view first.

---

### Confirmation Handling

Destructive operations require confirmation before execution:

**Operations requiring confirmation:**
- `delete_dataset` - Deletes entire dataset and all records
- `delete_records` - Deletes selected records

**Confirmation flow:**
1. User requests: "Delete this dataset"
2. Orchestrator asks: "Are you sure you want to delete 'Safety Test' dataset with 124 records? This cannot be undone."
3. User confirms: "Yes, delete it"
4. Orchestrator delegates to data agent with confirmed flag
5. Data agent executes deletion
6. Response returned to user

**Implementation:**
```typescript
// Tool returns confirmation request
{
  "requires_confirmation": true,
  "message": "Delete dataset 'Safety Test' with 124 records?",
  "action": "delete_dataset",
  "params": { "dataset_id": "abc-123" }
}

// After user confirms, tool is called with confirmed flag
delete_dataset({ dataset_id: "abc-123", confirmed: true })
```

---

## Decisions Made

Based on review feedback:

| Question | Decision |
|----------|----------|
| Span access for data agent | ✅ Has access to `fetch_spans` tool |
| Analyze & suggest capability | ✅ Separate `vllora-dataset-analysis` agent |
| Confirmation prompts | ✅ Required for delete operations |
| Cross-reference with traces | ❌ Not needed |

---

## Future Considerations

1. **Batch Analysis** - For large datasets, analysis tools may need pagination or sampling strategies.

2. **Topic Learning** - The analysis agent could learn from user's topic assignments to improve suggestions over time.

3. **Import Datasets** - Ability to import datasets from JSON files.

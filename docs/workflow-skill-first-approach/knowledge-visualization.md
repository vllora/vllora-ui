# Knowledge Visualization Architecture

## Overview

Knowledge visualization is the **read-only** UI layer for viewing reference documents (PDFs, images, URLs) that the finetune skill extracts and writes to the gateway API. The frontend never uploads or processes documents itself -- all writes flow through the CLI skill via gateway endpoints. The UI fetches structured knowledge data from the gateway and renders it in a VS Code-style explorer tree with type-aware content viewers.

This design follows the **skill-first** principle: the skill handles extraction and persistence, the UI handles display and navigation.

## Data Model

Knowledge is stored as a two-level parent-child hierarchy in the gateway's SQLite database.

### KnowledgeSource (parent)

Represents one reference document (e.g., `chess-openings.pdf`).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Primary key |
| `referenceId` | `string?` | External ref (e.g., original filename) |
| `workflowId` | `string` | Links to the parent workflow/dataset |
| `name` | `string` | Display name |
| `description` | `string?` | Optional description |
| `metadata` | `Record<string, unknown>?` | Arbitrary metadata blob |
| `parts` | `KnowledgeSourcePart[]` | Nested child parts |
| `createdAt` | `string` | ISO timestamp |

### KnowledgeSourcePart (child)

One extracted piece of content from a source. Three part types cover all content modalities.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID) | Primary key |
| `referenceId` | `string?` | External ref |
| `sourceId` | `string` | FK to parent source |
| `type` | `'text' \| 'image' \| 'table'` | Content modality |
| `content` | `string` | The extracted content (text, base64/URL, or markdown table) |
| `contentMetadata` | `Record<string, unknown>?` | Content-specific metadata |
| `title` | `string?` | Section/page title |
| `extractionPath` | `string?` | Location in source doc (e.g., `page:3`) |
| `extractionMetadata` | `Record<string, unknown>?` | Extraction provenance (e.g., `pageStart`, `pageEnd`) |

**Type definitions:** `src/types/knowledge-types.ts`

## Backend API Contract

All endpoints are under `/finetune/workflows/{workflowId}/knowledge`. The gateway serves data from SQLite.

### Endpoints Used by the Frontend

| Method | Path | Response Shape |
|--------|------|----------------|
| `GET` | `/knowledge` | `{ knowledge_sources: KnowledgeSource[] }` — sources with nested parts |
| `GET` | `/knowledge/{id_or_ref}` | `KnowledgeSource` — single source with parts (404 if not found) |
| `GET` | `/knowledge/count` | `{ count: number }` |
| `DELETE` | `/knowledge/{id_or_ref}` | `{ deleted: boolean }` — soft delete |
| `DELETE` | `/knowledge` | `{ deleted: number }` — soft delete all |

### Key API Behaviors

- **Nested response**: The `list` endpoint returns sources with parts pre-loaded in a single GET -- no second request needed.
- **Identifier flexibility**: GET and DELETE accept either UUID `id` or `reference_id`.
- **Soft delete**: Sources are marked with a `deleted_at` timestamp, not physically removed.
- **snake_case wire format**: The BE returns `snake_case` field names (`reference_id`, `workflow_id`, `content_metadata`). The adapter maps these to `camelCase` for the FE.

### Write Endpoints (Skill-Only)

The skill (not the FE) calls these to persist extracted content:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/knowledge` | Create source (multipart: name, file, parts[], description, metadata) |
| `POST` | `/knowledge/{id_or_ref}/parts` | Add parts to existing source |

## Frontend Architecture

Four layers connect the gateway API to the React component tree.

```
Gateway API
    |
    v
Service Interface  (src/services/interfaces/knowledge-source-service.ts)
    |
    v
API Adapter        (src/services/adapters/api-knowledge-source-adapter.ts)
    |
    v
React Context      (src/contexts/KnowledgeSourcesContext.tsx)
    |
    v
Components         (KnowledgeSourcesPanel, KnowledgeSourceViewer, KnowledgePartViewer)
```

### Service Interface

Defines the contract consumed by the context and components. Read-only operations plus delete (for user-initiated cleanup).

```typescript
interface KnowledgeSourceService {
  list(workflowId: string): Promise<KnowledgeSource[]>;
  get(workflowId: string, idOrRef: string): Promise<KnowledgeSource | null>;
  getCount(workflowId: string): Promise<number>;
  delete(workflowId: string, idOrRef: string): Promise<void>;
  deleteAll(workflowId: string): Promise<void>;
}
```

**File:** `src/services/interfaces/knowledge-source-service.ts`

### API Adapter

Maps between the BE's `snake_case` wire format and the FE's `camelCase` types. Two internal mapper functions (`mapPart`, `mapSource`) handle the conversion. Null BE fields become `undefined` in the FE types.

**File:** `src/services/adapters/api-knowledge-source-adapter.ts`

### KnowledgeSourcesContext

Single source of truth for knowledge sources within a dataset. Eliminates duplicate fetching -- previously multiple components independently fetched on every update event.

**Provided state:**

| Field | Type | Description |
|-------|------|-------------|
| `sources` | `KnowledgeSource[]` | All sources with nested parts |
| `count` | `number` | Number of sources |
| `totalParts` | `number` | Total parts across all sources |
| `hasLoaded` | `boolean` | Whether initial fetch completed |
| `refreshSources` | `() => void` | Trigger manual refresh |

**Reactivity:** Listens to the `vllora_knowledge_source_updated` event (emitted when the skill writes new data via the gateway). On event, re-fetches the full list for the matching `workflowId`.

**File:** `src/contexts/KnowledgeSourcesContext.tsx`

## Navigation Flow

### Explorer Tree (3-Level Hierarchy)

The `DatasetExplorer` builds a VS Code-style file tree with knowledge sources as a section. The tree only appears when there are sources (`sources.length > 0`).

```
knowledge/                          Section node (Library icon, blue)
  |                                 Badge: source count
  +-- chess-openings.pdf            Source node (FileText icon, blue)
  |   |                             Badge: record count or part count
  |   +-- Introduction              Part node (Type icon, green = text)
  |   +-- Board Diagram             Part node (ImageIcon, purple = image)
  |   +-- Opening Statistics        Part node (Table2 icon, amber = table)
  +-- endgame-tactics.pdf
      +-- ...
```

**Part display names:** Uses `part.title` if available, otherwise falls back to `{Type} #{index + 1}`.

**Type-specific icons:**
- Text: `Type` (green)
- Image: `ImageIcon` (purple)
- Table: `Table2` (amber)

**File:** `src/components/datasets/sidebars/DatasetExplorer.tsx` (knowledge section around line 253)

### Path Routing

Explorer node IDs double as path strings. `TabContentRouter` maps paths to the `"knowledge"` content section, and helper functions extract source/part IDs.

| Path Pattern | Helper Function | Returns |
|-------------|-----------------|---------|
| `knowledge/` | `mapTabPathToSection` | `"knowledge"` section |
| `knowledge/{sourceId}` | `getKnowledgeSourceIdFromPath` | source UUID |
| `knowledge/{sourceId}/{partId}` | `getKnowledgePartIdFromPath` | part UUID |

**File:** `src/components/datasets/TabContentRouter.tsx`

### Content View Selection

`DatasetDetailContentV2` uses the extracted IDs to pick the correct viewer:

```
knowledge/                       -> KnowledgeSourcesPanel  (folder-level list)
knowledge/{sourceId}             -> KnowledgeSourceViewer   (all parts in one doc)
knowledge/{sourceId}/{partId}    -> KnowledgePartViewer     (single part, type-specific)
```

**File:** `src/components/datasets/DatasetDetailContentV2.tsx` (around line 897)

## Three Content Views

### 1. KnowledgeSourcesPanel (Folder Level)

Shows all knowledge sources as cards in a scrollable list. Rendered when navigating to `knowledge/` without a source ID.

**Features:**
- Source cards with expand/collapse to preview parts
- Record count and coverage percentage per source (via `computeSourceRecordStats`)
- Delete individual sources
- Refresh button to re-fetch from gateway
- Empty state: "No reference documents yet -- Lucy will add knowledge sources as part of the finetune workflow"
- Emits `vllora_filter_by_source` on filter-by-source click

**File:** `src/components/datasets/KnowledgeSourcesPanel.tsx`

### 2. KnowledgeSourceViewer (Source Level)

Full-content viewer for a single source. Shows all extracted text chunks with headings, page ranges, and non-text parts (tables, images). Rendered when navigating to `knowledge/{sourceId}`.

**Features:**
- **Search**: Debounced text search with yellow highlighting across all chunks
- **Expand/collapse**: Each chunk (text section) is collapsible, showing heading + summary when collapsed, full sentences when expanded
- **Record count badges**: Per-chunk count of how many training records reference that chunk (via `chunkRecordCounts` map with `sourceId:chunkId` keys)
- **Semantic chunks**: Text parts are split into sentence-level display with page range metadata (`pageStart`/`pageEnd` from `extractionMetadata`)
- **Non-text parts**: Table and image parts render inline with type badges and icons
- **Chunk highlight + scroll**: Responds to `vllora_highlight_chunks` events for record-to-source navigation (see Cross-Navigation below)
- **Context term highlighting**: When navigating from a record, extracts significant terms from the record text and highlights matching sentences in violet

**File:** `src/components/datasets/KnowledgeSourceViewer.tsx`

### 3. KnowledgePartViewer (Part Level)

Individual part viewer with type-specific rendering. Rendered when navigating to `knowledge/{sourceId}/{partId}`.

**Features:**
- Header with type badge (color-coded), part title, and source breadcrumb
- Type-specific content area (see Type-Specific Rendering below)

**File:** `src/components/datasets/KnowledgePartViewer.tsx`

## Type-Specific Rendering

Each part type has a dedicated renderer in `KnowledgePartViewer`:

### Text Parts (`TextContent`)
- Splits `content` on double newlines into paragraphs
- Renders as prose with relaxed line height

### Table Parts (`TableContent`)
- Detects markdown tables (pipe-delimited rows)
- If markdown: parses into HTML `<table>` with header row and hover-highlighted body rows
- If not markdown: renders as monospace `<pre>` block
- Scrollable horizontally for wide tables

### Image Parts (`ImageContent`)
- Checks if `content` is a URL or base64 data URI
- If yes: renders as `<img>` with max dimensions and object-fit contain
- If no: renders content as a text description in a styled container

## Cross-Navigation

Two browser-level events enable bidirectional navigation between records and knowledge sources.

### Record to Source (`vllora_highlight_chunks`)

When a user clicks a source badge on a training record, the system:

1. Dispatches a `vllora_highlight_chunks` CustomEvent with `{ sourceId, chunkRefs, recordText }`
2. `KnowledgeSourceViewer` listens on `window` for this event
3. Parses chunk refs (format: `sourceId:chunkId`) via `parseChunkRef`
4. Auto-expands matching chunks and scrolls the first one into view
5. Extracts significant terms from `recordText` (filtering stop words, capped at 20 terms)
6. Highlights sentences that match 2+ context terms with a violet left-border style
7. Clears highlight after 6 seconds

**Fallback matching:** If source IDs don't match (e.g., after re-upload), falls back to matching chunk IDs alone against local chunks.

### Tab Switching (`vllora_switch_tab`)

Used to navigate from any component to the knowledge panel. The `DatasetDetailContentV2` listens for `vllora_open_drawer` with `type: 'docs'` and opens a workspace tab at `knowledge/`.

### Source Filtering (`vllora_filter_by_source`)

Emitted by `KnowledgeSourcesPanel` when the user clicks "filter by source" on a card. Consumed by the records table to filter records linked to that source.

## Design Rationale

### VS Code-Style Explorer Tree

The three-level tree (section, source, part) mirrors how developers think about documents: a folder of files, each containing sections. It reuses the existing `DatasetExplorer` file tree infrastructure, keeping the UX consistent with other dataset sections (data/, evaluations/, finetune/).

### Read-Only Frontend

The skill handles all document extraction and persistence. This avoids duplicating extraction logic in the browser, keeps the FE thin, and ensures the gateway SQLite database is the single source of truth. The only write operation exposed to the UI is delete (cleanup).

### Type-Aware Viewers

Different content types need different rendering: tables as HTML grids, images as visual elements, text as prose with search. The three-renderer pattern in `KnowledgePartViewer` and the mixed-content display in `KnowledgeSourceViewer` handle this without forcing all content into a single format.

### Context as Single Source of Truth

`KnowledgeSourcesContext` centralizes fetching and caching. Without it, multiple components (explorer, content area, plan section) would independently fetch on every `vllora_knowledge_source_updated` event, causing redundant API calls and inconsistent state.

### Event-Driven Refresh

The `vllora_knowledge_source_updated` event bridges the gap between the skill (which writes data asynchronously) and the UI (which needs to display updates). The context listens once and shares the result, so adding new consumers does not add new fetch calls.

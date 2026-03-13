# Knowledge Visualization

## Overview

The skill extracts knowledge from documents (PDF, images, URLs) and writes structured data to the gateway API. The UI reads this data and renders it in the explorer sidebar as a **KNOWLEDGE** tree with content viewers for each part type.

## BE API Contract

### Data Model

```
KnowledgeSource (parent)
├── id: string (UUID)
├── reference_id: string | null        — external ref (e.g. original filename)
├── workflow_id: string                 — links to workflow/dataset
├── name: string                        — display name (e.g. "chess-openings.pdf")
├── description: string | null          — optional description
├── metadata: JSON | null               — arbitrary metadata blob
└── part: KnowledgeSourcePart[]         — nested child parts
    ├── id: string (UUID)
    ├── reference_id: string | null
    ├── source_id: string               — FK to parent source
    ├── type: "text" | "image" | "table"
    ├── content: string                 — the extracted content
    ├── content_metadata: JSON | null   — content-specific metadata
    ├── title: string | null            — section/page title
    ├── extraction_path: string | null  — location in source doc (e.g. "page:3")
    └── extraction_metadata: JSON | null — extraction provenance
```

### Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/finetune/workflows/{wf}/knowledge` | `{ knowledge_sources: KnowledgeSource[] }` |
| GET | `/finetune/workflows/{wf}/knowledge/{id_or_ref}` | `KnowledgeSource` (with nested parts) |
| GET | `/finetune/workflows/{wf}/knowledge/count` | `{ count: number }` |
| POST | `/finetune/workflows/{wf}/knowledge` | Multipart: `name`, `file`, `parts[]`, `description`, `metadata` |
| POST | `/finetune/workflows/{wf}/knowledge/{id_or_ref}/parts` | `Vec<NewKnowledgeSourcePart>` → `{ parts: KnowledgeSourcePart[] }` |
| GET | `/finetune/workflows/{wf}/knowledge/{id_or_ref}/parts` | `{ parts: KnowledgeSourcePart[] }` |
| DELETE | `/finetune/workflows/{wf}/knowledge/{id_or_ref}/parts/{part_id}` | `{ deleted: true }` |
| DELETE | `/finetune/workflows/{wf}/knowledge/{id_or_ref}` | `{ deleted: true }` (soft delete) |
| DELETE | `/finetune/workflows/{wf}/knowledge` | `{ deleted: count }` (soft delete all) |

**Note:** `update_status` and `update_chunks` are deprecated (return 501). Parts are managed via the `/parts` sub-resource.

### Key Observations

1. **Nested response**: `list_typed` returns sources with parts pre-loaded — one GET fetches everything
2. **Identifier flexibility**: GET/DELETE accept either `id` (UUID) or `reference_id`
3. **Soft delete**: Sources are soft-deleted (`deleted_at` timestamp), not physically removed
4. **File storage**: `create` stores uploaded file to disk at `KNOWLEDGE_STORAGE_DIR/{workflow_id}/{source_id}/{filename}`

## New FE Types

Replace the stale `KnowledgeSource` in `types/dataset-types.ts` with types that match the BE:

```typescript
// types/knowledge-types.ts (new file, replaces knowledge section in dataset-types.ts)

export type KnowledgePartType = 'text' | 'image' | 'table';

export interface KnowledgeSourcePart {
  readonly id: string;
  readonly referenceId?: string;
  readonly sourceId: string;
  readonly type: KnowledgePartType;
  readonly content: string;
  readonly contentMetadata?: Record<string, unknown>;
  readonly title?: string;
  readonly extractionPath?: string;
  readonly extractionMetadata?: Record<string, unknown>;
}

export interface KnowledgeSource {
  readonly id: string;
  readonly referenceId?: string;
  readonly workflowId: string;
  readonly name: string;
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
  readonly parts: KnowledgeSourcePart[];
  readonly createdAt: string;
}
```

**Changes from current types:**
- Removed: `type` (pdf/image/url/text/markdown), `status`, `content`, `extractedContent`, `progress`, `size`, `mimeType`, `error`, `comment`, `needsLlmExtraction`, `extractionPhase`, `processedAt`
- Added: `parts[]` (nested), `description`, `metadata`, `referenceId`
- `createdAt` stays as ISO string (matches BE)

## Adapter Rewrite

Replace `api-knowledge-source-adapter.ts` with a slim adapter matching the real BE contract:

```typescript
// services/adapters/api-knowledge-source-adapter.ts

interface DbKnowledgeSourcePartResponse {
  readonly id: string;
  readonly reference_id: string | null;
  readonly source_id: string;
  readonly type: KnowledgePartType;         // BE uses serde rename "type"
  readonly content: string;
  readonly content_metadata: unknown | null;
  readonly title: string | null;
  readonly extraction_path: string | null;
  readonly extraction_metadata: unknown | null;
}

interface DbKnowledgeSourceResponse {
  readonly id: string;
  readonly reference_id: string | null;
  readonly workflow_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly metadata: unknown | null;
  readonly part: DbKnowledgeSourcePartResponse[];  // BE field name is "part"
}

function mapPartToFe(db: DbKnowledgeSourcePartResponse): KnowledgeSourcePart {
  return {
    id: db.id,
    referenceId: db.reference_id ?? undefined,
    sourceId: db.source_id,
    type: db.type,
    content: db.content,
    contentMetadata: db.content_metadata as Record<string, unknown> | undefined ?? undefined,
    title: db.title ?? undefined,
    extractionPath: db.extraction_path ?? undefined,
    extractionMetadata: db.extraction_metadata as Record<string, unknown> | undefined ?? undefined,
  };
}

function mapToFe(db: DbKnowledgeSourceResponse): KnowledgeSource {
  return {
    id: db.id,
    referenceId: db.reference_id ?? undefined,
    workflowId: db.workflow_id,
    name: db.name,
    description: db.description ?? undefined,
    metadata: db.metadata as Record<string, unknown> | undefined ?? undefined,
    parts: (db.part ?? []).map(mapPartToFe),
    createdAt: /* from list response — TBD, may need BE change */,
  };
}
```

### Service Interface Simplification

The current `KnowledgeSourceService` interface has methods for client-side extraction (`updateStatus`, `updateProgress`, `updateChunks`). These are dead in the skill-first world. New interface:

```typescript
export interface KnowledgeSourceService {
  list(workflowId: string): Promise<KnowledgeSource[]>;
  get(workflowId: string, idOrRef: string): Promise<KnowledgeSource | null>;
  getCount(workflowId: string): Promise<number>;
  // Write methods (used by skill, not UI — but keeping for completeness)
  delete(workflowId: string, idOrRef: string): Promise<void>;
  deleteAll(workflowId: string): Promise<void>;
}
```

## Explorer Tree Design

Current "documents" section becomes "KNOWLEDGE" with a richer tree:

```
KNOWLEDGE (3)                          ← section node, count = # of sources
├── chess-openings.pdf (12 parts)      ← source node, count = # of parts
│   ├── [T] Introduction               ← text part (title from part.title)
│   ├── [T] Italian Game               ← text part
│   ├── [I] Board Diagram: Italian     ← image part
│   ├── [T] Sicilian Defense           ← text part
│   └── [⊞] Opening Statistics        ← table part
├── endgame-tactics.pdf (8 parts)
│   ├── [T] Basic Endgames
│   └── ...
└── strategy-guide-url (5 parts)
```

### Node Design

| Level | Node type | Icon | Badge | Click action |
|-------|-----------|------|-------|-------------|
| Section | `KNOWLEDGE` | `Library` | source count | expand/collapse |
| Source | `chess-openings.pdf` | `FileText` (blue) | part count | expand + show source summary |
| Part (text) | title or "Text #N" | `Type` (green) | — | show text content viewer |
| Part (image) | title or "Image #N" | `Image` (purple) | — | show image content viewer |
| Part (table) | title or "Table #N" | `Table2` (amber) | — | show table content viewer |

### Part Display Names

```typescript
function getPartDisplayName(part: KnowledgeSourcePart, index: number): string {
  if (part.title) return part.title;
  const typeLabel = { text: 'Text', image: 'Image', table: 'Table' }[part.type];
  return `${typeLabel} #${index + 1}`;
}
```

## Content Viewers

When a user clicks a knowledge part in the explorer, the main content area shows a viewer.

### Text Part Viewer
- Renders `part.content` as markdown (already have a markdown renderer)
- Header shows: title, extraction path (e.g., "Page 3-5"), source name
- Optional: highlight search terms if coming from a search

### Image Part Viewer
- `part.content` is base64 or a URL — render as `<img>`
- `part.contentMetadata` may contain `{ width, height, alt_text }`
- Fallback: show content as text if not a valid image

### Table Part Viewer
- `part.content` is markdown table or JSON array
- Parse and render as a proper HTML table with headers
- If JSON: `[{ col1: val1, col2: val2, ... }, ...]`
- If markdown: parse pipe-delimited table

### Source Summary Viewer
When clicking a source node (not a part), show:
- Source name, description, metadata
- Part count by type (e.g., "8 text, 2 images, 1 table")
- List of all parts as clickable links

## Context Updates

### KnowledgeSourcesContext

Update to use new types and expose parts:

```typescript
interface KnowledgeSourcesContextType {
  sources: KnowledgeSource[];         // with nested parts
  count: number;                       // # of sources
  totalParts: number;                  // # of parts across all sources
  hasLoaded: boolean;
  refreshSources: () => void;
}
```

Remove: `processingCount`, `isProcessing`, `processingSources` — no client-side processing in skill-first mode.

### Event Handling

Keep `vllora_knowledge_source_updated` event for SSE-triggered refreshes when the skill writes new data via the gateway API. The gateway can broadcast SSE events after knowledge source mutations.

## Relationship to Topics & Records

Parts can be referenced by topics via `sourceChunkRefs` (existing field on `TopicHierarchyNode`):

```
Topic "Italian Game"
  sourceChunkRefs: ["source-uuid:part-uuid-1", "source-uuid:part-uuid-2"]
```

And by records for provenance tracking. This enables:
- **Coverage visualization**: which parts have training data
- **Reference links**: click a ref in a record to jump to the knowledge part
- **Gap analysis**: parts without any linked records = potential coverage gaps

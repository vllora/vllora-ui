# Migration Plan

Step-by-step plan for migrating from the legacy knowledge source visualization to the new skill-first approach.

## Phase 1: New FE Types

**Goal:** Replace stale FE types with ones matching the real BE API.

**Files:**
- New: `src/types/knowledge-types.ts` — `KnowledgeSource`, `KnowledgeSourcePart`, `KnowledgePartType`
- Edit: `src/types/dataset-types.ts` — remove old `KnowledgeSource`, `KnowledgeSourceType`, `KnowledgeSourceStatus`, `KnowledgeSourceProgress`, `ExtractedContent` types. Keep the `KnowledgeCoverageStats` type (still used by coverage analysis).

**Verification:** `npx tsc --noEmit` — will show all downstream breakages (expected).

## Phase 2: Adapter Rewrite

**Goal:** Make the API adapter match what the BE actually returns.

**Files:**
- Rewrite: `src/services/adapters/api-knowledge-source-adapter.ts`
  - New `DbKnowledgeSourceResponse` and `DbKnowledgeSourcePartResponse` matching BE JSON
  - New `mapToFe` / `mapPartToFe` functions
  - Simplified methods: `list`, `get`, `getCount`, `delete`, `deleteAll`
  - Remove dead methods: `create`, `updateStatus`, `updateProgress`, `updateChunks`, `search`
- Rewrite: `src/services/interfaces/knowledge-source-service.ts`
  - Slim interface with only the methods the UI needs (read + delete)
  - Remove `CreateKnowledgeSourceOptions`, `UpdateStatusOptions` types
- Update: `src/services/service-registry.ts` — no change needed (same export name)

**Verification:** `npx tsc --noEmit` — adapter compiles, remaining errors are consumers.

## Phase 3: Context Update

**Goal:** Update `KnowledgeSourcesContext` to use new types and drop processing state.

**Files:**
- Rewrite: `src/contexts/KnowledgeSourcesContext.tsx`
  - Import from `@/types/knowledge-types` instead of `@/types/dataset-types`
  - Remove `processingCount`, `isProcessing`, `processingSources` from context value
  - Add `totalParts` computed from `sources.flatMap(s => s.parts).length`
  - Keep `vllora_knowledge_source_updated` event listener for SSE refresh

**Downstream consumers to update:**
- Any component reading `isProcessing` or `processingSources` — remove or replace

**Verification:** `npx tsc --noEmit` — context + direct consumers compile.

## Phase 4: Explorer Tree — KNOWLEDGE Node

**Goal:** Replace "documents" section with "KNOWLEDGE" tree showing sources → parts.

**Files:**
- Edit: `src/components/datasets/sidebars/DatasetExplorer.tsx`
  - Rename section from `"documents"` to `"knowledge"`
  - Build 3-level tree: section → source → parts
  - Use icons per part type: `Type` (text), `Image` (image), `Table2` (table)
  - Source badge shows part count instead of processing status
  - Part nodes use `knowledge/{sourceId}/{partId}` as IDs for selection

**Changes to tree node IDs:**
| Old | New |
|-----|-----|
| `documents` | `knowledge` |
| `documents/{sourceId}` | `knowledge/{sourceId}` |
| — | `knowledge/{sourceId}/{partId}` |

**Verification:** Visual — explorer shows KNOWLEDGE tree with correct structure.

## Phase 5: Content Viewers

**Goal:** Build viewers for each part type.

**New files:**
- `src/components/datasets/viewers/KnowledgePartViewer.tsx` — router component that picks the right viewer based on `part.type`
- `src/components/datasets/viewers/TextPartViewer.tsx` — renders markdown content with header (title, extraction path, source name)
- `src/components/datasets/viewers/ImagePartViewer.tsx` — renders base64/URL image with metadata
- `src/components/datasets/viewers/TablePartViewer.tsx` — parses markdown table or JSON array → HTML table
- `src/components/datasets/viewers/KnowledgeSourceSummary.tsx` — overview when clicking a source node (part breakdown, description)

**Integration:**
- Edit: `src/components/datasets/DatasetDetailContentV2.tsx` (or wherever the main content area routes) — add case for `knowledge/{sourceId}/{partId}` selection → render `KnowledgePartViewer`
- Add case for `knowledge/{sourceId}` selection → render `KnowledgeSourceSummary`

**Verification:** Click each part type in explorer → correct viewer renders.

## Phase 6: Dead Code Cleanup

**Goal:** Remove legacy knowledge code that's no longer used.

**Files to audit:**
- `src/types/dataset-types.ts` — remove `KnowledgeSourceType`, `KnowledgeSourceStatus`, `KnowledgeSourceProgress`, `ExtractedContent`, old `KnowledgeSource` interface, `MarkdownPurpose`
- `src/services/interfaces/knowledge-source-service.ts` — remove `CreateKnowledgeSourceOptions`, `UpdateStatusOptions`
- `src/types/knowledge-types.ts` — audit `SearchResult`, `ChunkMatch` — remove if unused
- Any Lucy-specific knowledge tools in `src/lib/distri-finetune-tools/` that did client-side extraction — audit and remove if dead

**Verification:** `npx tsc --noEmit` + `grep` for removed type names → zero hits.

## Phase 7: SSE Integration (Optional Enhancement)

**Goal:** Live-update knowledge tree when the skill writes new data.

**Requires BE change:** Gateway broadcasts SSE event after knowledge source mutations.

**FE change:**
- `src/contexts/project-events/dto.tsx` — add `CustomKnowledgeUpdatedEventType`
- `src/contexts/KnowledgeSourcesContext.tsx` — subscribe to SSE event → call `refreshSources()`

This is optional for Phase 1 launch — manual page refresh works as a fallback.

---

## Execution Order

```
Phase 1 (types) → Phase 2 (adapter) → Phase 3 (context)
  → Phase 4 (explorer tree) → Phase 5 (content viewers)
  → Phase 6 (dead code cleanup)
  → Phase 7 (SSE, optional)
```

Phases 1-3 are foundational and must be sequential. Phases 4 and 5 can be developed in parallel after Phase 3. Phase 6 is a cleanup pass after everything works.

## What to Keep

- `KnowledgeCoverageStats` type — still used by coverage analysis features
- `sourceChunkRefs` on `TopicHierarchyNode` — still the link between topics and knowledge parts
- `vllora_knowledge_source_updated` event — rename if needed, but keep the refresh mechanism
- Explorer tree infrastructure (`FileTreeNode`, expand/collapse, badges) — reuse as-is

## What to Remove

- All client-side extraction logic (was in Lucy tools, now handled by skill)
- `KnowledgeSourceStatus` / processing state tracking — skill writes finished data
- `updateStatus` / `updateProgress` / `updateChunks` adapter methods — deprecated on BE
- Legacy `KnowledgeSource` type with `type`, `status`, `content`, `extractedContent` fields

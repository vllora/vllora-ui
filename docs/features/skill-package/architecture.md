# Skill Package — Architecture & Source Map

## Source Files

### Core Implementation

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/distri-finetune-tools/steps/generate-skill-package.ts` | ~900 | **Main file** — assembles all skill package content from Gateway API |
| `src/lib/distri-finetune-tools/steps/download-skill-package.ts` | ~88 | Triggers browser download of a generated ZIP blob |

### UI Components

| File | Purpose |
|------|---------|
| `src/components/datasets/SkillFileViewer.tsx` | Renders skill files in the workspace (markdown preview/edit, JSONL conversation viewer) |
| `src/components/datasets/sidebars/DatasetExplorer.tsx` | Explorer sidebar tree — builds the `skill/` subtree with file navigation |
| `src/components/datasets/TabContentRouter.tsx` | Routes `skill/*` tab paths to `SkillFileViewer` |

### Supporting

| File | Purpose |
|------|---------|
| `src/components/datasets/conversation-data-table/` | JSONL conversation viewer (parses JSONL, renders user/assistant cards) |
| `src/lib/distri-finetune-tools/steps/shared/knowledge-context.ts` | Knowledge source context builder (used by topic generation, not directly by skill packaging) |

---

## Key Types

### `SkillPackageFiles` (exported)

The assembled package content — no ZIP, no side effects. Used by both the tool handler (for ZIP assembly) and `SkillFileViewer` (for in-app preview).

```typescript
interface SkillPackageFiles {
  readonly skillName: string;           // Human-readable name
  readonly skillSlug: string;           // Slugified for folder/file names
  readonly skillMd: string;             // Full SKILL.md content
  readonly resourcesIndex: string;      // resources/index.md content
  readonly topicFiles: ReadonlyMap<string, string>;  // slug -> JSONL content
  readonly knowledgeDoc: string | null; // knowledge/domain-knowledge.md or null
  readonly sectionFiles: ReadonlyMap<string, string>; // path -> section markdown content
}
```

### `SkillJsonlRow` (internal)

One row in a per-topic JSONL file. No `system` field — SKILL.md provides role context.

```typescript
interface SkillJsonlRow {
  readonly user: string;
  readonly assistant: string;
  readonly eval_scores: Readonly<Record<string, number>>;
  readonly sources: readonly string[];
}
```

### `TopicGroup` (internal)

Records grouped by leaf topic, ready for JSONL serialization.

```typescript
interface TopicGroup {
  readonly topicPath: string;           // e.g. "Tactical Patterns/Pins"
  readonly slug: string;                // e.g. "tactical-patterns/pins"
  readonly records: readonly DatasetRecord[];
  readonly rows: readonly SkillJsonlRow[];
  readonly diversityScore: number | null;
}
```

### `SectionEntry` (internal)

One extracted section from a knowledge source, with full content for file generation.

```typescript
interface SectionEntry {
  readonly sourceName: string;    // Original document name
  readonly sourceSlug: string;    // Slugified source name
  readonly title: string;         // Section heading
  readonly slug: string;          // Slugified heading
  readonly content: string;       // Full markdown content for the file
  readonly pageRange?: string;    // e.g. "pp.16-21" (modern path only)
}
```

### `KnowledgeSectionEntry` (exported)

Lightweight metadata for sidebar display — no content, just path and title.

```typescript
interface KnowledgeSectionEntry {
  readonly path: string;   // e.g. "sections/chess-guide-pins.md"
  readonly title: string;  // e.g. "3.2 Pins"
}
```

---

## Key Functions

### Assembly Pipeline

These functions execute in order during `assembleSkillPackageFiles()`:

| Function | Input | Output | Notes |
|----------|-------|--------|-------|
| `assembleSkillPackageFiles(datasetId)` | Dataset ID | `SkillPackageFiles \| null` | **Main entry point**. Fetches all data from IndexedDB, delegates to builders. Zero LLM calls, ~100ms. |
| `groupByTopic(records, hierarchy)` | Records + hierarchy | `TopicGroup[]` | Groups records by `record.topic`, resolves full paths via hierarchy, sorts alphabetically |
| `assembleJsonlRow(record)` | `DatasetRecord` | `SkillJsonlRow \| null` | Extracts user message from `record.data.input.messages`, assistant from `record.metadata.skillResponse`, eval scores from `record.evaluations` |
| `buildTopicJsonl(rows)` | `SkillJsonlRow[]` | JSONL string | Serializes rows to JSONL. Only includes non-empty optional fields (`eval_scores`, `sources`) |
| `buildResourcesIndex(groups, total)` | Topic groups | Markdown string | Builds the topic map table. Conditionally includes Diversity column |
| `buildSectionFiles(sources)` | `KnowledgeSource[]` | `{ files: Map, entries: Array }` | Builds per-section markdown files + metadata entries |
| `buildKnowledgeDoc(sources, entries)` | Sources + section entries | Markdown string or null | Builds reference TABLE pointing to section files (not full content) |
| `buildSkillMarkdown(params)` | All assembled data | SKILL.md string | Builds YAML frontmatter (TRIGGER/DO NOT TRIGGER) + markdown body |

### Knowledge Section Builders

Knowledge content is split into individual section files. Three functions handle this:

| Function | Purpose | Notes |
|----------|---------|-------|
| `collectSectionsFromSources(sources)` | Extracts `SectionEntry[]` from all ready knowledge sources | Handles both modern (`metadata.chunks` with `text` field) and legacy (`extractedContent.sections`) paths |
| `buildSectionFiles(sources)` | Wraps `collectSectionsFromSources`, generates deduplicated file paths | Returns `{ files: Map<path, content>, entries: Array<metadata> }` |
| `getKnowledgeSectionEntries(sources)` | **Exported** — returns `KnowledgeSectionEntry[]` for sidebar tree | Used by `DatasetExplorer.tsx` to build the `knowledge/sections/` tree |

Section file naming: `sections/{source-slug}-{section-slug}.md`. Duplicate slugs get a numeric suffix (e.g. `-2`).

### SKILL.md Builder Helpers

| Function | Purpose |
|----------|---------|
| `buildPackageTree(slug, groups, hasKnowledge, sectionCount)` | Generates the folder tree diagram for the Package Structure section |
| `buildTopicHierarchyList(nodes)` | Renders the topic hierarchy as a nested markdown list (recursive) |
| `objectiveToCapability(objective, name)` | Strips "Train a {name} that..." prefix -> direct capability description |

### Slugify Helpers

| Function | Example |
|----------|---------|
| `slugifySegment("Sicilian Defense")` | `"sicilian-defense"` |
| `slugifyPath("Chess/Openings/Sicilian Defense")` | `"chess/openings/sicilian-defense"` |
| `slugifySkillName("Build an expert chess tutor")` | `"build-an-expert-chess-tutor"` (max 64 chars) |
| `humanizeName("writing_sql_queries")` | `"Writing SQL Queries"` (preserves acronyms) |
| `humanizePath("writing_sql_queries/using_joins")` | `"Writing SQL Queries / Using Joins"` |

### ZIP Assembly + Download

| Function | Location | Purpose |
|----------|----------|---------|
| `generateSkillPackageHandler(params)` | generate-skill-package.ts | Tool handler: calls `assembleSkillPackageFiles`, creates ZIP via JSZip, stores blob in `packageStore` |
| `downloadSkillPackageHandler(params)` | download-skill-package.ts | Tool handler: retrieves blob from `packageStore`, triggers browser download via `<a>` element |
| `getPackageBlob(workflowId)` | generate-skill-package.ts | Retrieves stored blob (module-level `Map`) |
| `clearPackageBlob(workflowId)` | generate-skill-package.ts | Frees memory after download |

---

## UI Integration

### Explorer Sidebar (DatasetExplorer.tsx)

The skill file tree appears in the explorer sidebar when a skill package can be assembled. It builds the full tree:

```
skill/                              <- Root section
├── SKILL.md                        <- Opens in SkillFileViewer (markdown mode)
├── resources/                      <- Folder node
│   ├── index.md                    <- Opens in SkillFileViewer (markdown mode)
│   └── {topic-slug}.jsonl          <- Opens in SkillFileViewer (JSONL mode)
└── knowledge/                      <- Folder node (if knowledge exists)
    ├── domain-knowledge.md         <- Opens in SkillFileViewer (markdown mode)
    └── sections/                   <- Folder node (if sections exist)
        └── {source-slug}-{section}.md  <- Opens in SkillFileViewer (markdown mode)
```

The sidebar calls `getKnowledgeSectionEntries(sources)` to get the list of section files for the tree.

The sidebar also has a **download button** (hover action on the SKILL section) that triggers the download flow directly.

### SkillFileViewer.tsx

Renders a single skill file based on extension:

- **`.md` files:** Markdown preview (default) or Monaco editor (edit mode). YAML frontmatter is converted to a fenced code block for display.
- **`.jsonl` files:** Conversation card viewer via `ConversationDataTable` component.

File content is resolved via `resolveFileContent()` which handles these paths:
- `SKILL.md` -> `files.skillMd`
- `resources/index.md` -> `files.resourcesIndex`
- `knowledge/domain-knowledge.md` -> `files.knowledgeDoc`
- `knowledge/sections/{filename}.md` -> `files.sectionFiles.get("sections/{filename}")`
- `resources/{slug}.jsonl` -> `files.topicFiles.get(slug)`

The underlying data comes from `assembleSkillPackageFiles()` — the same function used for ZIP generation. This ensures the preview matches what gets downloaded.

### Tab Routing (TabContentRouter.tsx)

Routes tab IDs like `skill/SKILL.md`, `skill/resources/index.md`, `skill/knowledge/sections/chess-guide-pins.md` to `SkillFileViewer` with the correct `filePath` prop.

---

## Package Store (In-Memory Blob Cache)

Generated ZIP blobs are stored in a module-level `Map<string, Blob>` keyed by workflow ID:

```
generate_skill_package -> stores blob -> packageStore.set(workflowId, blob)
download_skill_package -> retrieves blob -> packageStore.get(workflowId)
                       -> clears after download -> packageStore.delete(workflowId)
```

This avoids regenerating the ZIP between generate and download calls.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Zero LLM calls** | All data already exists in IndexedDB — packaging is pure assembly (~100ms) |
| **No `system` field in JSONL** | Redundant with SKILL.md role context. Repeated 25x per topic. Removing saves ~40% ZIP size |
| **No `base_score` in JSONL** | LLM self-assessed quality was less reliable than grader `eval_scores`. Removed for cleaner format |
| **No `rules/` directory** | Response guidelines are inlined in SKILL.md body. Separate file added a Read call with no benefit |
| **TRIGGER/DO NOT TRIGGER in description** | Official Anthropic pattern (from `claude-api` skill). Helps Claude decide when to activate |
| **Per-topic JSONL files** | Context efficiency — Claude reads only the relevant topic, not all 500+ examples |
| **Hierarchical file paths** | `resources/tactical-patterns/pins.jsonl` matches the topic hierarchy for intuitive navigation |
| **No auto-filtering** | Whatever records exist in IndexedDB go into the package. Scores are informational, not gates |
| **`assembleSkillPackageFiles` is reusable** | Used by both the tool handler (ZIP) and `SkillFileViewer` (preview). Single source of truth |
| **Per-section knowledge files** | Split knowledge into individual files so Claude can load only the relevant section, not entire doc |
| **domain-knowledge.md as reference table** | Provides a directory of available sections without bloating context. Claude reads the table, then loads specific section files |

---

## Debugging Guide

### Common Issues

#### "No data available to generate skill package"

**Symptom:** SkillFileViewer shows empty state.
**Cause:** `assembleSkillPackageFiles()` returned null.
**Debug:**
1. Check `dataset.id` exists in DatasetDetailContext
2. Check records exist: `datasetsDB.getRecordsByDatasetId(datasetId)`
3. Check records have `data.input.messages` with user messages
4. Check `metadata.skillResponse` is populated (needed for `assistant` field)

#### JSONL file shows empty conversation cards

**Symptom:** JSONL opens in viewer but cards are empty.
**Cause:** `assembleJsonlRow()` is returning rows with empty `assistant` field.
**Debug:** Check that `record.metadata.skillResponse` is populated for the records. This field is set during data generation (`generate-initial-data.ts`) and must exist for the assistant response to appear.

#### Knowledge section files missing or empty

**Symptom:** `knowledge/sections/` folder is empty or missing in sidebar/ZIP.
**Cause:** `collectSectionsFromSources()` found no extractable sections.
**Debug:**
1. Check `source.status === 'ready'` and `source.extractedContent` exists
2. For modern path: check `source.extractedContent.metadata.extractionMethod === 'local-semantic'`
3. For modern path: check `metadata.chunks` has entries with `.text` and `.heading` fields
4. For legacy path: check `extractedContent.sections` has entries with `.title` and `.content`
5. If `domain-knowledge.md` reference table is empty: entries need `pageRange` to appear in the table

#### domain-knowledge.md shows empty table

**Symptom:** The reference table in `domain-knowledge.md` has no rows.
**Cause:** `buildKnowledgeDoc()` filters to entries with `pageRange`. Legacy extraction doesn't provide page ranges.
**Debug:** Check `source.extractedContent.metadata.extractionMethod`. Only `'local-semantic'` provides page ranges from chunks. Legacy sections don't have page ranges and won't appear in the reference table.

#### Explorer sidebar doesn't show skill files

**Symptom:** No `skill/` section in DatasetExplorer.
**Cause:** `assembleSkillPackageFiles()` failing or returning null.
**Debug:** Same as "No data available" above. Also check that `DatasetDetailContext` has the correct dataset loaded.

#### Download produces wrong file structure

**Symptom:** ZIP missing `knowledge/sections/` or other expected files.
**Cause:** Stale code or build cache.
**Debug:**
1. Run `npx tsc --noEmit` — should be zero errors
2. Check `generate-skill-package.ts` for the ZIP assembly section (`root.file(...)` calls)
3. Verify `SkillPackageFiles` interface has `sectionFiles` field
4. Check that `buildSectionFiles()` returns non-empty files map

### Key Invariants

- `assembleSkillPackageFiles` is the **single source of truth** for package content (used by both ZIP and preview)
- JSONL rows never include empty optional fields (no `"eval_scores": {}` or `"sources": []`)
- Topic groups are always sorted alphabetically by path
- Knowledge doc is null when no ready knowledge sources exist (folder omitted from ZIP)
- Section files are null/empty when no sections can be extracted
- `domain-knowledge.md` only contains entries with `pageRange` (modern extraction only)
- The `packageStore` map is cleared after download to prevent memory leaks
- Section file slugs are deduplicated with numeric suffixes (`-2`, `-3`) for collisions

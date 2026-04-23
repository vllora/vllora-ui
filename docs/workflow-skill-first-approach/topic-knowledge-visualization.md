# Topic-Knowledge Relationship Visualization

## Problem

The skill pipeline builds explicit relationships between topics and knowledge parts (via `relations.json` and the `POST /topics/relations` API). The UI cannot currently show these relationships. Users cannot answer: "What source material backs this topic?"

This is the last missing link in the traceability chain:

```
Record -> Topic -> [GAP] -> Knowledge Part -> Source Document -> Original PDF
```

## Pre-Requisite: Fix the Data Gap (Phase 0)

### The Disconnect

There are **two independent paths** that store topic-knowledge relationships, and they are not connected:

| Path | Where stored | UI reads it? |
|------|-------------|-------------|
| **Lucy tools** (browser) | `source_chunk_refs` JSON column on `workflow_topics` table | Yes -- adapter parses JSON into `sourceChunkRefs` |
| **Skill** (Codex/Claude Code) | `workflow_topic_sources` bridge table via `POST /topics/relations` | **No** -- adapter never fetches from relations endpoint |

**How the Lucy path works:**
1. Lucy browser tools generate topics with `sourceChunkRefs` directly on the node
2. `flattenHierarchy()` serializes them into the `source_chunk_refs` JSON column (alongside `description`, `promptTemplate`, `normalizedPromptSegment`)
3. `buildHierarchyTree()` parses them back on fetch

**How the Skill path works:**
1. Skill uploads topics via `POST /topics` (no `sourceChunkRefs` in payload)
2. Skill uploads relations via `POST /topics/relations` with `{topic_identifier, part_identifier}` pairs
3. Gateway stores relations in `workflow_topic_sources` bridge table
4. **UI never calls `GET /topics/relations`** -- so skill-uploaded relations are invisible

### The Fix

Modify `fetchTopicHierarchy()` in `api-dataset-adapter.ts` to also fetch relations and merge them:

```typescript
async function fetchTopicHierarchy(workflowId: string): Promise<TopicHierarchyConfig | undefined> {
  try {
    const response = await api.get(`${BASE}/${workflowId}/topics`);
    const data = await handleApiResponse<{ topics: DbTopicResponse[] }>(response);
    if (!data.topics || data.topics.length === 0) return undefined;

    const hierarchy = buildHierarchyTree(data.topics);

    // NEW: Fetch relations from bridge table and merge into hierarchy nodes
    const relResponse = await api.get(`${BASE}/${workflowId}/topics/relations`);
    if (relResponse.ok) {
      const relData = await handleApiResponse<{ relations: DbTopicRelation[] }>(relResponse);
      mergeRelationsIntoHierarchy(hierarchy, relData.relations);
    }

    return {
      hierarchy,
      maxDepth: calcMaxDepth(hierarchy),
    };
  } catch { return undefined; }
}
```

**Merge logic:**

```typescript
interface DbTopicRelation {
  readonly id: string;
  readonly topic_id: string;       // UUID of the topic in workflow_topics
  readonly source_part_id: string;  // UUID of the part in knowledge_source_parts
  readonly reference_id: string | null;
}

function mergeRelationsIntoHierarchy(
  nodes: TopicHierarchyNode[],
  relations: readonly DbTopicRelation[],
): void {
  // Build topic_id -> source_part_ids map
  const relMap = new Map<string, string[]>();
  for (const rel of relations) {
    const existing = relMap.get(rel.topic_id) ?? [];
    existing.push(rel.source_part_id);
    relMap.set(rel.topic_id, existing);
  }

  // Walk hierarchy and merge (relations use "sourceId:partId" format for sourceChunkRefs)
  const walk = (nodes: TopicHierarchyNode[]) => {
    for (const node of nodes) {
      const partIds = relMap.get(node.id);
      if (partIds?.length) {
        // Merge with any existing refs from the JSON column (Lucy path)
        const existing = new Set(node.sourceChunkRefs ?? []);
        for (const partId of partIds) {
          // Relations store part UUID; need to find the source_id to build "sourceId:partId" ref
          // OR: store just the partId and resolve source at render time
          existing.add(partId);
        }
        node.sourceChunkRefs = [...existing];
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
}
```

**Important detail on ref format:**
- Lucy path stores refs as `"sourceId:chunkId"` (composite string)
- Relations bridge table stores `topic_id` and `source_part_id` separately (both are gateway UUIDs; skill files use slugs that are mapped to UUIDs at the upload boundary)
- The merge function needs to handle both formats, or we standardize on one
- Simplest: store just `partId` from relations, and resolve the `sourceId` at render time by scanning `KnowledgeSourcesContext.sources` (each source has `.parts[]` with `.id`)

**Files to modify:**
- `src/services/adapters/api-dataset-adapter.ts` -- add relations fetch + merge in `fetchTopicHierarchy()`

**Verification:**
1. Upload topics + relations via skill API (curl or test agent)
2. Open dataset in UI -> verify `sourceChunkRefs` is populated on topic nodes
3. Confirm existing Lucy-generated topics still work (backward compatible)

---

## Current UI: How Topic Records Are Shown

When clicking a topic node on the canvas, a **slide-in `RecordsPanel`** appears on the right side of the canvas (not a dialog/modal). It shows:

- Breadcrumb path for nested topics
- Topic name + record count badge
- Search within records
- `CompactRecordList` showing records for that topic (or subtree for parent topics)
- Sibling navigation (Prev/Next) in footer

The panel is defined in `src/components/datasets/dataset-canvas/RecordsPanel.tsx` and renders as an absolute-positioned overlay on the right side of the canvas. There is also a full `TopicRecordsDialog` (modal) accessible via an expand button, but the primary interaction is the slide-in panel.

---

## Phase 1: Source References Section in RecordsPanel

Add a "Source References" collapsible section to the existing slide-in `RecordsPanel`, above the records list. When a topic has linked knowledge parts, show them grouped by source document.

**Mockup (inside the slide-in panel):**

```
+-- RecordsPanel (slide-in) -------------------------+
|  Openings / Pawn Structures                        |
|  Pawn Structures                    [12 records] X |
|  [Search within records...]                        |
|                                                    |
|  v Source References (3) -----------------------   |
|                                                    |
|  Middlegame Strategy Guide.pdf                     |
|    T  Pawn Structures         text   p.1-2    ->   |
|    #  Pawn Structure Comp...  table          ->    |
|  Endgame Tactics Manual.pdf                        |
|    T  King and Pawn Endings   text   p.1     ->    |
|                                                    |
|  -- Records (12) ------------------------------    |
|                                                    |
|  [compact record list...]                          |
|                                                    |
|              < Prev    Next >                      |
+----------------------------------------------------+
```

**Behavior:**
- Collapsible section header "Source References (N)" above the records list
- Parts grouped by parent source document name
- Each part row shows: type icon (T/table/image), title, type badge, page range
- Click arrow on a part navigates to `KnowledgePartViewer` via `knowledge/{sourceId}/{partId}` path
- Uses `emitter.emit("vllora_switch_tab", ...)` to navigate (same pattern as record source badges)
- Empty state: section hidden when no `sourceChunkRefs` exist
- Collapsed by default to keep records prominent; expands on click

**Data source:**
- `TopicHierarchyNode.sourceChunkRefs` -- populated by Phase 0 merge
- Resolve refs against `KnowledgeSourcesContext` to get source names, part titles, types

**Files to modify:**
- `src/components/datasets/dataset-canvas/RecordsPanel.tsx` -- add source refs section, consume `KnowledgeSourcesConsumer`
- New: `src/components/datasets/dataset-canvas/TopicSourceReferences.tsx` -- extracted component for the source refs list

---

## Phase 2: Knowledge Badge on Canvas Topic Nodes

Add a small indicator to each topic node on the canvas showing how many source parts are linked.

**Mockup (within existing `CollapsedTopicNode`):**

```
+----------------------------+
|  Pawn Structures      12   |  <- record count (existing)
|  * 0.82 avg  (10 eval)    |  <- quality score (existing)
|  # 3 sources              |  <- NEW: linked knowledge parts count
|  Part of Strategy...      |  <- description (existing)
+----------------------------+
```

**Behavior:**
- New row below quality score showing linked source parts count
- Icon: small document/link icon + count
- Color coding: green (3+ parts), amber (1-2 parts), hidden (0 parts)
- Tooltip on hover: lists source document names
- Clicking the badge opens the RecordsPanel scrolled to the Source References section

**Files to modify:**
- `src/components/datasets/dataset-canvas/topic-node/TopicNodeComponent.tsx` -- add `sourceRefCount` to `TopicNodeData`
- `src/components/datasets/dataset-canvas/topic-node/CollapsedTopicNode.tsx` -- render badge row
- `src/components/datasets/dataset-canvas/TopicHierarchyCanvas.tsx` -- pass `sourceChunkRefs.length` when building node data

---

## Phase 3: Bidirectional Links + Coverage Insights

Two additions for full traceability in both directions:

**A) "Referenced by" on Knowledge Part Viewer**

When viewing a knowledge part, show which topics reference it (backlinks).

```
+-- Pawn Structures -- TEXT -- 1 of 6 -------------------+
|  Middlegame Strategy Guide.pdf  page:1-2               |
|                                                        |
|  Referenced by:                                        |
|    [Pawn Structures]  [Endgame Theory]                 |
|                                                        |
|  Pawn structure is the skeleton of a chess...          |
+--------------------------------------------------------+
```

- Topic names as clickable badges (green themed)
- Click navigates to that topic on the canvas
- Requires building a reverse index: partId -> topicNames[]
- Built from the topic hierarchy already in `DatasetDetailContext`

**B) Coverage Matrix in Insights**

A heatmap under the `insights/` explorer node showing topic-source coverage:

```
                        Source 1    Source 2    Source 3
  Pawn Structures         ##          ..          ##
  Piece Activity          ..          ##          ..
  Attacking (gap!)        ..          ..          ..
```

- Rows = leaf topics, columns = knowledge sources
- Cell color = number of linked parts from that source (dark = many, empty = none)
- Red/empty row = topic with no source material (coverage gap to address)
- Clickable cells navigate to the specific source-topic intersection

**Files to modify/create:**
- `src/components/datasets/KnowledgePartViewer.tsx` -- add "Referenced by" section
- New: `src/components/datasets/insights/TopicCoverageMatrix.tsx` -- heatmap component

---

## Data Architecture

### BE schema (gateway SQLite)

```
workflow_topics
  id              TEXT PK
  workflow_id     TEXT FK
  name            TEXT
  parent_id       TEXT (self-ref, nullable)
  selected        INTEGER
  source_chunk_refs TEXT  -- JSON blob (Lucy path: {sourceChunkRefs, description, ...})
  created_at      TEXT

workflow_topic_sources  (bridge table -- Skill path)
  id              TEXT PK
  reference_id    TEXT (nullable)
  workflow_id     TEXT FK
  topic_id        TEXT FK -> workflow_topics.id
  source_part_id  TEXT FK -> knowledge_source_parts.id
  created_at      TEXT
```

### API endpoints

```
GET  /finetune/workflows/{id}/topics            -> { topics: DbTopicResponse[] }
GET  /finetune/workflows/{id}/topics/relations   -> { relations: DbTopicRelation[] }
POST /finetune/workflows/{id}/topics/relations   -> create relations
```

### Resolution logic (shared utility)

```typescript
// Resolve a partId (or "sourceId:chunkId" composite) into source + part objects
function resolvePartRef(
  ref: string,
  sources: KnowledgeSource[]
): { source: KnowledgeSource; part: KnowledgeSourcePart } | null {
  // Handle composite "sourceId:chunkId" format (Lucy path)
  if (ref.includes(":")) {
    const [sourceId, chunkId] = ref.split(":");
    const source = sources.find(s => s.id === sourceId || s.referenceId === sourceId);
    if (!source) return null;
    const part = source.parts.find(p => p.id === chunkId || p.referenceId === chunkId);
    return part ? { source, part } : null;
  }

  // Handle plain partId (Skill/relations path) -- scan all sources
  for (const source of sources) {
    const part = source.parts.find(p => p.id === ref || p.referenceId === ref);
    if (part) return { source, part };
  }
  return null;
}
```

This utility already exists partially in `src/lib/distri-finetune-tools/steps/shared/source-attribution.ts`.

### Reverse index (for Phase 3A)

```typescript
function buildPartTopicIndex(
  topics: TopicHierarchyNode[]
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const walk = (nodes: TopicHierarchyNode[]) => {
    for (const node of nodes) {
      for (const ref of node.sourceChunkRefs ?? []) {
        const partId = ref.includes(":") ? ref.split(":")[1] : ref;
        const existing = index.get(partId) ?? [];
        existing.push(node.name);
        index.set(partId, existing);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(topics);
  return index;
}
```

---

## Execution Order

```
Phase 0 (fix adapter: fetch + merge relations)   <- PREREQUISITE
  -> Phase 1 (source refs section in RecordsPanel)
  -> Phase 2 (canvas node badge)
  -> Phase 3A (backlinks on part viewer)
  -> Phase 3B (coverage matrix in insights)
```

Each phase after 0 is independently shippable. Phase 0 + Phase 1 together close the primary traceability gap.

## Verification

**Phase 0:**
1. Upload topics + relations via skill API (curl commands to gateway)
2. Open dataset in UI, inspect topic nodes -> verify `sourceChunkRefs` is populated
3. Confirm Lucy-generated topics still work (backward compatible with JSON column)

**Phase 1:**
1. Click a topic on the canvas -> verify RecordsPanel shows "Source References" section
2. Click a part link -> verify it navigates to `KnowledgePartViewer`
3. Check a topic with no relations -> verify section is hidden

**Phase 2:**
4. Verify canvas nodes show source count badges with correct color coding

**Phase 3:**
5. Open a knowledge part -> verify "Referenced by" shows correct topic badges
6. Open insights -> verify coverage matrix highlights unsourced topics

# How Topic Generation Works — Deep Dive

The topic step (Step 3) structures the training data into a hierarchy, then links topics to source document parts. This document explains what happens, how the relation-builder subagent works, and what data flows into the next steps.

## Why Topics Exist

Without topics, training data is a flat list of prompts with no structure. Topics solve three problems:

1. **Balanced coverage** — ensure every area of the domain gets enough training examples, not just the easy/obvious ones
2. **Grounded generation** — link each topic to specific document parts so training prompts are derived from real source material
3. **Quality analysis** — after evaluation, see which topics score well vs. poorly and target improvements

## The Topic Flow

```
                    ┌─────────────────────┐
  all-parts-        │  Agent designs       │
  index.json  ────► │  topic hierarchy     │ ────► topics.json
  (from Step 2)     │  (3-7 roots, 2-3    │
                    │   levels deep)       │
  objective   ────► │                      │
  (from Step 1)     └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
  all-parts-        │  relation-builder    │
  index.json  ────► │  subagent            │ ────► relations.json
                    │  (matches parts to   │
  topics.json ────► │   leaf topics)       │
                    └─────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    ▼                   ▼
              Step 4:             Upload
              Data Generation     (incremental,
              (grounded in         after Step 3)
               linked parts)
```

## Step 3a: Design the Hierarchy

### What the Agent Does

1. **Reads the objective** — understands what behaviors the model should learn
2. **Reads `all-parts-index.json`** — scans the merged part index to see what source material is available (titles, extraction paths, content previews)
3. **Designs topics** — creates a tree structure where:
   - Root topics = broad domain areas (3-7 roots)
   - Child topics = specific scenario clusters
   - Leaf topics = concrete training example types (each should support 10-30 records)
4. **Writes `topics.json`** — a flat array with `parent_id` references for hierarchy

### Topic Structure

```json
[
  {
    "id": "tactics",
    "name": "Tactical Patterns",
    "parent_id": null,
    "system_prompt": "Focus on tactical chess patterns and combinations"
  },
  {
    "id": "forks",
    "name": "Forks",
    "parent_id": "tactics",
    "system_prompt": "Focus on fork tactics — knight forks, pawn forks, queen forks"
  },
  {
    "id": "pins",
    "name": "Pins & Skewers",
    "parent_id": "tactics",
    "system_prompt": "Focus on pin and skewer tactics, absolute vs relative pins"
  }
]
```

Key fields:
- **`id`** — unique identifier, used in records (`"topic": "forks"`) and relations
- **`parent_id`** — links to parent topic (null for roots), creates the tree
- **`system_prompt`** — a segment in the hierarchical prompt composition chain. During record generation, this field is composed with ancestor system_prompts to form the full system message (see [System Prompt Composition](#system-prompt-composition) below)

### How Topics Map to Documents

The agent doesn't copy the document structure 1:1 into topics. Instead:

| Document structure | Topic hierarchy |
|-------------------|-----------------|
| Chapter headings | Inspiration for root topics |
| Sections within chapters | Potential child/leaf topics |
| Content coverage gaps | Topics that need non-document-based prompts |
| Cross-cutting themes | Separate root topics spanning multiple chapters |

Example: A chess book with "Chapter 3: Tactical Motifs" containing sections on forks, pins, and discovered attacks becomes:

```
Tactical Patterns (root)          ← from Chapter 3 heading
├── Forks (leaf)                  ← from section 3.1
├── Pins & Skewers (leaf)         ← from sections 3.2 + 3.3
└── Discovered Attacks (leaf)     ← from section 3.4
```

### Design Guidelines

| Rule | Why |
|------|-----|
| 3-7 root topics | Too few = topics too broad; too many = fragmented |
| 2-3 levels deep | Deeper is more specific but harder to balance |
| 10-30 records per leaf | Fewer = undertrained; more may overfit |
| Descriptive system_prompt | Each topic's segment composes into the final training prompt |
| Root: "Specialize in: ..." | Root topics set the broad domain focus |
| Leaf: "Focus on: ..." | Leaf topics narrow to specific scenarios |
| No overlapping topics | A record should clearly belong to one leaf topic |

### System Prompt Composition

The `system_prompt` field on each topic is not used in isolation. During record generation (Step 4), `generate_records.py` walks up the topic hierarchy and **composes** a single system prompt from all levels:

```
[Root persona from --system-prompt]    "You are an expert chess tutor..."

[Root topic system_prompt]             "Specialize in: tactical chess patterns and combinations."

[Parent topic system_prompt]           "Specialize in: short-range tactical motifs."

[Leaf topic system_prompt]             "Focus on: fork tactics — knight forks, pawn forks, queen forks."
```

Segments are joined with `\n\n`. For a 3-level hierarchy this produces 4 segments (root persona + 3 topic levels). Target: **50-150 words total**.

**Writing guidelines for system_prompt fields:**

| Level | Convention | Example |
|-------|-----------|---------|
| Root topic | `"Specialize in: ..."` | `"Specialize in: payment and subscription questions."` |
| Mid-level | `"Specialize in: ..."` | `"Specialize in: refund workflows and policies."` |
| Leaf topic | `"Focus on: ..."` | `"Focus on: partial refund edge cases and pro-rated calculations."` |

Each level adds specificity without contradicting its parent. If a topic has no `system_prompt`, the script falls back to its `name` field (e.g., `"Specialize in: Billing"`).

For research and design guidelines, see [prompt-composition-research.md](prompt-composition-research.md).

---

## Step 3b: Build Relations (Subagent)

### Why a Subagent?

Matching parts to topics requires scanning `all-parts-index.json` (potentially 30-100+ parts) against each leaf topic. This is a context-heavy operation. The **relation-builder subagent** handles it in an isolated context to keep the main agent's context window clean.

### What the Subagent Does

1. **Reads `all-parts-index.json`** — the lightweight part index with titles, extraction paths, content previews, and source document names
2. **Reads `topics.json`** — the topic hierarchy designed by the main agent
3. **For each leaf topic**, runs a retrieve-and-verify loop:
   - **Search**: Find parts whose title, extraction_path, or content_preview match the topic's subject
   - **Verify**: Confirm each candidate is actually relevant (not just a keyword match)
   - **Broaden**: If fewer than 3 relations found, try synonyms, parent topic context, or related concepts
4. **Writes `relations.json`** — flat array of topic-to-part mappings

### Relations Structure

```json
[
  {"topic_identifier": "forks", "part_identifier": "chess-tactics-chapter-3-forks"},
  {"topic_identifier": "forks", "part_identifier": "workbook-section-tactical-combinations"},
  {"topic_identifier": "pins", "part_identifier": "chess-tactics-chapter-3-pins"},
  {"topic_identifier": "pins", "part_identifier": "game-collection-exercise-pins"}
]
```

- **`topic_identifier`** — matches a topic's `id` or `reference_id`
- **`part_identifier`** — matches a knowledge part's `id` or `reference_id`

### Multi-Document Relations

Relations can link a topic to parts from **different documents**. For example, a "forks" topic might link to:
- `chess-tactics-chapter-3-forks` (from the tactics textbook)
- `workbook-section-5-knight-forks` (from the workbook)
- `game-collection-game-analysis-fork-examples` (from the game collection)

This is why part IDs are prefixed with the document identifier — it keeps them unique when merged.

---

## How to Verify Progress

### Check topics exist

```bash
# Count and structure
python3 -c "
import json
t = json.load(open('finetune-project/topics.json'))
roots = [x for x in t if x['parent_id'] is None]
leaves = [x for x in t if x['id'] not in {y['parent_id'] for y in t if y['parent_id']}]
print(f'{len(t)} topics total, {len(roots)} roots, {len(leaves)} leaves')
for r in roots:
    children = [x for x in t if x['parent_id'] == r['id']]
    print(f'  {r[\"name\"]}: {len(children)} children')
"
```

### Check relations exist

```bash
python3 -c "
import json
r = json.load(open('finetune-project/relations.json'))
from collections import Counter
by_topic = Counter(x['topic_identifier'] for x in r)
print(f'{len(r)} relations across {len(by_topic)} topics')
for topic, count in by_topic.most_common():
    print(f'  {topic}: {count} parts')
" 2>/dev/null || echo "relations.json not created yet"
```

### Upload topics and relations (immediately after creation)

```bash
uv run scripts/finetune.py upload-topics --workflow-id $WORKFLOW_ID --file topics.json
uv run scripts/finetune.py upload-relations --workflow-id $WORKFLOW_ID --file relations.json
```

### Check in gateway DB (after upload)

```bash
DB=~/.vllora/vllora.db
WF_ID=$(sqlite3 $DB "SELECT id FROM workflows ORDER BY created_at DESC LIMIT 1;")
echo "Topics: $(sqlite3 $DB "SELECT COUNT(*) FROM workflow_topics WHERE workflow_id='$WF_ID';")"
echo "Relations: $(sqlite3 $DB "SELECT COUNT(*) FROM workflow_topic_sources WHERE workflow_id='$WF_ID';")"

# Topic tree
sqlite3 $DB "SELECT t.name, t.parent_id, COUNT(r.id) as record_count
FROM workflow_topics t
LEFT JOIN workflow_records r ON r.topic = t.id AND r.workflow_id = t.workflow_id
WHERE t.workflow_id='$WF_ID'
GROUP BY t.id;"
```

---

## Common Issues

### No `relations.json` produced

- **Cause**: The relation-builder subagent wasn't delegated, or it failed
- **Check**: Look for "relation-builder" in `execution-log.md`
- **Fix**: The main agent must explicitly delegate: "Delegate to the relation-builder subagent to match parts to topics"

### Topics too broad or too narrow

- **Symptom (broad)**: Topics like "General Chess" — will generate unfocused training data
- **Symptom (narrow)**: Topics like "Knight fork on e5 in Sicilian Defense" — only 1-2 possible records
- **Fix**: Leaf topics should support 10-30 unique training examples

### Relations link to wrong parts

- **Symptom**: A "forks" topic links to an "endgame" part
- **Cause**: The subagent matched on a keyword that appears in both contexts
- **Check**: `python3 -c "import json; [print(x) for x in json.load(open('relations.json')) if x['topic_identifier']=='forks']"`

### Topics don't cover all source material

- **Check**: Compare parts in `all-parts-index.json` against parts in `relations.json`:
```bash
python3 -c "
import json
all_parts = {p['id'] for p in json.load(open('finetune-project/knowledge/all-parts-index.json'))['parts']}
linked = {r['part_identifier'] for r in json.load(open('finetune-project/relations.json'))}
unlinked = all_parts - linked
if unlinked:
    print(f'{len(unlinked)} parts not linked to any topic:')
    for p in sorted(unlinked): print(f'  {p}')
else:
    print('All parts are linked to topics')
"
```

## Reference

For detailed topic design guidelines (hierarchy depth, leaf count targets, balance scoring), see `finetune-skill/reference/topic-hierarchy.md`.

# Skill Package — Data Flow

## End-to-End Flow

This document traces how data flows from IndexedDB through skill package assembly.

---

## Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  IndexedDB                                                    │
│                                                               │
│  datasetsDB.getDatasetById(datasetId)                         │
│  ├── dataset.datasetObjective     → SKILL.md Role & Objective │
│  ├── dataset.topicHierarchy       → SKILL.md Expertise Areas  │
│  └── dataset.name                 → Skill name fallback       │
│                                                               │
│  datasetsDB.getRecordsByDatasetId(datasetId)                  │
│  └── records[]                    → JSONL files (grouped by   │
│      ├── .topic                      topic)                   │
│      ├── .data.input.messages[]                               │
│      │   └── [role=user].content  → JSONL `user` field        │
│      ├── .metadata.skillResponse  → JSONL `assistant` field   │
│      ├── .metadata.sourceChunkRefs → JSONL `sources` field    │
│      ├── .metadata.diversityScore → index.md Diversity column │
│      └── .evaluations[jobId].score → JSONL `eval_scores` field│
│                                                               │
│  knowledgeDB.getKnowledgeSourcesByDataset(datasetId)          │
│  └── sources[]                    → knowledge/domain-knowledge│
│      ├── .extractedContent.metadata.extractionMethod          │
│      ├── .extractedContent.metadata.chunks[]  (modern path)   │
│      │   ├── .heading             → ### section heading       │
│      │   ├── .sentences[]         → section body text         │
│      │   ├── .pageStart/.pageEnd  → page range annotation     │
│      │   └── .summary             → (not currently used)      │
│      └── .extractedContent.sections[]         (legacy path)   │
│          ├── .title               → ### section heading       │
│          └── .content             → truncated section text    │
│                                                               │
│  getProposedPlan(datasetId)                                   │
│  └── plan.grader_config.criteria  → SKILL.md Response         │
│                                      Guidelines               │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│  assembleSkillPackageFiles()     (~100ms, zero LLM calls)     │
│                                                               │
│  Step 1: groupByTopic(records, hierarchy)                     │
│  ├── Group records by record.topic                            │
│  ├── Resolve full path via hierarchy leaf lookup               │
│  ├── Build SkillJsonlRow[] per group                          │
│  │   └── assembleJsonlRow(record) for each record             │
│  │       ├── user ← messages.find(role=user).content          │
│  │       ├── assistant ← metadata.skillResponse               │
│  │       ├── eval_scores ← evaluations → {jobId: score}      │
│  │       └── sources ← metadata.sourceChunkRefs               │
│  └── Sort groups alphabetically by topic path                  │
│                                                               │
│  Step 2: buildResourcesIndex(topicGroups, totalRows)          │
│  └── Markdown table: Topic | File | Examples | Diversity      │
│                                                               │
│  Step 3: buildKnowledgeDoc(knowledgeSources)                  │
│  ├── if extractionMethod === 'local-semantic':                 │
│  │   └── buildKnowledgeFromChunks(name, chunks, pages)        │
│  │       └── Full sentences from metadata.chunks[].sentences   │
│  └── else (legacy):                                           │
│      └── buildKnowledgeFromSections(name, sections, summary)  │
│          └── Truncated content from extractedContent.sections  │
│                                                               │
│  Step 4: buildSkillMarkdown(params)                           │
│  ├── YAML: name, description (TRIGGER/DO NOT TRIGGER)         │
│  ├── Role & Objective from dataset.datasetObjective           │
│  ├── Expertise Areas from topicHierarchy                      │
│  ├── Package Structure (dynamic tree)                         │
│  ├── Response Guidelines from grader criteria                  │
│  ├── Using Resources (JSONL format table)                     │
│  └── Domain Knowledge (Read instruction, if sources exist)    │
│                                                               │
│  Step 5: buildTopicJsonl(rows) for each topic group           │
│  └── JSON.stringify per row, join with \n                     │
│      Only includes non-empty optional fields                  │
│                                                               │
│  Returns: SkillPackageFiles                                   │
│  ├── skillMd: string                                          │
│  ├── resourcesIndex: string                                   │
│  ├── topicFiles: Map<slug, jsonl>                             │
│  └── knowledgeDoc: string | null                              │
└───────────────────────────────┬──────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│  Tool: generate_skill_   │    │  UI: SkillFileViewer     │
│  package                 │    │                          │
│                          │    │  Same assembleSkill-     │
│  JSZip assembly:         │    │  PackageFiles() call     │
│  root.file('SKILL.md')   │    │                          │
│  root.file('resources/   │    │  Resolves file path →    │
│    index.md')            │    │  renders content:        │
│  root.file('resources/   │    │  - .md → markdown view   │
│    {slug}.jsonl')        │    │  - .jsonl → conversation │
│  root.file('knowledge/   │    │    card viewer           │
│    domain-knowledge.md') │    │                          │
│                          │    │  Supports edit mode for  │
│  Stores blob in          │    │  markdown files          │
│  packageStore            │    │                          │
│        │                 │    └──────────────────────────┘
│        ▼                 │
│  Tool: download_skill_   │
│  package                 │
│                          │
│  Retrieves blob →        │
│  browser download via    │
│  <a> element →           │
│  clears blob from store  │
└──────────────────────────┘
```

---

## Per-Record Data Map

Shows every field consumed by skill packaging:

```
DatasetRecord
├── data.input.messages[]
│   └── [role=user].content        → JSONL `user` field
│       (system message is IGNORED — SKILL.md provides role context)
├── metadata
│   ├── skillResponse              → JSONL `assistant` field (THE primary value)
│   ├── sourceChunkRefs            → JSONL `sources` field
│   ├── diversityScore             → resources/index.md Diversity column
│   ├── topic_path                 → (not used directly — record.topic is used instead)
│   ├── baseScore                  → NOT included in JSONL (removed — less reliable than eval)
│   ├── isDuplicate                → NOT used by packaging (UI visibility only)
│   ├── duplicateClusterId         → NOT used by packaging (UI visibility only)
│   └── duplicateClusterTheme      → NOT used by packaging (UI visibility only)
├── topic                          → Grouping key for per-topic JSONL files
└── evaluations
    └── [jobId].score              → JSONL `eval_scores` map
```

### Fields NOT in JSONL (and why)

| Field | Why Excluded |
|-------|-------------|
| `system` (from messages) | Redundant with SKILL.md. Was identical across all examples in a topic (25x repetition). Removing saves ~40% file size. |
| `base_score` (from metadata.baseScore) | LLM self-assessed quality during generation. Less reliable than external grader scores. Removed for cleaner format. |
| `topic` | Redundant with filename — each JSONL file IS a topic. |
| `isDuplicate`, `duplicateCluster*` | UI visibility flags only. User decides whether to remove duplicates before packaging. |

---

## Score Flow

Only one score type exists in JSONL output:

```
eval_scores (record.evaluations[jobId].score)

  Set by:    External grader model during dry_run (evaluation) step
  When:      After evaluation job completes (optional step)
  Per-job:   Each evaluation job has its own score per record.
             Multiple jobs = multiple scores (different graders, models).
             Keyed by evaluation job ID.
  In JSONL:  { "eval_scores": { "job-abc": 0.93, "job-def": 0.81 } }
  If none:   Field omitted entirely (not empty {})
  Usage:     SKILL.md tells agent to "prefer higher-rated examples"
```

**Why `base_score` was removed from JSONL:** The LLM self-assessed score (set during generation) was less informative than external grader scores. Including both created confusion about which to trust. `eval_scores` from actual graders are more reliable.

**Why no auto-filtering by score:** Whatever records exist in IndexedDB go into the package. The user has full control — they see scores in the UI and can tell Lucy to remove records. Automatic filtering is dangerous (broken grader → empty package) and premature.

---

## Knowledge Doc Extraction Paths

### Modern: Local-Semantic (recommended)

```
KnowledgeSource
  └── extractedContent.metadata
      ├── extractionMethod: "local-semantic"
      ├── totalPages: 120
      └── chunks: [
            {
              id: "chunk-3",
              heading: "3.2 Pins",
              summary: "Pins are tactical motifs where...",
              sentences: ["A pin is a tactic...", "The pinned piece...", ...],
              pageStart: 16,
              pageEnd: 21
            },
            ...
          ]

  → buildKnowledgeFromChunks():
    ### 3.2 Pins
    *pp.16–21*
    A pin is a tactic... The pinned piece... [full sentences joined]
```

**Quality:** 8/10 — full sentences, meaningful headings, page ranges.
**Limit:** Max 30 sentences per chunk (`MAX_SENTENCES_PER_CHUNK`).

### Legacy: LLM Extraction (fallback)

```
KnowledgeSource
  └── extractedContent
      ├── sections: [
      │     { title: "Pins", content: "A pin is a t..." },  ← often truncated
      │     ...
      │   ]
      └── metadata
          ├── extractionMethod: undefined (or not "local-semantic")
          └── document_summary: "This document covers..."

  → buildKnowledgeFromSections():
    ### Pins
    A pin is a t...  ← truncated at 800 chars
```

**Quality:** 2/10 — fragmented text, truncated content, broken formatting.
**Limit:** Max 20 sections, 800 chars per section.

---

## What Each Consumer Gets

### Skill Package (this feature)

```
{skill-slug}/
├── SKILL.md (~80 lines)
│   YAML: name + TRIGGER/DO NOT TRIGGER description
│   Body: role, expertise, guidelines, resource instructions
│
├── resources/index.md
│   Topic map: Topic | File | Examples | Diversity
│
├── resources/{category}/{topic}.jsonl
│   {"user": "...", "assistant": "...", "eval_scores": {...}, "sources": [...]}
│   No system field. No base_score. Only non-empty optional fields.
│
└── knowledge/domain-knowledge.md (optional)
    Full sentences from semantic chunks (modern) or truncated sections (legacy)
```

### Fine-Tuning Upload (separate consumer — NOT part of skill packaging)

```jsonl
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."}],"id":"rec-abc"}
```

No assistant response. No metadata. No scores. Just the prompt — training generates its own responses.

### Evaluation / Dry Run (separate consumer)

Uploads the dataset file to the evaluation API. Backend generates responses with a rollout model, scores them with the configured grader. Scores flow back to `record.evaluations[jobId].score`.

---

## Key Principle

**What you see is what you get.** Whatever records exist in IndexedDB go into the skill package. No automatic filtering by scores, diversity flags, or evaluation results. The user has full control through the UI.

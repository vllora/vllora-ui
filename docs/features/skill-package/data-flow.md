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
│  ├── dataset.datasetObjective     -> SKILL.md Role & Objective│
│  ├── dataset.topicHierarchy       -> SKILL.md Expertise Areas │
│  └── dataset.name                 -> Skill name fallback      │
│                                                               │
│  datasetsDB.getRecordsByDatasetId(datasetId)                  │
│  └── records[]                    -> JSONL files (grouped by  │
│      ├── .topic                      topic)                   │
│      ├── .data.input.messages[]                               │
│      │   └── [role=user].content  -> JSONL `user` field       │
│      ├── .metadata.skillResponse  -> JSONL `assistant` field  │
│      ├── .metadata.sourceChunkRefs -> JSONL `sources` field   │
│      ├── .metadata.diversityScore -> index.md Diversity column│
│      └── .evaluations[jobId].score -> JSONL `eval_scores`     │
│                                                               │
│  knowledgeDB.getKnowledgeSourcesByDataset(datasetId)          │
│  └── sources[]                    -> knowledge/ directory     │
│      ├── .extractedContent.metadata.extractionMethod          │
│      ├── .extractedContent.metadata.chunks[]  (modern path)   │
│      │   ├── .heading             -> section file heading     │
│      │   ├── .text                -> section file body        │
│      │   ├── .summary            -> section file summary line │
│      │   ├── .pageStart/.pageEnd  -> page range annotation    │
│      │   └── .id                  -> (not used in output)     │
│      └── .extractedContent.sections[]         (legacy path)   │
│          ├── .title               -> section file heading     │
│          └── .content             -> section file body        │
│                                                               │
│  getProposedPlan(datasetId)                                   │
│  └── plan.grader_config.criteria  -> SKILL.md Response        │
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
│  │       ├── user <- messages.find(role=user).content         │
│  │       ├── assistant <- metadata.skillResponse              │
│  │       ├── eval_scores <- evaluations -> {jobId: score}     │
│  │       └── sources <- metadata.sourceChunkRefs              │
│  └── Sort groups alphabetically by topic path                  │
│                                                               │
│  Step 2: buildResourcesIndex(topicGroups, totalRows)          │
│  └── Markdown table: Topic | File | Examples | Diversity      │
│                                                               │
│  Step 3: buildSectionFiles(knowledgeSources)                  │
│  ├── collectSectionsFromSources(sources)                      │
│  │   ├── if extractionMethod === 'local-semantic':            │
│  │   │   └── Extract from metadata.chunks[].text/.heading     │
│  │   │       + .summary, .pageStart/.pageEnd                  │
│  │   └── else (legacy):                                       │
│  │       └── Extract from extractedContent.sections[]         │
│  │           .title/.content                                  │
│  ├── Deduplicate slug paths (add -2, -3 suffix)               │
│  └── Returns { files: Map<path,content>, entries: metadata[] }│
│                                                               │
│  Step 4: buildKnowledgeDoc(knowledgeSources, sectionEntries)  │
│  └── Reference TABLE: Section | File | Source | Pages         │
│      (only entries with pageRange appear in table)            │
│                                                               │
│  Step 5: buildSkillMarkdown(params)                           │
│  ├── YAML: name, description (TRIGGER/DO NOT TRIGGER)         │
│  ├── Role & Objective from dataset.datasetObjective           │
│  ├── Expertise Areas from topicHierarchy                      │
│  ├── Package Structure (dynamic tree)                         │
│  ├── Response Guidelines from grader criteria                  │
│  ├── Using Resources (JSONL format table)                     │
│  └── Domain Knowledge (Read instructions, if sources exist)   │
│                                                               │
│  Step 6: buildTopicJsonl(rows) for each topic group           │
│  └── JSON.stringify per row, join with \n                     │
│      Only includes non-empty optional fields                  │
│                                                               │
│  Returns: SkillPackageFiles                                   │
│  ├── skillMd: string                                          │
│  ├── resourcesIndex: string                                   │
│  ├── topicFiles: Map<slug, jsonl>                             │
│  ├── knowledgeDoc: string | null                              │
│  └── sectionFiles: Map<path, markdown>                        │
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
│  root.file('resources/   │    │  Resolves file path ->   │
│    index.md')            │    │  renders content:        │
│  root.file('resources/   │    │  - .md -> markdown view  │
│    {slug}.jsonl')        │    │  - .jsonl -> conversation │
│  root.file('knowledge/   │    │    card viewer           │
│    domain-knowledge.md') │    │                          │
│  root.file('knowledge/   │    │  Also resolves:          │
│    sections/*.md')       │    │  knowledge/sections/*.md │
│                          │    │  via sectionFiles map    │
│  Stores blob in          │    │                          │
│  packageStore            │    │  Supports edit mode for  │
│        │                 │    │  markdown files          │
│        ▼                 │    └──────────────────────────┘
│  Tool: download_skill_   │
│  package                 │
│                          │
│  Retrieves blob ->       │
│  browser download via    │
│  <a> element ->          │
│  clears blob from store  │
└──────────────────────────┘
```

---

## Per-Record Data Map

Shows every field consumed by skill packaging:

```
DatasetRecord
├── data.input.messages[]
│   └── [role=user].content        -> JSONL `user` field
│       (system message is IGNORED — SKILL.md provides role context)
├── metadata
│   ├── skillResponse              -> JSONL `assistant` field (THE primary value)
│   ├── sourceChunkRefs            -> JSONL `sources` field
│   ├── diversityScore             -> resources/index.md Diversity column
│   ├── topic_path                 -> (not used directly — record.topic is used instead)
│   ├── baseScore                  -> NOT included in JSONL (removed — less reliable than eval)
│   ├── isDuplicate                -> NOT used by packaging (UI visibility only)
│   ├── duplicateClusterId         -> NOT used by packaging (UI visibility only)
│   └── duplicateClusterTheme      -> NOT used by packaging (UI visibility only)
├── topic                          -> Grouping key for per-topic JSONL files
└── evaluations
    └── [jobId].score              -> JSONL `eval_scores` map
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

**Why no auto-filtering by score:** Whatever records exist in IndexedDB go into the package. The user has full control — they see scores in the UI and can tell Lucy to remove records. Automatic filtering is dangerous (broken grader -> empty package) and premature.

---

## Knowledge Section Extraction

Knowledge sources are extracted into individual section files stored in `knowledge/sections/`.

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
              text: "A pin is a tactic... The pinned piece...",
              pageStart: 16,
              pageEnd: 21
            },
            ...
          ]

  -> collectSectionsFromSources() produces SectionEntry:
     {
       sourceName: "Chess Guide.pdf",
       sourceSlug: "chess-guide-pdf",
       title: "3.2 Pins",
       slug: "3-2-pins",
       content: "# 3.2 Pins\n\n**Source:** Chess Guide.pdf | **Pages:** pp.16-21\n\n**Summary:** Pins are...\n\nA pin is a tactic...",
       pageRange: "pp.16-21"
     }

  -> Written to: knowledge/sections/chess-guide-pdf-3-2-pins.md
  -> Referenced in: knowledge/domain-knowledge.md (table row with page range)
```

### Legacy: LLM Extraction (fallback)

```
KnowledgeSource
  └── extractedContent
      ├── sections: [
      │     { title: "Pins", content: "A pin is a tactic that..." },
      │     ...
      │   ]
      └── metadata
          ├── extractionMethod: undefined (or not "local-semantic")
          └── document_summary: "This document covers..."

  -> collectSectionsFromSources() produces SectionEntry:
     {
       sourceName: "Chess Guide.pdf",
       sourceSlug: "chess-guide-pdf",
       title: "Pins",
       slug: "pins",
       content: "# Pins\n\n**Source:** Chess Guide.pdf\n\nA pin is a tactic that...",
       // No pageRange — won't appear in domain-knowledge.md table
     }

  -> Written to: knowledge/sections/chess-guide-pdf-pins.md
  -> NOT in domain-knowledge.md table (no pageRange)
```

### domain-knowledge.md as Reference Table

The `buildKnowledgeDoc()` function builds a **reference table** (not full content). Only entries with a `pageRange` appear:

```markdown
# Domain Knowledge

Reference sections from uploaded documents. Use your Read tool to load full content.

## Section Reference

| Section | File | Source | Pages |
|---------|------|--------|-------|
| 3.2 Pins | [chess-guide-pdf-3-2-pins.md](sections/chess-guide-pdf-3-2-pins.md) | Chess Guide.pdf | pp.16-21 |
```

This means legacy-extracted content (no page ranges) still gets section files but won't appear in the reference table.

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
├── knowledge/domain-knowledge.md (optional)
│   Section reference table: Section | File | Source | Pages
│
└── knowledge/sections/*.md (optional)
    Individual section files with full content from extracted documents
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

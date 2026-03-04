# Skill Package — Data Flow

## End-to-End Data Flow

This document traces how data flows from generation through packaging, showing exactly where each piece of data originates, where it's stored, and how it's consumed.

---

## Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        DATA GENERATION                                   │
│                                                                          │
│  callLucy() with unified prompt template                                 │
│  ┌──────────────────────────────────────────────┐                       │
│  │ LLM Response (per batch of 10):              │                       │
│  │ {                                             │                       │
│  │   "examples": [                               │                       │
│  │     {                                         │                       │
│  │       "user_message": "...",                   │                       │
│  │       "assistant_response": "...",             │                       │
│  │       "expected_score": 0.85                   │                       │
│  │     }                                         │                       │
│  │   ]                                           │                       │
│  │ }                                             │                       │
│  └──────────────────┬───────────────────────────┘                       │
│                     │                                                    │
│                     ▼                                                    │
│  ┌──────────────────────────────────────────────┐                       │
│  │ exampleToDataInfo() splits into:             │                       │
│  │                                               │                       │
│  │ record.data (for fine-tuning):                │                       │
│  │ {                                             │                       │
│  │   input: {                                    │                       │
│  │     messages: [system_msg, user_msg],         │                       │
│  │     tools: [...]                              │                       │
│  │   },                                          │                       │
│  │   output: {}  ← always empty                  │                       │
│  │ }                                             │                       │
│  │                                               │                       │
│  │ record.metadata (for skill packaging):        │                       │
│  │ {                                             │                       │
│  │   skillResponse: "...",    ← assistant text   │                       │
│  │   baseScore: 0.85,        ← expected quality  │                       │
│  │   topic_path: "Chess/Openings/Italian Game",  │                       │
│  │   sourceChunkRefs: ["src1:chunk42"],          │                       │
│  │   generation_source: "initial_data",          │                       │
│  │   generated_at_ms: 1709500000000,             │                       │
│  │   diversityScore: undefined,  ← set later     │                       │
│  │   isDuplicate: undefined,     ← set later     │                       │
│  │   duplicateClusterId: undefined,              │                       │
│  │   duplicateClusterTheme: undefined            │                       │
│  │ }                                             │                       │
│  └──────────────────┬───────────────────────────┘                       │
│                     │                                                    │
│                     ▼                                                    │
│           datasetsDB.addRecordsToDataset()                               │
│                     │                                                    │
│                     ▼                                                    │
│              ┌─────────────┐                                             │
│              │  IndexedDB   │                                             │
│              │  (records)   │                                             │
│              └──────┬──────┘                                             │
│                     │                                                    │
│                     ▼                                                    │
│  ┌──────────────────────────────────────────────┐                       │
│  │ DIVERSITY AUDIT (1 LLM call per topic):      │                       │
│  │                                               │                       │
│  │ computeDiversityMetadata() patches records:   │                       │
│  │ {                                             │                       │
│  │   diversityScore: 0.82,  ← per-topic score   │                       │
│  │   isDuplicate: false,    ← true if flagged    │                       │
│  │   duplicateClusterId: "cluster-3",            │                       │
│  │   duplicateClusterTheme: "Najdorf variants"   │                       │
│  │ }                                             │                       │
│  │                                               │                       │
│  │ Flags only — never removes records.           │                       │
│  │ UI shows indicators. User decides action.     │                       │
│  └──────────────────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────────────────┘

                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  FINE-TUNING    │  │  EVALUATION     │  │  SKILL PACKAGE  │
│  (upload)       │  │  (dry run)      │  │  (packaging)    │
│                 │  │                 │  │                 │
│ Reads:          │  │ Reads:          │  │ Reads:          │
│ record.data     │  │ record.data     │  │ record.data     │
│   .input        │  │   .input        │  │   .input.msgs   │
│   .output (={}) │  │   .output (={}) │  │ record.metadata  │
│                 │  │                 │  │   .skillResponse │
│ Sends to API:   │  │ Sends to API:   │  │   .baseScore    │
│ { messages:     │  │ dataset file    │  │   .topic_path   │
│   [sys, user],  │  │                 │  │   .sourceChunkRefs
│   id: "..." }   │  │ Gets back:      │  │   .diversityScore
│                 │  │ scores per row  │  │                 │
│ No assistant    │  │ (0.0-1.0)       │  │ record.evaluations│
│ response sent   │  │                 │  │  [jobId].score  │
│                 │  │ Stores per-job: │  │                 │
│ No diversity    │  │ record          │  │ NO auto filter  │
│ filtering       │  │  .evaluations   │  │ Packages ALL    │
│                 │  │  [jobId].score  │  │ records in DB   │
│                 │  │  [jobId].model  │  │                 │
│                 │  │                 │  │ Also reads:      │
│                 │  │                 │  │ dataset.objective│
│                 │  │                 │  │ dataset.topics   │
│                 │  │                 │  │ dataset.evalScript│
│                 │  │                 │  │ knowledgeSources │
│                 │  │                 │  │   .extractedContent
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Key principle: what you see is what you get.** Whatever records exist in IndexedDB go into both fine-tuning AND skill packaging. No filtering by scores, diversity flags, or evaluation results. Zero surprise.

---

## Per-Record Data Map

Shows every field on a record and which downstream consumer uses it:

```
DatasetRecord
├── id                    → Fine-tuning (as row ID), Skill package (for tracking)
├── datasetId             → All consumers (foreign key)
├── data                  → Fine-tuning, Evaluation
│   ├── input
│   │   ├── messages[]
│   │   │   ├── [0] system   → Fine-tuning ✓  Evaluation ✓  Skill package ✓
│   │   │   └── [1] user     → Fine-tuning ✓  Evaluation ✓  Skill package ✓
│   │   └── tools[]          → Fine-tuning ✓  Evaluation ✗  Skill package ✗
│   └── output
│       └── {}               → Fine-tuning ✓ (always empty)  Evaluation ✓  Skill package ✗
├── metadata
│   ├── skillResponse        → Fine-tuning ✗  Evaluation ✗  Skill package ✓
│   ├── baseScore            → Fine-tuning ✗  Evaluation ✗  Skill package ✓ (JSONL + index table avg)
│   ├── topic_path           → Fine-tuning ✗  Evaluation ✗  Skill package ✓
│   ├── sourceChunkRefs      → Fine-tuning ✗  Evaluation ✗  Skill package ✓
│   ├── diversityScore       → Fine-tuning ✗  Evaluation ✗  Skill package ✓ (index table)
│   ├── isDuplicate          → Fine-tuning ✗  Evaluation ✗  Skill package ✗ (UI visibility only)
│   ├── duplicateClusterId   → Fine-tuning ✗  Evaluation ✗  Skill package ✗ (UI visibility only)
│   ├── duplicateClusterTheme→ Fine-tuning ✗  Evaluation ✗  Skill package ✗ (UI visibility only)
│   ├── generation_source    → Fine-tuning ✗  Evaluation ✗  Skill package ✗ (internal)
│   └── generated_at_ms      → Fine-tuning ✗  Evaluation ✗  Skill package ✗ (internal)
├── topic                    → Fine-tuning ✗  Evaluation ✗  Skill package ✓ (grouping)
├── is_generated             → Fine-tuning ✗  Evaluation ✗  Skill package ✗ (internal)
├── evaluations              → Per-job evaluation data (keyed by evaluation job ID)
│   └── [jobId]
│       ├── score            → Fine-tuning ✗  Evaluation ✓  Skill package ✓ (JSONL eval_scores)
│       ├── model            → Fine-tuning ✗  Evaluation ✓  Skill package ✗
│       └── evaluatedAt      → Fine-tuning ✗  Evaluation ✓  Skill package ✗
└── createdAt / updatedAt    → Internal timestamps
```

### Diversity Fields Detail

| Field | Set By | When | Purpose |
|-------|--------|------|---------|
| `diversityScore` | `computeDiversityMetadata()` | After generation, per topic | Per-topic diversity score (0.0-1.0). Shown in `examples/index.md` Diversity column. |
| `isDuplicate` | `computeDiversityMetadata()` | After generation, per record | `true` if flagged as semantically duplicate. **UI visibility only** — not used for filtering. |
| `duplicateClusterId` | `computeDiversityMetadata()` | After generation, per record | Groups semantically similar records. Used by UI to show clusters. |
| `duplicateClusterTheme` | `computeDiversityMetadata()` | After generation, per record | Human-readable label for the duplicate cluster (e.g., "questions about Najdorf variations"). |

**Diversity flags are informational.** They are never used to automatically exclude records from any consumer (fine-tuning, evaluation, or skill packaging). The user can tell Lucy "remove duplicates" to explicitly delete flagged records from IndexedDB.

---

## Score Flow

Two distinct score types exist. They serve different purposes and are **never mixed**:

```
┌─────────────────────────────────────────────────────────────────┐
│  base_score (record.metadata.baseScore)                         │
│                                                                  │
│  Set by:    LLM self-assessment during generation                │
│  When:      Immediately during coverage_generation step          │
│  Purpose:   Quality signal from generation model                 │
│  Storage:   record.metadata.baseScore (one per record)           │
│  Packaging: Included in JSONL as `base_score` field              │
│  Filtering: None automatic. User decides what to do with scores. │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  eval_scores (record.evaluations[jobId].score)                  │
│                                                                  │
│  Set by:    External grader model during dry_run step            │
│  When:      After evaluation job completes (optional step)       │
│  Purpose:   External quality signal from grader model            │
│  Per-job:   Each evaluation job has its own score per record.    │
│             Multiple jobs = multiple scores (different graders,  │
│             different models). Keyed by evaluation job ID.       │
│  Packaging: Included in JSONL as `eval_scores` map               │
│  Filtering: None automatic. User decides what to do with scores. │
└─────────────────────────────────────────────────────────────────┘

Summary:
  base_score     = LLM self-assessment (always present after generation)
  eval_scores    = external grader scores (per-job, optional)
  Both included  in JSONL output for maximum flexibility.
  Filtering      = NONE. Package everything in IndexedDB. Decide later.
```

**Why both scores in JSONL**: Scores are data, not instructions. Including them preserves optionality — the consumer (Claude, a future system, or the user) can decide how to use them. Low-scored examples may serve as **negative demonstrations** (multi-shot prompting: "this is a weak response, avoid this pattern"). High-scored examples serve as positive demonstrations. The filtering strategy is a downstream decision, not a packaging-time decision.

**Why no packaging-time filtering**: Whatever records exist in IndexedDB go into the package. The user has full control via the UI — they see scores, they can tell Lucy to remove records. Automatic filtering is dangerous (broken grader → empty package) and premature (low-scored examples might be useful as counter-examples).

---

## Skill Package Assembly

What happens inside `generate_skill_package` (zero LLM calls, zero score filtering):

```
Step 1: Read from IndexedDB
  ├── dataset.datasetObjective          → SKILL.md Role & Objective
  ├── dataset.topicHierarchy            → SKILL.md Expertise Areas
  ├── dataset.evalScript                → rules/response-guidelines.md → INLINED into SKILL.md
  └── records[]                         → examples/{topic}.jsonl source data
  (ALL records — no filtering. Scores are included but never used to auto-filter.)

Step 2: Read Knowledge Sources (optional)
  └── knowledgeSources[]
      └── extractedContent              → knowledge/domain-knowledge.md
          ├── summary
          ├── sections[].title
          └── sections[].content

Step 3: Group Records by Topic → Per-Topic JSONL Files
  ├── groupByTopic() → TopicExamples[] (one entry per leaf topic)
  │   Each group has: topicPath, slug, records (sorted by baseScore desc), avgBaseScore
  └── buildTopicJsonl() per group:
      For each record in the topic:
      └── {
            system:      record.data.input.messages[0].content,
            user:        record.data.input.messages[1].content,
            assistant:   record.metadata.skillResponse,
            base_score:  record.metadata.baseScore,
            eval_scores: record.evaluations → { [jobId]: score } (empty {} if no eval),
            sources:     record.metadata.sourceChunkRefs
          }
      Note: Both scores included — base_score (LLM self-assessment) and eval_scores
            (per-job external grader scores). Preserves optionality for downstream use.
      Note: No topic field — redundant with filename.

Step 4: Build examples/index.md
  └── buildExamplesIndex():
      Topic map table with: Topic | File | Examples | Avg Score | Diversity
      Avg Score uses record.metadata.baseScore (human readability only)
      Diversity uses record.metadata.diversityScore (per-topic)

Step 5: Build rules/response-guidelines.md
  └── buildResponseGuidelines():
      Grader criteria → behavioral rules. Falls back to generic best practices.

Step 6: Build knowledge/domain-knowledge.md (optional)
  └── buildKnowledgeDoc():
      Extracted content from uploaded docs, organized by source document.
      Omitted if no knowledge sources exist.

Step 7: Build SKILL.md (directive orchestrator)
  └── buildSkillMarkdown():
      ├── YAML frontmatter: name, description, argument-hint
      ├── ## Role & Objective (from objective + counts)
      ├── ### Expertise Areas (from topicHierarchy → nested markdown list)
      ├── ## Response Guidelines (INLINED — full rulesDoc content)
      ├── ## Available Examples (INLINED — full examplesIndex table)
      ├── ## How to Use Examples (IMPORTANT) — static directive template
      │   └── "ALWAYS load relevant examples before responding. DO NOT guess."
      ├── ## Domain Knowledge — explicit Read instruction (if knowledge exists)
      └── ## Representative Examples — top 3-5 by baseScore, embedded inline

Step 8: Return SkillPackageFiles
  └── {
        skillMd,                         // SKILL.md content (< 500 lines)
        examplesIndex,                    // examples/index.md content
        topicFiles: ReadonlyMap<slug, jsonl>,  // per-topic JSONL content
        knowledgeDoc: string | null,      // knowledge/domain-knowledge.md or null
        rulesDoc,                         // rules/response-guidelines.md content
      }
```

**Why rules and index are inlined into SKILL.md**: Small content (~40-60 lines combined). Claude has behavioral rules and topic map immediately when the skill is invoked — zero Read calls needed to know how to behave and where to find examples. The separate files (`rules/response-guidelines.md`, `examples/index.md`) still exist in the ZIP for human readability.

---

## Download Flow

```
generate_skill_package returns SkillPackageFiles
                │
                ▼
download_skill_package receives package data
                │
                ▼
        JSZip assembles multi-file ZIP:
        {skill-name}/
        ├── SKILL.md
        ├── knowledge/
        │   └── domain-knowledge.md     (only if knowledge sources exist)
        ├── examples/
        │   ├── index.md
        │   ├── {topic-1-slug}.jsonl
        │   ├── {topic-2-slug}.jsonl
        │   └── ...                      (one file per leaf topic)
        └── rules/
            └── response-guidelines.md
                │
                ▼
        zip.generateAsync({ type: 'blob' })
                │
                ▼
        Browser download triggered via <a> element
                │
                ▼
        User gets: {skill-name}.zip
```

---

## What Each Consumer Gets (Summary)

### Fine-Tuning Upload

```jsonl
{"messages":[{"role":"system","content":"You are a chess tutor..."},{"role":"user","content":"What is the Sicilian Defense?"}],"id":"rec-abc123"}
```

No assistant response. No metadata. No scores. Just the prompt — the training process generates its own responses.

### Evaluation (Dry Run)

The dataset file uploaded to the evaluation API. Backend generates its own responses using a rollout model, then scores them with the configured grader. Scores flow back to `record.evaluations[jobId].score`. Each evaluation job stores its own score per record — multiple jobs = multiple independent scores (different graders, different models, different configs).

### Skill Package

```
{skill-name}/
├── SKILL.md
│   Directive orchestrator (< 500 lines). Contains:
│   - Role & Objective with expertise areas
│   - Response Guidelines (INLINED from rules/response-guidelines.md)
│   - Available Examples table (INLINED from examples/index.md)
│   - "How to Use Examples" with explicit Read instructions
│   - Top 3-5 representative examples embedded inline
│   - Domain Knowledge Read instruction (if knowledge exists)
│
├── knowledge/domain-knowledge.md
│   Extracted content from uploaded documents, organized by source.
│   Loaded on demand via Read call (can be long).
│
├── examples/index.md
│   Topic map table: Topic | File | Examples | Avg Score | Diversity
│   Also inlined into SKILL.md so Claude has it immediately.
│
├── examples/{topic}.jsonl (one per leaf topic)
│   Full conversations: system + user + assistant + base_score + eval_scores + sources
│   Both scores included for maximum flexibility (negative demos, filtering, etc.)
│   Loaded on demand — Claude reads only the relevant topic file.
│
└── rules/response-guidelines.md
    Behavioral rules from grader criteria.
    Also inlined into SKILL.md so Claude has it immediately.
```

Everything a foundation model needs to become the specialist the user designed.

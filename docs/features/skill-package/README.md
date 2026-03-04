# Skill Package Feature

## Status: Implementation Ready

---

## Goal

Turn every finetune dataset into a **downloadable Claude Code skill package** that users can test immediately, without waiting hours for a fine-tuned model to finish training.

The user uploads documents, defines an objective, generates training data with Lucy, and gets a `.zip` they can drop into `.claude/skills/` on their machine. Their Claude Code client instantly becomes a domain expert.

---

## Why We're Doing This

### The Problem

Fine-tuning takes hours. After a user spends 10-15 minutes generating data, configuring a grader, and running evaluation, they click "Start Training" and then... wait. Sometimes 2-6 hours. They have no way to test whether their dataset actually produces useful behavior until the job completes.

If the fine-tuned model underperforms (which is common with small models + LoRA), the user wasted hours and must iterate again.

### The Insight

By the time a user reaches the training step, they already have everything needed to make a foundation model behave as a specialist:

- **Dataset objective** (what the model should do)
- **Topic hierarchy** (what domains it covers)
- **Knowledge source content** (extracted from their uploaded PDFs/docs)
- **500+ synthetic examples** (system + user + assistant conversations, scored)
- **Grader criteria** (what "good" looks like)

A foundation model like Claude, given this context as a skill, can perform as well or better than a fine-tuned small model. The user gets instant results while fine-tuning runs in the background.

### The Value

| Without Skill Package | With Skill Package |
|---|---|
| User waits 2-6 hours for training | User downloads skill in seconds |
| Tests only after training completes | Tests immediately after data generation |
| If model is bad, wasted hours | If skill needs tuning, iterate in minutes |
| Locked to one inference provider | Works with any Claude Code client |
| Requires deployment infrastructure | Just a folder on disk |

---

## How It Fits in the Pipeline

Skill packaging is a **new optional step** in the existing finetune workflow. It does NOT replace or block any existing step.

```
1. topics_config        (existing, optional)
2. categorize           (existing, optional)
3. coverage_generation  (MODIFIED — unified generation, always produces assistant responses)
4. grader_config        (existing, required for training)
5. dry_run              (existing, optional)
6. skill_packaging      (NEW — zero LLM calls, pure packaging)
7. training             (existing, required)
8. deployment           (existing, optional)
```

### Skill Package Is Always Ready After Generation

```
coverage_generation → skill_packaging → download
                    → grader_config → dry_run → training (parallel)
```

Generation produces records with baseScore (LLM self-assessment). All records are kept — no auto-discarding based on scores. Low-scored examples may be useful as negative demonstrations (multi-shot prompting: "this is a weak response, avoid this pattern").

Evaluation (dry run) is optional and informational — it shows how a grader scores each record, but does NOT affect what goes into the skill package. The user can review both base scores and evaluation scores in the UI and tell Lucy to remove bad records if they want. Skill packaging **never blocks training**. Both can run from the same data.

---

## Unified Data Generation (Key Change)

### Before: RFT vs SFT Modes

The pipeline previously had two generation modes:

- **RFT** (default): Generated `system + user` messages only. Empty output.
- **SFT**: Generated `system + user + assistant` messages.

This distinction added complexity (3 branching points in `generate-initial-data.ts`) and meant RFT mode had no assistant responses for skill packaging.

### After: One Generation Mode

Every generation call now produces **all three fields**:

```json
{
  "examples": [
    {
      "user_message": "What is the Sicilian Defense?",
      "assistant_response": "The Sicilian Defense is a chess opening that begins with 1.e4 c5...",
      "expected_score": 0.85
    }
  ]
}
```

| Field | Purpose | Used By |
|-------|---------|---------|
| `user_message` | The user's question/request | Fine-tuning upload, skill package |
| `assistant_response` | Ideal model response | Skill package ONLY (not uploaded for fine-tuning) |
| `expected_score` | LLM self-assessed quality (0.0-1.0) | Quality signal from generation model. Stored as `baseScore` in metadata and `base_score` in JSONL. No auto-filtering — all records kept. |

### Where Data Lives on a Record

```typescript
// record.data — used by fine-tuning upload (unchanged format)
{
  input: {
    messages: [
      { role: "system", content: "You are a chess tutor..." },
      { role: "user", content: "What is the Sicilian Defense?" }
    ],
    tools: [...]
  },
  output: {}  // Always empty — fine-tuning generates its own responses
}

// record.metadata — used by skill packaging
{
  generation_source: "initial_data",
  generated_at_ms: 1709500000000,
  topic_path: "Chess/Openings/Sicilian Defense",
  sourceChunkRefs: ["source1:chunk42"],
  skillResponse: "The Sicilian Defense is a chess opening...",  // NEW — assistant text for skill package
  baseScore: 0.85,                                               // NEW — LLM self-assessed quality signal
  diversityScore: 0.82,                                          // NEW — per-topic (same for all records in topic)
  isDuplicate: false,                                             // NEW — true if flagged as duplicate
  duplicateClusterId: undefined,                                  // NEW — cluster ID if part of a duplicate group
  duplicateClusterTheme: undefined,                               // NEW — human-readable cluster label
}

// record.evaluations — per-job evaluation scores (included in JSONL as eval_scores, never used to filter)
{
  "eval-job-abc123": {
    score: 0.78,                // grader-assessed quality
    model: "gpt-4o-mini",       // rollout model used
    evaluatedAt: 1709600000000, // timestamp
  },
  "eval-job-def456": {          // second evaluation with different config
    score: 0.82,
    model: "gpt-4o",
    evaluatedAt: 1709700000000,
  },
}
```

**Clean separation**: `record.data` is the fine-tuning format. `record.metadata` holds skill packaging data. They never interfere with each other.

### Diversity Audit

After generating a batch of records for each topic, an **LLM diversity audit** detects semantically duplicate questions (e.g., "What's the Najdorf?" vs "Can you explain the main Najdorf concept?"). Duplicates are **flagged in metadata for visibility** — the system never automatically removes records.

```
Generation: 50 records for "Sicilian Defense"
  → Diversity audit (1 LLM call): score 0.72, 6 duplicate clusters found
  → ALL 50 records saved to IndexedDB ✓ (12 flagged as isDuplicate=true)

UI shows: diversity indicators (score, flagged record badges)
  → User reviews and decides what to do

Option A — User does nothing:
  → All 50 records stay → all 50 go into skill package & fine-tuning

Option B — User tells Lucy "remove duplicates in Sicilian Defense":
  → Lucy deletes 12 flagged records from IndexedDB → 38 remain
  → 38 records go into skill package & fine-tuning
```

**Key principle: what you see is what you get.** Whatever records exist in the UI are exactly what goes into the skill package. No hidden filtering.

| Detail | Value |
|--------|-------|
| **Cost** | 1 LLM call per topic (~12 extra calls for a typical dataset) |
| **Threshold** | Skipped for topics with < 5 records (too few for meaningful duplication) |
| **Record count** | Always matches what user requested — no auto-deletion anywhere |
| **Flags stored** | `diversityScore`, `isDuplicate`, `duplicateClusterId`, `duplicateClusterTheme` in record.metadata |
| **Auto-dedup** | None. Diversity is visibility only. User must explicitly tell Lucy to remove duplicates. |
| **Effect on skill package** | Whatever records the user sees in the UI goes into the package — no hidden filtering |
| **Effect on fine-tuning** | Same — whatever records exist in IndexedDB go to fine-tuning |

### System Messages

System messages are generated **per topic** (shared across all records in that topic). This is unchanged. The `resolveTopicSystemPrompt()` function builds a system prompt from:

- Training objective
- Topic path (e.g., "Chess > Openings > Sicilian Defense")
- Optional custom prompt template per topic
- Normalized role description

### Fine-Tuning Upload Format (Unchanged)

The upload function `recordToTrainingFormat()` reads `record.data.input.messages` + `record.data.output.messages`. Since `output` is always `{}`, the upload sends only system + user messages. **No changes needed to upload logic.**

---

## Package Specification

### What the User Downloads

A `.zip` file containing a ready-to-use Claude Code skill folder:

```
{skill-name}/
├── SKILL.md                          # Main skill definition (YAML frontmatter + markdown)
├── knowledge/
│   └── domain-knowledge.md           # Extracted content from uploaded documents
├── examples/
│   ├── index.md                      # Human-readable topic map → file lookup
│   ├── {topic-1-slug}.jsonl          # Examples for topic 1
│   ├── {topic-2-slug}.jsonl          # Examples for topic 2
│   ├── {topic-3-slug}.jsonl          # Examples for topic 3
│   └── ...                           # One file per leaf topic
└── rules/
    └── response-guidelines.md        # Behavioral rules from grader criteria
```

Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard, which works across multiple AI tools. Our package produces a standard-compliant skill folder.

### Why Multi-File (not monolithic)

| Concern | Monolithic (1 JSONL) | Multi-file (per-topic) |
|---------|---------------------|----------------------|
| **Context efficiency** | Claude loads ALL 500+ examples to find 30 about billing | Claude reads `index.md` → opens only `billing.jsonl` |
| **Scalability** | 1000 records = 1 huge file | 1000 records = ~12 small files |
| **SKILL.md size** | Knowledge + rules + examples crammed in | SKILL.md is directive orchestrator (< 500 lines) |
| **Human readability** | Opaque blob | Developer instantly sees structure |
| **Maintainability** | Can't easily edit one topic | User can add/remove examples per topic |

### How Claude Code Discovers and Uses the Skill

#### Step 1: User installs the skill

```bash
# Download zip from vLLora UI
# Extract to personal skills folder (available to all projects):
unzip chess-opening-tutor.zip -d ~/.claude/skills/

# OR extract to project skills folder (available only in this project):
unzip chess-opening-tutor.zip -d .claude/skills/
```

Claude Code auto-discovers skills in these locations (ordered by priority):
| Location | Path | Scope |
|----------|------|-------|
| Personal | `~/.claude/skills/{skill-name}/SKILL.md` | All projects |
| Project | `.claude/skills/{skill-name}/SKILL.md` | This project only |

#### Step 2: Claude sees the skill description (always in context)

Claude Code loads **only the `description` field** from every skill's YAML frontmatter into its working context at all times. This is lightweight — just the description string, not the full file. The description budget scales at 2% of context window (fallback: 16,000 chars).

```
# What Claude always sees (from frontmatter):
Skill: chess-opening-tutor
Description: Expert chess opening tutor for club-level players (1200-1800 ELO)
```

#### Step 3: Claude auto-invokes when relevant

When the user asks a question that matches the skill's description, Claude automatically invokes it. **Only then** does the full `SKILL.md` content get loaded into Claude's context.

```
User: "What should I play against the London System?"
Claude thinks: "This matches chess-opening-tutor skill" → loads full SKILL.md
Claude responds: Uses the instructions, topic map, and top examples from SKILL.md
```

Users can also manually invoke with `/chess-opening-tutor What should I play against the London System?`

> **From official docs**: "Skill descriptions are loaded into context so Claude knows what's available, but full skill content only loads when invoked."

#### Step 4: Claude reads only what it needs (usually 1 Read call)

SKILL.md already contains rules and the topic map table (inlined), so Claude has behavioral context immediately. It only needs to Read the relevant JSONL file:

```
1. SKILL.md loaded → Claude already has:
   - Response Guidelines (inlined — knows how to behave)
   - Topic Map table (inlined — knows which file to read)
   - Top representative examples (embedded — immediate behavioral calibration)
2. Claude reads the inlined topic map → finds "London System → examples/london-system.jsonl"
3. Claude reads examples/london-system.jsonl → gets 30 London-specific examples (1 Read call)
4. (Optional) If deeper context needed → Claude reads knowledge/domain-knowledge.md (1 more Read call)
5. Claude constructs response following inlined guidelines + loaded example patterns
```

This multi-tier approach is key:
- **SKILL.md** = directive orchestrator + inlined rules + inlined topic map + top embedded examples (always loaded when invoked — Claude has behavioral context immediately)
- **examples/{topic}.jsonl** = full examples for one topic (1 Read call, small file)
- **knowledge/domain-knowledge.md** = deep reference material (loaded only when needed, 1 Read call)

Small files (rules, index table) are **inlined** into SKILL.md so Claude has them immediately. Large files (knowledge doc, per-topic JSONL) are loaded on demand via explicit Read instructions in SKILL.md.

> **From official docs**: "Keep SKILL.md under 500 lines. Move detailed reference material to separate files." Our approach inlines small content (~40-60 lines) and keeps large content in separate files.

---

### SKILL.md — Detailed Specification

The file has two parts: **YAML frontmatter** (between `---` markers) and **markdown body**. It's a **directive orchestrator** — tells Claude who it is, how to behave, where to find examples, and exactly when to read supporting files. Small content (rules, topic map) is inlined so Claude has it immediately. Large content (knowledge, JSONL files) is loaded on demand via explicit Read instructions.

#### YAML Frontmatter

```yaml
---
name: {skill_name}                                    # lowercase, hyphens, max 64 chars
description: {dataset_objective}                      # Claude uses this to decide when to auto-invoke
argument-hint: "<your question about {domain}>"       # Shown during autocomplete in Claude Code
---
```

| Field | Value Source | Required | Official Default |
|-------|-------------|----------|-----------------|
| `name` | Derived from dataset objective (slugified) | Recommended | Falls back to directory name |
| `description` | `dataset.datasetObjective` verbatim | Recommended | Falls back to first paragraph of content |
| `argument-hint` | Generated from objective domain | Optional | None |

We intentionally do NOT set these frontmatter fields (using their defaults):
- `disable-model-invocation` (default: `false`) — we WANT auto-invoke (that's the whole point)
- `user-invocable` (default: `true`) — user should be able to `/skill-name` manually too
- `allowed-tools` — Claude should have full tool access to Read supporting files
- `context` — we want the skill inline in the main conversation, not a forked subagent
- `model` — use whatever model the user's Claude Code session is running

#### Markdown Body Template

```markdown
---
name: {skill_name}
description: {dataset_objective}
argument-hint: "<your question about {domain}>"
---

# {Skill Name}

## Role & Objective

You are an expert in {domain}. You have deep knowledge across {topic_count}
topics, backed by {example_count} curated examples and {source_count}
reference documents.

### Expertise Areas

{topic_hierarchy_formatted — rendered as nested markdown list}

- Topic 1
  - Subtopic 1a
  - Subtopic 1b
- Topic 2
  - Subtopic 2a

## Response Guidelines

{INLINED — full content of rules/response-guidelines.md, typically 20-40 lines}

## Available Examples

{INLINED — full content of examples/index.md topic map table, typically 15-25 lines}

## How to Use Examples (IMPORTANT)

Before answering any question:
1. Read the topic map above to identify which topic file(s) match the user's question
2. Use your Read tool to load `examples/{topic}.jsonl` for the matching topic(s)
3. Study the examples for tone, format, and domain accuracy
4. Answer the user's question following those patterns

You have access to {example_count} examples across {topic_count} topics.
ALWAYS load relevant examples before responding.
DO NOT guess — check the examples first.

## Domain Knowledge

For deep reference material, use your Read tool to load:
  `knowledge/domain-knowledge.md`

Only load this when you need additional context beyond what the examples provide.

## Representative Examples

These are the highest-scored examples across major topic areas. Use them as
immediate reference — for more examples on any topic, load the relevant JSONL file.

### {Topic Name} (Score: {score})
**User**: {user_message}
**Assistant**: {assistant_response}

### {Topic Name} (Score: {score})
**User**: {user_message}
**Assistant**: {assistant_response}
```

**Constraints**:
- SKILL.md must be **under 500 lines** (official Claude Code recommendation)
- **Inlined**: Response Guidelines (~20-40 lines) + Examples Index table (~15-25 lines)
- **Inline representative examples**: max 3-5 (one per major topic area, highest scored)
- **Read on demand**: Knowledge doc (can be long) + per-topic JSONL files
- If no knowledge sources: omit knowledge/ folder and Domain Knowledge section
- If no grader configured: response guidelines falls back to generic best practices

#### Section-by-Section Source Map

| Section | Data Source | How It's Built |
|---------|-----------|----------------|
| **Role & Objective** | `dataset.datasetObjective` | Template with topic/example/source counts |
| **Expertise Areas** | `dataset.topicHierarchy.hierarchy` | Recursive tree → nested markdown list |
| **Response Guidelines** | `buildResponseGuidelines()` output | INLINED — grader criteria → behavioral rules, or generic fallback |
| **Available Examples** | `buildExamplesIndex()` output | INLINED — topic map table with file links, counts, scores, diversity |
| **How to Use Examples** | Static template | Explicit step-by-step Read instructions + behavioral directives |
| **Domain Knowledge** | Explicit Read instruction | Points Claude to `knowledge/domain-knowledge.md` |
| **Representative Examples** | Top 3-5 records by score | Select highest-scored record per major topic, embed user + assistant inline |

---

### knowledge/domain-knowledge.md — Specification

Contains extracted content from uploaded knowledge sources (PDFs, docs), organized by source document.

```markdown
# Domain Knowledge

## {Document Title 1}

{summary: what the document covers, page count, section count}

### Key Concepts
{extracted_concepts_and_terminology}

### Reference Sections
{condensed_section_headings_and_key_content}

---

## {Document Title 2}
...
```

| Data Source | How It's Built |
|-----------|----------------|
| `KnowledgeSource[]` from IndexedDB | Filter `status === 'ready'`, extract `extractedContent.sectionHeadings`, `extractedContent.summary`, condensed key content |

**If no knowledge sources exist**: This file and folder are omitted from the package. SKILL.md's "Domain Knowledge" section is also omitted.

---

### rules/response-guidelines.md — Specification

Behavioral rules derived from the evaluation grader criteria. Tells Claude HOW to respond.

```markdown
# Response Guidelines

## Core Principles

{derived_from_dataset_objective — high-level behavioral expectations}

## Quality Criteria

{derived_from_eval_script / grader_criteria — converted from scoring rubric to behavioral rules}

- {Guideline 1}: e.g., "Explain strategic ideas before listing specific moves"
- {Guideline 2}: e.g., "Keep responses concise — under 300 words unless depth is requested"
- {Guideline 3}: e.g., "Always cite sources when referencing specific material"
- {Guideline 4}: e.g., "If asked about something outside your knowledge, say so explicitly"

## Tone and Style

{derived_from_objective — communication style expectations}
```

| Data Source | How It's Built |
|-----------|----------------|
| `dataset.evalScript` | Parse grader criteria → behavioral rules |
| `dataset.datasetObjective` | Extract tone/style expectations |

**If no grader is configured**: Falls back to generic best practices derived from the objective (e.g., "be helpful, accurate, and concise").

---

### examples/index.md — Specification

A human-readable topic map that tells Claude which file to read for each topic.

```markdown
# Examples Index

{total_example_count} examples across {topic_count} topics.
Each example includes base_score (LLM self-assessment) and eval_scores (external grader, per-job).

## Topic Map

| Topic | File | Examples | Avg Score | Diversity |
|-------|------|----------|-----------|-----------|
| Open Games > Italian Game | [italian-game.jsonl](italian-game.jsonl) | 42 | 0.82 | 0.88 |
| Open Games > Ruy Lopez | [ruy-lopez.jsonl](ruy-lopez.jsonl) | 38 | 0.79 | 0.85 |
| Semi-Open > Sicilian Defense | [sicilian-defense.jsonl](sicilian-defense.jsonl) | 55 | 0.84 | 0.72 |
| Closed Games > Queen's Gambit | [queens-gambit.jsonl](queens-gambit.jsonl) | 31 | 0.77 | 0.91 |
| General > Center Control | [center-control.jsonl](center-control.jsonl) | 28 | 0.81 | 0.79 |
| ... | ... | ... | ... | ... |
```

The **Diversity** column shows the per-topic diversity score (0.0-1.0) from the LLM diversity audit. Values below 0.6 may indicate too many semantically similar examples.

Claude reads this file first to find the right JSONL file, then reads only that file.

---

### examples/{topic}.jsonl — Specification

One JSONL file per leaf topic. One JSON object per line, sorted by baseScore descending.

#### Filename Convention

Topic name → slugified: `"Sicilian Defense"` → `sicilian-defense.jsonl`

#### Format

```jsonl
{"system":"You are a chess tutor specializing in...","user":"Is the Najdorf realistic for a 1600?","assistant":"Honest answer: yes, but with a different approach...","base_score":0.85,"eval_scores":{"eval-job-abc":0.78},"sources":["mco15:chunk-158"]}
{"system":"You are a chess tutor specializing in...","user":"What's the main idea behind the Dragon?","assistant":"The Dragon Sicilian is one of the sharpest responses...","base_score":0.72,"eval_scores":{},"sources":["mco15:chunk-162"]}
```

Note: `topic` field is omitted (redundant — it's the filename).
Note: Both score types included — `base_score` (LLM self-assessment) and `eval_scores` (per-job external grader scores). Preserves optionality for downstream use.
Note: `eval_scores` is `{}` when no evaluation has been run. When multiple evaluations exist, all are included: `{"job-1": 0.78, "job-2": 0.82}`.

#### Field Specification

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `system` | `string` | `record.data.input.messages[0].content` (role=system) | System prompt for this topic |
| `user` | `string` | `record.data.input.messages[1].content` (role=user) | The user's question |
| `assistant` | `string` | `record.metadata.skillResponse` | The ideal response |
| `base_score` | `number` | `record.metadata.baseScore` | LLM self-assessed quality (0.0-1.0). Always present after primary generation; defaults to 0 if unavailable. |
| `eval_scores` | `Record<string, number>` | `record.evaluations` → `{ [jobId]: score }` | Per-job external grader scores. Empty `{}` if no evaluation run. |
| `sources` | `string[]` | `record.metadata.sourceChunkRefs` | Knowledge chunk references |

#### Why Both Scores in JSONL

Scores are data, not instructions. Including them preserves optionality — the consumer (Claude, a future system, or the user) can decide how to use them:

- **Positive demonstrations**: High-scored examples serve as patterns to follow.
- **Negative demonstrations**: Low-scored examples can be explicitly labeled as counter-examples in multi-shot prompting ("this is a weak response, avoid this pattern").
- **Downstream filtering**: Users or systems can decide their own score thresholds later.
- **No auto-filtering anywhere**: Whatever records exist in IndexedDB go into the package. Scores are informational.

Records are sorted by baseScore descending within each file (best first), so Claude naturally sees the strongest examples first.

---

### How Claude Uses the Skill at Runtime

Here's the exact sequence when a user asks a question that matches the skill:

```
1. User types: "What should I play against the London System as Black?"

2. Claude sees skill description in context (always loaded):
   → "chess-opening-tutor: Expert chess opening tutor for club-level players"
   → Matches! Auto-invokes via the Skill tool.

3. Full SKILL.md content loads into conversation context:
   → Claude now has: role definition, expertise areas, response guidelines (inlined),
     topic map table (inlined), representative examples, and Read instructions
   → SKILL.md is ~150-250 lines — rich but under the 500-line limit
   → Zero Read calls needed so far — Claude already knows how to behave

4. Claude reads the inlined topic map table (already in context):
   → Finds: "Closed > London System → examples/london-system.jsonl"
   → No separate Read call needed — the index is right there in SKILL.md

5. Claude reads examples/london-system.jsonl (1 Read call):
   → Gets 30 London-specific examples (not 500 across all topics)
   → Studies tone, format, and domain accuracy per SKILL.md instructions

6. (Optional) Claude reads knowledge/domain-knowledge.md (1 Read call):
   → Only if it needs deeper reference material beyond the examples

7. Claude constructs response:
   → Follows inlined response guidelines (already in context)
   → Uses persona from the Role section ("expert chess opening tutor for 1200-1800")
   → Follows patterns from loaded examples for behavioral calibration
   → Cites knowledge sources if available

8. User gets an expert-quality response — as if talking to the finetuned model.
```

**Key insight**: Inlining rules + index table means Claude needs only **1 Read call** for most questions (just the relevant JSONL file). The directive "ALWAYS load relevant examples before responding" ensures Claude actually reads examples instead of guessing.

### Design Decisions (with rationale from official docs)

| Decision | Why |
|----------|-----|
| **SKILL.md < 500 lines** | Official recommendation: "Keep SKILL.md under 500 lines. Move detailed reference material to separate files." |
| **Inline rules + index table** | Small content (~40-60 lines combined). Claude has behavioral rules and topic map immediately — zero Read calls needed to know how to behave and where to find examples. |
| **Explicit Read instructions** | SKILL.md tells Claude exactly when to use Read tool: "load `examples/{topic}.jsonl`". More reliable than passive markdown links. |
| **"ALWAYS load examples before responding"** | Strong directive prevents Claude from guessing. Forces it to check examples first, producing more accurate domain-specific responses. |
| **Top 3-5 examples embedded in SKILL.md** | Gives Claude immediate behavioral calibration without any Read calls. Covers the most common topics. |
| **Per-topic JSONL files** | Claude reads only the relevant topic file. Efficient context usage. Human-editable. |
| **knowledge/ as Read-on-demand** | Extracted document content can be long. Loaded only when Claude needs deeper reference beyond examples. |
| **No `context: fork`** | We want the skill inline in conversation so Claude uses it alongside the user's project context. |
| **No `disable-model-invocation`** | Auto-invoke is the core UX — user asks a domain question, Claude automatically becomes the specialist. |
| **`description` = dataset objective** | The objective is already a natural-language description of what the model should do. Perfect for skill matching. |

---

## Concrete Example: Chess Opening Tutor

### Input

```
Objective: "Build an expert chess opening tutor for club-level players (1200-1800 ELO)"
Uploaded docs: "Modern Chess Openings 15th Edition.pdf", "Understanding Chess Openings.pdf"
Topics: 12 topics across 3 categories (Open Games, Semi-Open, Closed)
Records: 380 generated examples (each with baseScore from LLM self-assessment)
Dry run: Completed, mean evaluation score 0.78, verdict GO
```

### Output: chess-opening-tutor.zip

Extracted folder structure:

```
chess-opening-tutor/
├── SKILL.md
├── knowledge/
│   └── domain-knowledge.md
├── examples/
│   ├── index.md
│   ├── italian-game.jsonl          (42 examples)
│   ├── ruy-lopez.jsonl             (38 examples)
│   ├── scotch-game.jsonl           (22 examples)
│   ├── sicilian-defense.jsonl      (55 examples)
│   ├── french-defense.jsonl        (35 examples)
│   ├── caro-kann.jsonl             (28 examples)
│   ├── queens-gambit.jsonl         (31 examples)
│   ├── kings-indian-defense.jsonl  (26 examples)
│   ├── london-system.jsonl         (30 examples)
│   ├── center-control.jsonl        (28 examples)
│   ├── development.jsonl           (24 examples)
│   └── king-safety.jsonl           (21 examples)
└── rules/
    └── response-guidelines.md
```

#### SKILL.md (full — ~180 lines, well under 500)

```markdown
---
name: chess-opening-tutor
description: Expert chess opening tutor for club-level players (1200-1800 ELO)
argument-hint: "<your chess opening question>"
---

# Chess Opening Tutor

## Role & Objective

You are an expert chess opening tutor for club-level players (1200-1800 ELO).
You have deep knowledge across 12 topics, backed by 380 curated examples
and 2 reference documents.

### Expertise Areas

- Open Games (1.e4 e5)
  - Italian Game (Giuoco Piano, Evans Gambit)
  - Ruy Lopez (Main Line, Exchange Variation)
  - Scotch Game
- Semi-Open Games (1.e4, other)
  - Sicilian Defense (Najdorf, Dragon, Alapin)
  - French Defense (Classical, Winawer)
  - Caro-Kann
- Closed Games (1.d4)
  - Queen's Gambit (Accepted, Declined)
  - King's Indian Defense
  - London System
- General Principles
  - Center Control
  - Development
  - King Safety

## Response Guidelines

Provide practical chess opening guidance tailored to club-level players (1200-1800 ELO).
Focus on understanding over memorization.

### Quality Criteria

- Explain strategic ideas before listing specific moves
- Keep move sequences to 5-8 moves unless the user asks for more
- Always highlight common mistakes at the 1200-1800 level
- Cite sources when referencing specific material: [Source: Document Name, pp. X-Y]
- If asked about something outside your knowledge, say so explicitly

### Tone and Style

- Conversational but precise — like a friendly club coach
- Use concrete examples over abstract principles
- Acknowledge when multiple valid approaches exist

## Available Examples

380 examples across 12 topics.
Each example includes base_score (LLM self-assessment) and eval_scores (external grader, per-job).

| Topic | File | Examples | Avg Score | Diversity |
|-------|------|----------|-----------|-----------|
| Open Games > Italian Game | [italian-game.jsonl](italian-game.jsonl) | 42 | 0.82 | 0.88 |
| Open Games > Ruy Lopez | [ruy-lopez.jsonl](ruy-lopez.jsonl) | 38 | 0.79 | 0.85 |
| Open Games > Scotch Game | [scotch-game.jsonl](scotch-game.jsonl) | 22 | 0.76 | 0.92 |
| Semi-Open > Sicilian Defense | [sicilian-defense.jsonl](sicilian-defense.jsonl) | 55 | 0.84 | 0.72 |
| Semi-Open > French Defense | [french-defense.jsonl](french-defense.jsonl) | 35 | 0.80 | 0.81 |
| Semi-Open > Caro-Kann | [caro-kann.jsonl](caro-kann.jsonl) | 28 | 0.77 | 0.86 |
| Closed > Queen's Gambit | [queens-gambit.jsonl](queens-gambit.jsonl) | 31 | 0.78 | 0.91 |
| Closed > King's Indian Defense | [kings-indian-defense.jsonl](kings-indian-defense.jsonl) | 26 | 0.75 | 0.83 |
| Closed > London System | [london-system.jsonl](london-system.jsonl) | 30 | 0.81 | 0.87 |
| General > Center Control | [center-control.jsonl](center-control.jsonl) | 28 | 0.81 | 0.79 |
| General > Development | [development.jsonl](development.jsonl) | 24 | 0.79 | 0.84 |
| General > King Safety | [king-safety.jsonl](king-safety.jsonl) | 21 | 0.77 | 0.90 |

## How to Use Examples (IMPORTANT)

Before answering any question:
1. Read the topic map above to identify which topic file(s) match the user's question
2. Use your Read tool to load `examples/{topic}.jsonl` for the matching topic(s)
3. Study the examples for tone, format, and domain accuracy
4. Answer the user's question following those patterns

You have access to 380 examples across 12 topics.
ALWAYS load relevant examples before responding.
DO NOT guess — check the examples first.

## Domain Knowledge

For deep reference material, use your Read tool to load:
  `knowledge/domain-knowledge.md`

Only load this when you need additional context beyond what the examples provide.

## Representative Examples

These are the highest-scored examples across major topic areas. Use them as
immediate reference — for more examples on any topic, load the relevant JSONL file.

### Italian Game (Score: 0.91)
**User**: I keep losing in the Italian Game as Black after White plays d4.
**Assistant**: This is one of the most common problems for club players.
After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.d4, many players panic and make
positional concessions. The key is to play 4...exd4 5.Nxd4 and then
focus on rapid development with ...Nf6 and ...d6. The critical idea is
that Black gets a slightly different pawn structure but maintains active
piece play. [Source: MCO 15th Ed, pp. 42-45]

### Sicilian Defense (Score: 0.85)
**User**: Is the Najdorf realistic for a 1600?
**Assistant**: Honest answer: yes, but with a different approach than a
grandmaster would take. At 1600, focus on the key ideas rather than
memorizing 20 moves of theory...

### Center Control (Score: 0.88)
**User**: Why does everyone say "control the center"?
**Assistant**: Great question. The center = four squares: e4, d4, e5, d5.
Controlling them gives your pieces maximum mobility...
```

Note: In the real output, `examples/index.md` and `rules/response-guidelines.md` still exist as separate files (for the ZIP download and human readability). But their content is **also inlined** into SKILL.md so Claude has it immediately.

#### examples/sicilian-defense.jsonl (first 2 lines)

```jsonl
{"system":"You are an expert chess opening tutor specializing in the Sicilian Defense...","user":"Is the Najdorf realistic for a 1600?","assistant":"Honest answer: yes, but with a different approach...","base_score":0.85,"eval_scores":{"eval-job-abc":0.78},"sources":["mco15:chunk-158"]}
{"system":"You are an expert chess opening tutor specializing in the Sicilian Defense...","user":"What's the main idea behind the Dragon?","assistant":"The Dragon Sicilian is one of the sharpest responses to 1.e4...","base_score":0.79,"eval_scores":{"eval-job-abc":0.81},"sources":["mco15:chunk-162"]}
```

#### rules/response-guidelines.md

```markdown
# Response Guidelines

## Core Principles

Provide practical chess opening guidance tailored to club-level players (1200-1800 ELO).
Focus on understanding over memorization.

## Quality Criteria

- Explain strategic ideas before listing specific moves
- Keep move sequences to 5-8 moves unless the user asks for more
- Always highlight common mistakes at the 1200-1800 level
- Cite sources when referencing specific material: [Source: Document Name, pp. X-Y]
- If asked about something outside your knowledge, say so explicitly

## Tone and Style

- Conversational but precise — like a friendly club coach
- Use concrete examples over abstract principles
- Acknowledge when multiple valid approaches exist
```

#### knowledge/domain-knowledge.md (abbreviated)

```markdown
# Domain Knowledge

## Modern Chess Openings (15th Edition)
Reference covering all major openings with move-by-move analysis,
typical plans for both sides, and common mistakes at club level.
320 pages, 247 extracted sections.

### Key Concepts
- Pawn structure classification (open, semi-open, closed)
- Typical piece placement per opening family
- Transition from opening to middlegame plans

### Reference Sections
- Part I: Open Games (pp. 1-120)
- Part II: Semi-Open Games (pp. 121-240)
- Part III: Closed Games (pp. 241-320)

---

## Understanding Chess Openings
Simplified guide focusing on ideas behind openings rather than
memorized variations. Ideal for 1200-1800 players.
85 pages, 52 extracted sections.

### Key Concepts
- "Why" before "what" — understanding plans over memorizing moves
- Common tactical motifs in each opening
- When to deviate from theory
```

### How the User Uses It

```bash
# 1. Download the zip from vLLora UI
# 2. Extract to Claude Code skills folder:
unzip chess-opening-tutor.zip -d ~/.claude/skills/

# 3. Use with Claude Code:
claude "What should I play against the London System as Black?"

# What happens:
# → Claude sees "chess-opening-tutor" description → auto-invokes
# → Loads SKILL.md (~180 lines) → immediately has:
#     - role definition + expertise areas
#     - response guidelines (inlined)
#     - topic map table (inlined) → finds "london-system.jsonl"
#     - top representative examples
# → Reads examples/london-system.jsonl → gets 30 London-specific examples
# → Responds as expert tutor following inlined guidelines + example patterns
# → Only 1 Read call needed (just the JSONL file)
```

---

## Relationship to lucy-skills-approach

The `docs/features/lucy-skills-approach/` folder contains the broader vision for a full skills platform (API endpoints, runtime engine, multi-platform export, knowledge indexing with embeddings, reasoning templates).

**This implementation (skill-package) is the pragmatic first step**:

| lucy-skills-approach (full vision) | skill-package (this implementation) |
|---|---|
| API endpoints, hosted runtime | Local Claude Code skill folder |
| Embedding-based retrieval | Claude's native context handling |
| Multi-platform export (Claude, GPT, LangChain) | Claude Code only (for now) |
| Reasoning templates, test suites | Examples + response guidelines |
| Complex manifest.json, multiple directories | SKILL.md + examples/ + knowledge/ + rules/ |
| Requires backend changes | Zero backend changes (all client-side) |

This implementation proves the concept with minimal engineering. If it works well, the broader vision can be built on top.

---

## Document Index

| Document | What it covers |
|----------|---------------|
| [README.md](./README.md) | This file — goal, purpose, expected output |
| [implementation-plan.md](./implementation-plan.md) | Exact file changes, code diffs, implementation order |
| [data-flow.md](./data-flow.md) | End-to-end data flow from generation through packaging |

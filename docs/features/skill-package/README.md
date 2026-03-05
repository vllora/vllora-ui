# Skill Package Feature

## Status: Implemented

---

## Goal

Turn every finetune dataset into a **downloadable Claude Code skill package** that users can test immediately, without waiting hours for a fine-tuned model to finish training.

The user uploads documents, defines an objective, generates training data with Lucy, and gets a `.zip` they can drop into `.claude/skills/` on their machine. Their Claude Code client instantly becomes a domain expert.

---

## Why This Exists

### The Problem

Fine-tuning takes hours. After a user spends 10-15 minutes generating data, they click "Start Training" and then wait 2-6 hours. They have no way to test whether their dataset produces useful behavior until the job completes.

### The Insight

By the time a user reaches the training step, they already have everything needed to make Claude behave as a specialist:

- **Dataset objective** (what the model should do)
- **Topic hierarchy** (what domains it covers)
- **Knowledge source content** (extracted from uploaded PDFs/docs)
- **Generated examples** (user + assistant conversations, scored by graders)
- **Grader criteria** (what "good" looks like)

A foundation model like Claude, given this context as a skill, can perform as well or better than a fine-tuned small model. The user gets instant results while fine-tuning runs in the background.

### Value

| Without Skill Package | With Skill Package |
|---|---|
| User waits 2-6 hours for training | User downloads skill in seconds |
| Tests only after training completes | Tests immediately after data generation |
| If model is bad, wasted hours | If skill needs tuning, iterate in minutes |
| Locked to one inference provider | Works with any Claude Code client |
| Requires deployment infrastructure | Just a folder on disk |

---

## What the User Gets

A `.zip` file containing a ready-to-use Claude Code skill. Follows the [official Claude Custom Skills format](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills).

### Package Structure

```
{skill-slug}/
├── SKILL.md                              ← Directive orchestrator (YAML + markdown)
├── resources/
│   ├── index.md                          ← Topic map table
│   └── {category}/{topic-slug}.jsonl     ← Per-topic examples (one file per leaf topic)
└── knowledge/
    └── domain-knowledge.md               ← Extracted content from uploaded docs (optional)
```

### SKILL.md

The main skill definition file. Two parts: **YAML frontmatter** and **markdown body**.

#### YAML Frontmatter

```yaml
---
name: chess-tactics-tutor
description: >
  TRIGGER: When users ask about Chess Tactics Tutor topics including
  Learning Chess Tactics And Combinations, Tactical Patterns And Themes, and more.
  DO NOT TRIGGER: For general questions unrelated to Chess Tactics Tutor.
  Teach chess tactics and combinations using positions from reference materials.
---
```

| Field | Source | Notes |
|-------|--------|-------|
| `name` | Dataset objective → slugified | Lowercase, hyphens, max 64 chars |
| `description` | TRIGGER/DO NOT TRIGGER + capability | Claude uses this to decide when to auto-invoke |

The `description` field uses the TRIGGER/DO NOT TRIGGER pattern from official Anthropic skills. This helps Claude decide when to activate the skill vs. ignore it. Topic names are extracted from the hierarchy (first 5 shown).

**Intentionally omitted** from frontmatter (using defaults):
- `argument-hint` — not in official spec
- `disable-model-invocation` (default: false) — we want auto-invoke
- `user-invocable` (default: true) — user can `/skill-name` manually
- `allowed-tools` — Claude needs full Read access for resource files
- `context` — skill runs inline, not as forked subagent

#### Markdown Body

| Section | Content | Notes |
|---------|---------|-------|
| **Role & Objective** | "You are a {name}. {capability}." + topic/example/source counts | Sets Claude's identity |
| **Expertise Areas** | Nested markdown list from `topicHierarchy` | Shows full topic tree |
| **Package Structure** | Dynamic tree diagram of all bundled files | Orientation for Claude |
| **Response Guidelines** | Grader criteria → behavioral rules (or generic fallback) | Inlined, not separate file |
| **Using Resources** | 3-step instructions + JSONL format table | Tells Claude how to find and use data |
| **Domain Knowledge** | Read instruction for `knowledge/domain-knowledge.md` | Only present when knowledge sources exist |

**Design decisions:**
- Under 100 lines (well below 500 official recommendation)
- No `rules/` directory — response guidelines are inlined in SKILL.md body
- No representative examples embedded — keeps SKILL.md lean
- JSONL format table tells Claude exactly which fields to use

### JSONL Format (resources/*.jsonl)

Each line is a JSON object. **No `system` field** — SKILL.md already provides role context.

```json
{"user": "What is a pin in chess?", "assistant": "A pin is a tactic where...", "eval_scores": {"job-abc": 0.93}, "sources": ["src1:chunk-3"]}
```

| Field | Type | Purpose |
|-------|------|---------|
| `user` | `string` | Example question — used to match incoming queries |
| `assistant` | `string` | **Primary** — reference answer with expected tone, format, knowledge |
| `eval_scores` | `Record<string, number>` | Grader scores (0–1) keyed by evaluation job ID. Empty `{}` if no eval run. |
| `sources` | `string[]` | Knowledge chunk references for traceability. Empty `[]` if no sources. |

**Why no `system` field:** The system prompt was identical across all examples in a topic (repeated 25x per file). SKILL.md already contains the role context. Removing it reduced ZIP size by ~40%.

**Why no `base_score` field:** The LLM self-assessed score from generation was less reliable than external grader scores (`eval_scores`). Removed to keep the format clean.

### Resources Index (resources/index.md)

Human-readable topic map. Claude reads this first to find the right JSONL file.

```markdown
# Resources Index

150 examples across 6 topics.
Each example includes eval_scores (external grader scores, per evaluation job).

## Topic Map

| Topic | File | Examples | Diversity |
|-------|------|----------|-----------|
| Tactical Patterns / Pins | [pins.jsonl](tactical-patterns/pins.jsonl) | 25 | 0.82 |
| Tactical Patterns / Forks | [forks.jsonl](tactical-patterns/forks.jsonl) | 25 | 0.88 |
```

The Diversity column appears when topics have diversity scores from the LLM diversity audit.

### Knowledge Doc (knowledge/domain-knowledge.md)

Extracted content from uploaded knowledge sources (PDFs, docs). Optional — omitted when no knowledge sources exist.

**Two extraction paths:**
- **Modern (local-semantic):** Uses `metadata.chunks` — semantic sections with full sentences, page ranges, headings
- **Legacy (LLM extraction):** Uses `extractedContent.sections` — older format with truncated content

The modern path produces significantly better output (tested: 8/10 readability vs 2/10 for legacy).

---

## How Claude Code Uses the Skill

```
1. User types: "What should I play against a pin?"

2. Claude sees skill description (always in context — just the YAML description field):
   → "TRIGGER: When users ask about Chess Tactics Tutor topics..."
   → Matches! Auto-invokes via the Skill tool.

3. Full SKILL.md loads into context (~80 lines):
   → Role, expertise areas, response guidelines, resource instructions
   → Claude immediately knows how to behave — zero Read calls yet

4. Claude reads resources/index.md (1 Read call):
   → Finds: "Tactical Patterns / Pins → tactical-patterns/pins.jsonl"

5. Claude reads resources/tactical-patterns/pins.jsonl (1 Read call):
   → Gets 25 pin-specific examples
   → Studies assistant field for tone, format, domain knowledge

6. (Optional) Claude reads knowledge/domain-knowledge.md (1 Read call):
   → Only if deeper reference material needed beyond examples

7. Claude responds using example patterns + domain knowledge
```

**Total Read calls:** 2–3 (index + JSONL + optional knowledge doc). Efficient context usage.

---

## How It Fits in the Pipeline

Skill packaging happens **after data generation** and runs in parallel with evaluation/training.

```
coverage_generation → skill_packaging → download (instant)
                    → grader_config → dry_run → training (hours)
```

**Key principle: what you see is what you get.** Whatever records exist in IndexedDB go into the skill package. No automatic filtering by scores, diversity flags, or evaluation results.

---

## Installation

```bash
# Download ZIP from vLLora UI
# Extract to personal skills (all projects):
unzip chess-tactics-tutor.zip -d ~/.claude/skills/

# OR extract to project skills (this project only):
unzip chess-tactics-tutor.zip -d .claude/skills/
```

Claude Code auto-discovers skills in `~/.claude/skills/` and `.claude/skills/`.

---

## Document Index

| Document | What it covers |
|----------|---------------|
| [README.md](./README.md) | This file — overview, output format, how it works |
| [architecture.md](./architecture.md) | Source map, key functions, types, debugging guide |
| [data-flow.md](./data-flow.md) | End-to-end data flow from IndexedDB through packaging |

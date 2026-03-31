# How Topic Generation Works — Deep Dive

The topic step (Step 3) structures the training data into a hierarchy, then links topics to source document parts. This document explains what happens, how the relation-builder subagent works, what the research says about optimal topic design, and what data flows into the next steps.

## Why Topics Exist

Without topics, training data is a flat list of prompts with no structure. Topics solve three problems:

1. **Balanced coverage** — ensure every area of the domain gets enough training examples, not just the easy/obvious ones
2. **Grounded generation** — link each topic to specific document parts so training prompts are derived from real source material
3. **Quality analysis** — after evaluation, see which topics score well vs. poorly and target improvements

## Research-Backed Topic Design Principles

> **Research-first rule**: Every design decision below cites specific papers. See [Research Sources](#research-sources) at the bottom for the full reference list.

### Principle 1: Breadth Over Depth

**More unique topics outperform fewer topics with more examples each.**

The synthetic data diversity study (arXiv:2410.15226) tested 100K vs 300K topics with 10/20/30 examples per topic. 300K topics consistently outperformed 100K in both pre-training and SFT evaluations. Performance "first increases and then saturates or deteriorates" as examples per topic increase — **~20 examples per topic** is the sweet spot before redundancy hurts.

**Implication**: When in doubt, split a broad topic into narrower ones rather than adding more examples to an existing topic.

### Principle 2: Organize by Skill, Not by Document Structure

**Topics should reflect what the model needs to learn (skills/capabilities), not how the source documents are organized.**

The STEPS taxonomy paper (arXiv:2601.03676) showed that skill-based hierarchies (leaf = atomic skill, internal = skill group) outperformed flat organization — taxonomy-guided synthesis scored 33.09 vs 31.48 for standard SFT. DeepSeek-R1 (arXiv:2501.12948) organized by broad capability domains (math, coding, science, logic), not by textbook chapters.

**What this means for our pipeline**: A chess book with "Chapter 3: Tactical Motifs" should NOT become a topic called "Tactical Motifs" with subtopics mirroring sections 3.1-3.4. Instead, analyze what *skills* the chapter teaches:

| Document structure (DON'T mirror) | Skill-based topics (DO this) |
|-----------------------------------|------------------------------|
| Chapter 3: Tactical Motifs | Pattern Recognition → Fork Detection |
| Section 3.1: Forks | Pattern Recognition → Pin/Skewer Identification |
| Section 3.2: Pins | Calculation → Forcing Move Sequences |
| Section 3.3: Discovered Attacks | Evaluation → Material vs Positional Trade-offs |
| Chapter 5: Endgames | Technique → King & Pawn Endgame Conversion |

A single chapter may feed into multiple skill-based topics. A single skill-based topic may draw from multiple chapters.

### Principle 3: Incorporate Difficulty as a Dimension

**GRPO requires outcome variance — the model must get some right and some wrong for learning to happen.**

The "Hard Examples" paper (arXiv:2508.14094) found that training on the hardest 10% of examples yields **47% gains** vs 3-15% for easy examples. "No Prompt Left Behind" (arXiv:2509.21880) showed that **30-99% of prompts become zero-variance** (all rollouts same reward → zero gradient) during GRPO training — easy prompts go zero-variance first.

**Implication**: Each leaf topic should target a specific difficulty tier. Don't mix easy and hard examples in the same topic — this makes it impossible to control the difficulty distribution during training.

### Principle 4: Don't Distribute Evenly — Weight Toward Hard

**Uniform distribution across topics wastes compute on easy topics that quickly become zero-variance.**

Multiple papers converge on this:
- F-GRPO (arXiv:2602.06717): Down-weights high-success prompts, recovers diverse coverage with 4x fewer rollouts
- GRPO-LEAD (arXiv:2504.09696): Scales advantages by difficulty, prioritizing harder questions
- AceGRPO (arXiv:2602.07906): Allocates effort to the "learning frontier" — prompts with high reward variance AND remaining headroom
- Reinforce-Ada (arXiv:2510.04996): Dynamically allocates more budget to uncertain/difficult prompts, 2x convergence speedup
- DAPO (arXiv:2503.14476): Filters out all 0% and 100% accuracy prompts entirely

**Target distribution** (by base model success rate):

| Difficulty Tier | Base Model Success Rate | Record Share | Why |
|----------------|------------------------|-------------|-----|
| Hard | 0-30% | 40-50% | Maximum learning signal, highest gains (arXiv:2508.14094) |
| Medium | 30-70% | 30-40% | Good variance, stable gradient |
| Easy | 70-100% | 10-20% | Quickly becomes zero-variance, diminishing returns |

This distribution should be measured *after* running the base model evaluation (eval-first approach), not guessed beforehand.

---

## Recommended Topic Hierarchy Design

### Three-Level Structure: Domain → Skill → Difficulty

Based on the research, a well-designed hierarchy has three conceptual levels:

```
Level 1: Content Domain (broad area of knowledge)
  Level 2: Skill/Capability (what the model learns to do)
    Level 3: Difficulty Tier (how hard it is for the base model)
```

**Example for a Chess Tutor fine-tune:**

```
Chess Tactics (domain)
├── Fork Detection (skill)
│   ├── fork-detection-basic        → puzzles where fork is obvious (1-2 candidate moves)
│   └── fork-detection-complex      → puzzles requiring 2-3 move calculation to find fork
├── Pin Recognition (skill)
│   ├── pin-recognition-absolute    → absolute pins against the king (clear pattern)
│   └── pin-recognition-relative    → relative pins requiring material evaluation
└── Combination Calculation (skill)
    ├── combination-2-move          → 2-move forced sequences
    └── combination-3-plus-move     → 3+ move sequences with branching

Chess Strategy (domain)
├── Pawn Structure Evaluation (skill)
│   ├── pawn-structure-static       → evaluate given position (no calculation needed)
│   └── pawn-structure-dynamic      → evaluate after a pawn break sequence
├── Piece Placement (skill)
│   ├── piece-placement-middlegame  → standard middlegame piece coordination
│   └── piece-placement-endgame     → endgame-specific piece activity
└── Plan Formation (skill)
    ├── plan-single-idea            → positions with one clear plan
    └── plan-competing-ideas        → positions requiring plan comparison

Chess Endgames (domain)
├── King & Pawn Technique (skill)
│   ├── kp-basic-opposition         → simple opposition and key squares
│   └── kp-complex-breakthrough     → pawn breakthroughs and triangulation
└── Rook Endgame Technique (skill)
    ├── rook-endgame-lucena         → Lucena/Philidor positions (pattern recognition)
    └── rook-endgame-complex        → rook + multiple pawns (calculation required)
```

### Topic Count Guidelines

Derived from research (arXiv:2410.15226 for breadth, arXiv:2508.14094 for per-topic minimum):

| Total Records | Leaf Topics | Records/Topic | Root Domains |
|--------------|-------------|---------------|--------------|
| 100-200 | 5-10 | 15-25 | 2-4 |
| 200-500 | 10-20 | 15-30 | 3-5 |
| 500-1,000 | 20-40 | 20-30 | 4-7 |
| 1,000-3,000 | 40-80 | 25-40 | 5-10 |
| 3,000-10,000 | 80-200 | 30-50 | 7-15 |

**Key constraints**:
- **Minimum 15 records per leaf topic** — below this, zero-variance collapse happens too early in training (arXiv:2509.21880)
- **Sweet spot ~20 records per topic** — diminishing returns beyond this for a given topic (arXiv:2410.15226)
- **More leaf topics is almost always better** — split before you deepen
- **Difficulty tiers double your effective topic count** — 10 skills × 2 difficulty tiers = 20 leaf topics

### What Changed from Previous Guidelines

| Previous Guideline | New Guideline | Why |
|-------------------|---------------|-----|
| 3-7 root topics | 2-15 root topics (scale with dataset) | Research shows breadth > depth (arXiv:2410.15226) |
| Mirror document structure | Organize by skill/capability | STEPS taxonomy outperforms content-based (arXiv:2601.03676) |
| 10-30 records per leaf | 15-30 records per leaf, sweet spot ~20 | Redundancy hurts beyond 20 (arXiv:2410.15226) |
| Balance score targets uniformity | Weight toward hard topics (40-50%) | Hard examples yield 47% gains vs 3-15% (arXiv:2508.14094) |
| No difficulty dimension | Explicit difficulty tiers in hierarchy | GRPO needs outcome variance; easy topics waste compute |
| Topics = content categories | Topics = skill × difficulty intersection | DeepSeek-R1, STEPS, AceGRPO all organize by capability |

---

## The Topic Flow

```
                    ┌─────────────────────────────────┐
  all-parts-        │  1. Agent analyzes source        │
  index.json  ────► │     material for SKILLS          │ ────► topics.json
  (from Step 2)     │     (not document structure)     │
                    │                                  │
  objective   ────► │  2. Designs skill-based          │
  (from Step 1)     │     hierarchy with difficulty    │
                    │     tiers at leaf level           │
                    └─────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────────┐
  all-parts-        │  relation-builder subagent       │
  index.json  ────► │  (matches parts to leaf topics   │ ────► relations.json
                    │   — a skill topic may draw from  │
  topics.json ────► │   MULTIPLE document sections)    │
                    └─────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────────────────┐
                    │  Base model evaluation           │
                    │  (measures per-topic difficulty)  │
                    │                                  │
                    │  Outputs per-topic success rates  │
                    │  → informs record distribution    │
                    └─────────────────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    ▼                   ▼
              Step 4:             Upload
              Data Generation     (incremental,
              (grounded in         after Step 3)
               linked parts,
               weighted by
               difficulty)
```

## Step 3a: Design the Hierarchy

### What the Agent Does

1. **Reads the objective** — understands what behaviors/skills the model should learn
2. **Reads `all-parts-index.json`** — scans the merged part index to see what source material is available
3. **Identifies skills** — extracts the capabilities the source material can teach (NOT the document structure)
4. **Designs topics** — creates a tree structure where:
   - Root topics = broad capability domains (scale with dataset size)
   - Mid-level topics = specific skills or competencies
   - Leaf topics = skill × difficulty intersection (each should support 15-30 records)
5. **Writes `topics.json`** — a flat array with `parent_id` references for hierarchy

### Topic Structure

```json
[
  {
    "id": "tactics",
    "name": "Tactical Pattern Recognition",
    "parent_id": null,
    "system_prompt": "Specialize in: identifying and executing tactical patterns in chess positions"
  },
  {
    "id": "fork-detection",
    "name": "Fork Detection",
    "parent_id": "tactics",
    "system_prompt": "Specialize in: recognizing fork opportunities across all piece types"
  },
  {
    "id": "fork-detection-complex",
    "name": "Complex Fork Detection",
    "parent_id": "fork-detection",
    "system_prompt": "Focus on: multi-move fork setups requiring 2-3 moves of calculation, where the fork is not immediately visible"
  }
]
```

Key fields:
- **`id`** — unique identifier, used in records (`"topic": "fork-detection-complex"`) and relations
- **`parent_id`** — links to parent topic (null for roots), creates the tree
- **`system_prompt`** — a segment in the hierarchical prompt composition chain. During record generation, this field is composed with ancestor system_prompts to form the full system message (see [System Prompt Composition](#system-prompt-composition) below)

### How Topics Map to Documents (Skill-Based, Not Structure-Based)

The agent does NOT mirror the document structure. Instead, it extracts skills:

| Step | What the agent does | Example |
|------|--------------------|---------
| 1. Read objective | Understand target behaviors | "Teach chess tactics and strategy" |
| 2. Scan source material | Identify what skills the material can teach | Forks, pins, calculation, evaluation, planning |
| 3. Group by capability domain | Create root topics from skill clusters | Tactical Patterns, Strategic Thinking, Endgame Technique |
| 4. Identify specific skills | Create mid-level topics per skill | Fork Detection, Pin Recognition, Combination Calculation |
| 5. Add difficulty dimension | Create leaf topics per difficulty tier | fork-detection-basic, fork-detection-complex |
| 6. Cross-reference sources | Each leaf topic may draw from multiple chapters/sections | "Fork Detection" draws from Ch.3, Ch.7, and the workbook |

**Example mapping** (a single source chapter feeds multiple skill topics):

```
Chapter 3: Tactical Motifs (source)
  ├──► Fork Detection (skill) — fork examples
  ├──► Pin Recognition (skill) — pin examples
  ├──► Combination Calculation (skill) — multi-move sequences
  └──► Material Evaluation (skill) — exchange sacrifice decisions

Chapter 5: Endgames (source)
  ├──► King & Pawn Technique (skill) — K+P endgame theory
  ├──► Combination Calculation (skill) — endgame combinations
  └──► Plan Formation (skill) — endgame plans
```

Note how "Combination Calculation" draws from both Chapter 3 AND Chapter 5. This is the correct behavior — skills cut across document boundaries.

### Design Guidelines

| Rule | Why | Source |
|------|-----|--------|
| Organize by skill, not chapter | Skill taxonomies outperform content-based | STEPS (arXiv:2601.03676) |
| Scale root topics with dataset (2-15) | More breadth = better coverage | arXiv:2410.15226 |
| 2-3 levels deep | Deeper = more specific but harder to balance | — |
| 15-30 records per leaf (target ~20) | Redundancy hurts beyond 20 | arXiv:2410.15226 |
| Include difficulty tiers at leaf level | GRPO needs outcome variance | arXiv:2508.14094, arXiv:2509.21880 |
| Descriptive system_prompt | Each topic's segment composes into the final training prompt | — |
| Root: "Specialize in: ..." | Root topics set the broad domain focus | — |
| Leaf: "Focus on: ..." | Leaf topics narrow to specific scenarios + difficulty | — |
| No overlapping topics | A record should clearly belong to one leaf topic | — |
| Each leaf topic draws from 1+ source sections | Skills cut across document boundaries | DeepSeek-R1 (arXiv:2501.12948) |

### System Prompt Composition

The `system_prompt` field on each topic is not used in isolation. During record generation (Step 4), `generate_records.py` walks up the topic hierarchy and **composes** a single system prompt from all levels:

```
[Root persona from --system-prompt]    "You are an expert chess tutor..."

[Root topic system_prompt]             "Specialize in: tactical pattern recognition."

[Parent topic system_prompt]           "Specialize in: recognizing fork opportunities."

[Leaf topic system_prompt]             "Focus on: multi-move fork setups requiring 2-3 moves of calculation."
```

Segments are joined with `\n\n`. For a 3-level hierarchy this produces 4 segments (root persona + 3 topic levels). Target: **50-150 words total**.

**Writing guidelines for system_prompt fields:**

| Level | Convention | Example |
|-------|-----------|---------|
| Root topic | `"Specialize in: ..."` | `"Specialize in: tactical pattern recognition in chess positions."` |
| Mid-level (skill) | `"Specialize in: ..."` | `"Specialize in: recognizing fork opportunities across all piece types."` |
| Leaf topic (skill + difficulty) | `"Focus on: ..."` | `"Focus on: multi-move fork setups requiring 2-3 moves of calculation, where the fork is not immediately visible."` |

Each level adds specificity without contradicting its parent. If a topic has no `system_prompt`, the script falls back to its `name` field (e.g., `"Specialize in: Fork Detection"`).

For research and design guidelines, see [prompt-composition-research.md](prompt-composition-research.md).

---

## Record Distribution Strategy

### Why Uniform Distribution Is Wrong

Standard GRPO wastes 30-99% of training compute on zero-variance prompts (arXiv:2509.21880). Easy topics go zero-variance first, meaning uniform distribution increasingly wastes budget as training progresses.

### Difficulty-Weighted Distribution

After the base model evaluation (eval-first approach), measure per-topic success rates and allocate records accordingly:

```
                         Records allocated
                         ┌───────────────────────────────────┐
  Hard topics            │████████████████████████            │ 40-50%
  (0-30% base success)   │                                   │
                         ├───────────────────────────────────┤
  Medium topics          │████████████████                   │ 30-40%
  (30-70% base success)  │                                   │
                         ├───────────────────────────────────┤
  Easy topics            │████████                           │ 10-20%
  (70-100% base success) │                                   │
                         └───────────────────────────────────┘
```

### Balance Score (Revised)

The old balance score targeted uniform distribution. The new approach:

1. **Coverage score** (0-1): What fraction of leaf topics have ≥15 records? Target: 1.0 (full coverage).
2. **Difficulty alignment score** (0-1): How close is the actual distribution to the target difficulty weighting? Measured after base model eval.
3. **Overall readiness** = min(coverage_score, difficulty_alignment_score)

| Score | Rating | Action |
|-------|--------|--------|
| 0.8-1.0 | Ready | Proceed to training |
| 0.6-0.8 | Almost ready | Generate more records for under-covered topics |
| < 0.6 | Not ready | Significant gaps — review topic design |

---

## Step 3b: Build Relations (Subagent)

### Why a Subagent?

Matching parts to topics requires scanning `all-parts-index.json` (potentially 30-100+ parts) against each leaf topic. This is a context-heavy operation. The **relation-builder subagent** handles it in an isolated context to keep the main agent's context window clean.

### What the Subagent Does

1. **Reads `all-parts-index.json`** — the lightweight part index with titles, extraction paths, content previews, and source document names
2. **Reads `topics.json`** — the skill-based topic hierarchy designed by the main agent
3. **For each leaf topic**, runs a retrieve-and-verify loop:
   - **Search**: Find parts whose content teaches the skill described by the topic (NOT just keyword matching)
   - **Verify**: Confirm each candidate actually teaches the skill, not just mentions it
   - **Cross-reference**: A skill topic should draw from multiple source sections — don't limit to one chapter
   - **Broaden**: If fewer than 3 relations found, try related skills, parent topic context, or adjacent concepts
4. **Writes `relations.json`** — flat array of topic-to-part mappings

### Relations Structure

```json
[
  {"topic_identifier": "fork-detection-complex", "part_identifier": "chess-tactics-chapter-3-forks"},
  {"topic_identifier": "fork-detection-complex", "part_identifier": "workbook-section-advanced-tactics"},
  {"topic_identifier": "fork-detection-complex", "part_identifier": "game-collection-tactical-themes"},
  {"topic_identifier": "pin-recognition-absolute", "part_identifier": "chess-tactics-chapter-3-pins"},
  {"topic_identifier": "pin-recognition-absolute", "part_identifier": "endgame-book-chapter-2-pin-technique"}
]
```

- **`topic_identifier`** — matches a topic's `id` or `reference_id`
- **`part_identifier`** — matches a knowledge part's `id` or `reference_id`

### Multi-Document Relations

Relations can and SHOULD link a topic to parts from **different documents**. Since topics are skill-based, a single skill may be taught across multiple source documents:

- `fork-detection-complex` links to parts from the tactics textbook, the workbook, AND the game collection
- This is expected — skills cut across document boundaries

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
print(f'Target: {len(leaves)} leaf topics × ~20 records = ~{len(leaves)*20} records')
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
    marker = '⚠️' if count < 3 else '✓'
    print(f'  {marker} {topic}: {count} parts')
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

### Topics mirror document structure instead of skills

- **Symptom**: Topics named "Chapter 3: Tactical Motifs", "Section 3.1: Forks"
- **Cause**: Agent copied document headings instead of extracting skills
- **Fix**: Instruct the agent to identify what SKILLS the source material teaches, then group by capability, not by chapter. A single chapter may feed into 3-5 different skill topics.

### No difficulty dimension in topics

- **Symptom**: All leaf topics are at the same difficulty level (e.g., "Forks" without basic/complex split)
- **Cause**: Agent didn't consider difficulty as a dimension
- **Fix**: After base model evaluation, split topics with wide score variance into difficulty tiers. If a topic scores 20% on hard prompts and 80% on easy ones, split it.

### No `relations.json` produced

- **Cause**: The relation-builder subagent wasn't delegated, or it failed
- **Check**: Look for "relation-builder" in `execution-log.md`
- **Fix**: The main agent must explicitly delegate: "Delegate to the relation-builder subagent to match parts to topics"

### Topics too broad or too narrow

- **Symptom (broad)**: Topics like "General Chess" — will generate unfocused training data
- **Symptom (narrow)**: Topics like "Knight fork on e5 in Sicilian Defense" — only 1-2 possible records
- **Fix**: Leaf topics should support 15-30 unique training examples (target ~20). If you can't write 20 distinct prompts, it's too narrow. If experts disagree on what it covers, it's too broad.

### Relations link to wrong parts

- **Symptom**: A "fork-detection" topic links to an "endgame pawn structure" part
- **Cause**: The subagent matched on a keyword that appears in both contexts
- **Check**: `python3 -c "import json; [print(x) for x in json.load(open('relations.json')) if x['topic_identifier']=='fork-detection-complex']"`

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

### Too few leaf topics

- **Symptom**: 5 leaf topics for a 500-record dataset (100 records per topic = redundancy)
- **Fix**: Refer to the [Topic Count Guidelines](#topic-count-guidelines) table. Split topics by adding the difficulty dimension or by decomposing broad skills into sub-skills.

---

## Research Sources

| Paper / Source | arXiv / URL | Key Finding for Topic Design |
|---------------|-------------|------------------------------|
| "On Diversity of Synthetic Data" | arXiv:2410.15226 | More topics > more examples per topic. ~20 examples/topic sweet spot |
| STEPS — Skill Taxonomy | arXiv:2601.03676 | Skill-based hierarchies outperform content-based organization |
| TAGS — From Tags to Trees | arXiv:2601.13995 | 10-level hierarchical tree; 5% of data outperformed full dataset training |
| DeepSeek-R1 | arXiv:2501.12948 | Organized by capability domain (math, code, science), not content structure |
| DAPO | arXiv:2503.14476 | Dynamic sampling filters zero-variance prompts; topic coverage degrades naturally |
| "Hard Examples Are All You Need" | arXiv:2508.14094 | Hardest 10% yields 47% gains; easy yields 3-15% |
| "No Prompt Left Behind" | arXiv:2509.21880 | 30-99% of prompts per batch are zero-variance in standard GRPO |
| "Tricks or Traps" | arXiv:2508.08221 | Difficulty level changes which RL techniques work best |
| F-GRPO | arXiv:2602.06717 | Down-weight high-success prompts → 4x fewer rollouts needed |
| GRPO-LEAD | arXiv:2504.09696 | Difficulty-weighted advantage scaling |
| AceGRPO | arXiv:2602.07906 | Adaptive curriculum: allocate to "learning frontier" |
| Reinforce-Ada | arXiv:2510.04996 | Dynamic budget allocation → 2x convergence speedup |
| DRA-GRPO | arXiv:2505.09655 | Diversity-aware rewards; 7K samples sufficient with diversity weighting |
| OpenAI RFT Guide | platform.openai.com | Works with ~100 examples; quality > quantity; no topic taxonomy guidance |
| ERPO | arXiv:2511.04800 | Adaptive temperature for residual prompts to reactivate learning |

## Reference

For detailed topic design guidelines (hierarchy depth, leaf count targets, balance scoring), see `finetune-skill/reference/topic-hierarchy.md`.

# Topic Hierarchy Guide

Topics organize training data into structured categories that reflect what the model needs to **learn to do** (skills), not how source documents are organized.

> **Research-first rule**: Every design decision below cites specific papers. See [Research Sources](#research-sources) at the bottom.

---

## Why Topics Matter

Without topics, training data tends to cluster around easy/common scenarios, leaving gaps in harder areas. Topics ensure:
- **Balanced skill coverage**: Every important capability gets enough training examples
- **Difficulty-aware distribution**: Hard topics (where the model struggles) get more records, because that's where GRPO learning signal is strongest (arXiv:2508.14094)
- **Targeted generation**: Generate data specifically for weak areas
- **Quality analysis**: Identify which skills score well vs. poorly in evaluation
- **Systematic improvement**: Fix specific areas without affecting others

---

## Core Design Principles

### 1. Organize by Skill, Not by Document Structure

**Topics should reflect what the model learns to DO, not how source documents are organized.**

Skill-based hierarchies outperform content-based ones (STEPS taxonomy, arXiv:2601.03676: 33.09 vs 31.48 WB-Score). DeepSeek-R1 (arXiv:2501.12948) organized training by capability domain (math, coding, science, logic), not by textbook chapters.

| DON'T (document-mirroring) | DO (skill-based) |
|---------------------------|-------------------|
| "Chapter 3: Tactical Motifs" | "Fork Detection" (skill) |
| "Section 3.1: Forks" | "Pin Recognition" (skill) |
| "Section 3.2: Pins" | "Combination Calculation" (skill) |
| "Chapter 5: Endgames" | "Pawn Structure Evaluation" (skill) |

A single chapter may feed multiple skill topics. A single skill topic may draw from multiple chapters.

### 1b. Merge Across Multiple Documents

**When users provide multiple PDFs, synthesize topics across all documents — do NOT create per-document topic branches.**

Multiple documents often cover overlapping concepts from different angles. Two IRS publications may both discuss dependent eligibility. A product manual and a troubleshooting guide may both cover the same features. These should merge into shared skill topics, not produce duplicate topic trees.

| DON'T (per-document topics) | DO (merged skill topics) |
|----------------------------|--------------------------|
| "Pub 596 — Eligibility" + "Pub 501 — Dependents" | "Dependent Eligibility Determination" (draws from both) |
| "Manual A — Installation" + "Manual B — Setup Guide" | "System Installation & Configuration" (draws from both) |
| "Contract-A — Payment Terms" + "Contract-B — Billing" | "Payment & Billing Rules" (draws from both) |

**Process**: Read ALL `parts-index.json` files across documents → identify overlapping concepts → create unified topics → link parts from multiple documents to the same topic via relations.

### 2. Breadth Over Depth

**More unique topics outperform fewer topics with more examples each.**

The synthetic data diversity study (arXiv:2410.15226) found that more granular topics reduce redundancy, but performance deteriorates above 20-30 generations per topic due to repetition. Note: this paper studied pre-training diversity, not domain-specific RFT — the 20-record number is directionally useful but not a prescriptive RFT finding. Domain-specific RFT practice validates the range: the telecom RFT paper (arXiv:2509.25736) used 10-50 records per topic across 41-50 topics successfully.

**Target 15-25 records per leaf topic.** Fewer than 10 risks insufficient coverage for the grader to discriminate variants within the skill. More than 30 introduces diminishing diversity returns.

**When in doubt, split a broad topic into narrower ones rather than adding more examples.**

### 3. Include a Difficulty Dimension (as Metadata)

**GRPO requires outcome variance — the model must get some right and some wrong for learning to happen.**

The "Hard Examples" paper (arXiv:2508.14094) found training on the hardest 10% yields **47% gains** vs 3-15% for easy examples. "No Prompt Left Behind" (arXiv:2509.21880) showed 30-99% of prompts become zero-variance (zero gradient) during GRPO — easy prompts go zero-variance first.

Encode difficulty as an `expected_difficulty` metadata field on each leaf topic — **not** as a 3rd structural level of the hierarchy. This keeps the hierarchy clean (Domain → Skill) while still enabling difficulty-weighted record generation. The initial estimate (`"easy"`, `"medium"`, `"hard"`) is refined to an actual pass-rate score after the base model difficulty probe. Prompts within each topic should naturally span a range of complexity — the difficulty label controls record count allocation and prompt distribution, not the topic structure itself.

### 4. Weight Toward Hard Topics (But Not Impossible Ones)

**Uniform distribution wastes compute on easy topics that quickly produce zero gradient. But extremely hard topics (<10% pass rate) also waste compute — the model can't generate any successful completions, so there's no positive signal for GRPO to reinforce.**

| Difficulty Tier | Base Model Pass Rate | Target Record Share | Why |
|----------------|----------------------|-------------------|-----|
| Too hard (flag) | <10% | Reduce or simplify | No GRPO signal — all completions fail, zero variance. Model likely lacks base capability. Simplify prompts or remove. (AdaRFT arXiv:2504.05520: filters ≤10% as wasteful) |
| Hard (prioritize) | 10-40% | 40-50% | Maximum learning signal — model sometimes succeeds, creating useful variance (arXiv:2508.14094: 47% gains) |
| Medium | 40-70% | 30-40% | Good variance, stable gradient, reliable convergence |
| Easy (include sparingly) | 70-90% | 10-20% | Quickly becomes zero-variance but useful for stability |
| Too easy (deprioritize) | >90% | Minimal | Near-zero variance — model already knows this, no learning signal (arXiv:2509.21880) |

**The productive GRPO band is 10-90% pass rate.** Topics outside this band contribute little to training. The optimal target is ~50% pass rate (AdaRFT arXiv:2504.05520: β=0.5 reduces training steps by 43-71%).

Measure difficulty *after* running the base model evaluation (eval-first approach), not guessed beforehand.

---

## Topic Node Structure

```json
{
  "id": "unique-path-id",
  "name": "Human-Readable Name",
  "parent_id": null,
  "system_prompt": "Focus on...",
  "expected_difficulty": "medium",
  "reference_id": "optional-external-ref"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | No | Topic identifier (auto-generated UUID if omitted) |
| `name` | Yes | Display name — should describe the **skill**, not the source section |
| `parent_id` | No | Parent topic ID (null for root topics) |
| `system_prompt` | No | System prompt segment — guides the model during training |
| `expected_difficulty` | No | Initial difficulty estimate: `"easy"`, `"medium"`, or `"hard"`. Leaf topics only. Refined to actual pass-rate after difficulty probe. Used to weight record generation. |
| `reference_id` | No | External reference ID for topic-source linking |

---

## Two-Level Hierarchy: Domain → Skill (Difficulty as Metadata)

Based on research (STEPS arXiv:2601.03676, TAGS arXiv:2601.13995), a well-designed hierarchy has two structural levels with difficulty encoded as metadata on leaf topics:

```
Level 1: Capability Domain (broad area — what the model helps with)
  Level 2: Skill (specific capability — what the model learns to do)
            └── expected_difficulty: "easy" | "medium" | "hard" (metadata, not a hierarchy level)
```

**Why not 3 levels with difficulty as the 3rd?** TAGS (arXiv:2601.13995) found that encoding difficulty as a composite weight outperforms encoding it as a structural dimension. Making difficulty a hierarchy level doubles your leaf count (every skill gets basic + complex variants), which for small datasets (100-300 records) means each leaf gets fewer than 10 records — too few for GRPO variance. Keeping difficulty as metadata preserves topic granularity while still enabling difficulty-weighted record generation.

### Example: Chess Tutor

```
Tactical Pattern Recognition (domain)
├── fork-detection          → recognizing and exploiting forks          [hard]
├── pin-recognition         → identifying absolute and relative pins     [medium]
└── combination-calculation → calculating forced multi-move sequences    [hard]

Strategic Thinking (domain)
├── pawn-structure-eval     → evaluating pawn formations and weaknesses  [medium]
└── plan-formation          → selecting and comparing strategic plans    [hard]

Endgame Technique (domain)
├── king-pawn-endgames      → opposition, key squares, breakthroughs    [medium]
└── rook-endgames           → Lucena/Philidor, rook + pawns             [hard]
```

7 leaf topics instead of 14. Each gets ~25-35 records. Difficulty `[hard]`/`[medium]` controls record weighting — hard topics get more records and harder prompt variants, not a separate sub-topic.

### Example: Customer Support

```
Billing & Payments (domain)
├── refund-processing       → handling refund requests, eligibility, policy    [medium]
├── plan-management         → upgrades, downgrades, mid-cycle migrations      [medium]
└── payment-troubleshooting → diagnosing failures, international, fraud       [hard]

Technical Support (domain)
├── api-integration         → auth setup, debugging, rate limits              [hard]
└── performance-diagnosis   → query optimization, distributed tracing         [hard]
```

5 leaf topics instead of 10. Prompts within each topic naturally span easy-to-hard — the `expected_difficulty` controls the record count allocation and prompt complexity distribution, not the topic structure.

---

## Topic Count Guidelines

Derived from research (arXiv:2410.15226 for breadth, arXiv:2508.14094 for per-topic minimum):

| Total Records | Leaf Topics | Records/Leaf | Root Domains |
|--------------|-------------|-------------|--------------|
| 100-200 | 5-10 | 15-25 | 2-4 |
| 200-500 | 10-20 | 15-30 | 3-5 |
| 500-1,000 | 20-40 | 20-30 | 4-7 |
| 1,000-3,000 | 40-80 | 25-40 | 5-10 |
| 3,000-10,000 | 80-200 | 30-50 | 7-15 |

**Key constraints**:
- **Minimum 15 records per leaf topic** — below this, zero-variance collapse happens too early (arXiv:2509.21880)
- **Sweet spot ~20 records per topic** — diminishing returns beyond this (arXiv:2410.15226)
- **More leaf topics is almost always better** — split before you deepen
- **Difficulty tiers double effective topic count** — 10 skills × 2 difficulty tiers = 20 leaf topics

---

## How to Design Topics from Source Documents

The agent should NOT copy the document structure. Instead:

### Step 1: Identify Skills

Read the objective and source material. Ask: **"What skills does this material teach? What should the model learn to DO?"**

### Step 2: Group by Capability Domain

Cluster related skills under domain roots. A domain is a broad area of competence.

### Step 3: Add Difficulty Tiers

For each skill, consider splitting into difficulty tiers based on:
- **Complexity**: Single-step vs multi-step reasoning
- **Ambiguity**: Clear-cut vs judgment-required
- **Prerequisites**: Standalone vs requires combining multiple concepts

### Step 4: Cross-Reference Sources

Map each leaf topic back to the source document parts that teach that skill. **A skill topic can (and should) draw from multiple chapters/sections.**

```
Chapter 3: Tactical Motifs (source)
  ├──► Fork Detection (skill) — fork examples
  ├──► Pin Recognition (skill) — pin examples
  ├──► Combination Calculation (skill) — multi-move sequences
  └──► Material Evaluation (skill) — exchange sacrifice decisions

Chapter 5: Endgames (source)
  ├──► King & Pawn Technique (skill) — K+P theory
  ├──► Combination Calculation (skill) — endgame combinations  ← same skill, different source
  └──► Plan Formation (skill) — endgame plans
```

---

## Linking Topics to Source Documents

Topic-source relations create a formal traceability chain: **document part → relation → topic → records**. The mapping is built in three phases across the pipeline:

### Phase 1: Extraction (Step 2)

When extracting documents, each document produces its own files in a per-document subdirectory (`knowledge/{doc-slug}/`, where `{doc-slug}` is the slugified filename):
- `{doc-slug}/knowledge_parts.json` — full typed parts with content for that document
- `{doc-slug}/parts-index.json` — lightweight index with `{id, type, title, extraction_path, pages, content_preview, source_doc}` per part

After all documents are processed, a merged `knowledge/all-parts-index.json` combines all per-document indexes. This merged index is small enough to read in full during topic design and relation building.

### Phase 2: Relation Building (Step 3)

After designing topics, the `relation-builder` subagent reads `knowledge/all-parts-index.json` and `topics.json`, then runs an iterative retrieve-and-verify loop per leaf topic:
1. Search the index for parts that **teach the skill** described by the topic (not just keyword matching)
2. Verify each candidate actually provides knowledge relevant to that skill
3. **Cross-reference**: A skill topic should draw from multiple document sections — don't limit to one chapter
4. If fewer than 3 relations found, broaden the search (synonyms, parent topic context, related skills)

The subagent writes `relations.json` — a flat array of `{topic_identifier, part_identifier}` pairs. This keeps the heavy index scanning out of the main context window.

If there are no documents (objective-only pipeline), skip this phase — no relations needed.

### Phase 3: Upload (Step 6)

After uploading topics, upload the relations via the API:

```bash
if [ -f relations.json ]; then
  RELATIONS=$(cat relations.json)
  curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
    -H "Content-Type: application/json" \
    -d "{\"relations\": $RELATIONS}"
fi
```

- `topic_identifier` — the topic's `id` or `reference_id`
- `part_identifier` — the knowledge source part's `id` or `reference_id` (alias: `source_identifier`)

### Why this matters

- When a topic scores poorly in evaluation, you know which document parts to re-read for better prompts
- When you need more variety for a topic, you know where to look for additional source material
- When the user updates a document, you know which topics and records may be affected

**Only create relations to parts you've actually extracted** — never fabricate references. If you haven't extracted the document yet, skip linking and add relations later.

For records, encode the topic in the ID (e.g., `fork-detection-basic-001`) so you can always map a record back to its topic and from there to the source parts.

---

## Guidelines

### Structure

| Guideline | Why | Source |
|-----------|-----|--------|
| Organize by skill, not by chapter | Skill taxonomies outperform content-based | arXiv:2601.03676 |
| Scale root domains with dataset (2-15) | More breadth = better coverage | arXiv:2410.15226 |
| 2-3 levels deep | Deeper = more specific but harder to balance | — |
| ~20 records per leaf (target) | Redundancy hurts beyond this | arXiv:2410.15226 |
| Include difficulty tiers at leaf level | GRPO needs outcome variance | arXiv:2508.14094 |
| Descriptive skill-based names | Helps agent generate relevant data | — |
| Add descriptions with scope | Guides data generation | — |

### ID Format

Use slash-separated paths matching the hierarchy:
```
domain-topic
domain-topic/skill-topic
domain-topic/skill-topic/difficulty-tier
```

Keep IDs lowercase, use hyphens for spaces:
- Good: `"tactics/fork-detection/fork-detection-complex"`
- Bad: `"Chapter 3/Section 3.1/Forks"`

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Topics mirror document chapters | Model learns document structure, not skills | Analyze skills in the material instead |
| No difficulty dimension | Can't control GRPO difficulty distribution | Split leaf topics by difficulty tier |
| Uniform record distribution | Wastes compute on easy topics (go zero-variance fast) | Weight 40-50% toward hard topics |
| Topics too broad ("General") | Catch-all dilutes training signal | Split into specific skill subtopics |
| Topics too narrow ("Refund for plan X in Q3") | Only 1-2 possible examples | Generalize to the skill |
| Too few leaf topics (<5 for 500 records) | 100 records/topic = redundancy, poor breadth | Split topics; add difficulty dimension |
| All topics same difficulty | No control over GRPO learning signal | Add explicit difficulty tiers |
| Overlapping topics | Records could fit in multiple places | Make skill boundaries clearer |
| Missing error/edge case topics | Model fails on unusual inputs | Add explicit edge case difficulty tiers |

---

## Coverage Analysis

After generating data, check topic distribution. The goal is NOT uniform distribution — it's adequate coverage with difficulty-appropriate weighting.

### Coverage Score (replaces old "Balance Score")

The old balance score targeted uniform distribution. The new approach measures two things:

**1. Coverage completeness** (0-1): What fraction of leaf topics have ≥15 records?

```
coverage_completeness = topics_with_15_plus_records / total_leaf_topics
```

**2. Difficulty alignment** (0-1): After base model eval, how close is the actual distribution to the target difficulty weighting (hard: 40-50%, medium: 30-40%, easy: 10-20%)?

```
For each difficulty tier:
  actual_share = records_in_tier / total_records
  target_share = target for that tier
  gap = |actual_share - target_share|

difficulty_alignment = 1 - sum_of_gaps
```

**3. Overall readiness** = min(coverage_completeness, difficulty_alignment)

### Rating Scale

| Score | Rating | Action |
|-------|--------|--------|
| 0.8-1.0 | Ready | Proceed to training |
| 0.6-0.8 | Almost ready | Generate more records for under-covered topics |
| 0.4-0.6 | Needs work | Significant gaps in coverage or difficulty alignment |
| < 0.4 | Not ready | Major rework needed — review topic design |

### Fixing Issues

1. **Empty or near-empty topics** → Generate more records for those skills
2. **Too many easy records** → Generate harder variants, split easy topics
3. **All topics similar eval scores** → Check if grader differentiates by skill; may need topic-specific grading criteria
4. **One topic much worse** → Check: enough records? Appropriate difficulty? Grader fits this skill?

---

## Evaluation Score Distribution by Topic

After running an evaluation, group scores by topic to understand where the model is strong and where it struggles. This is one of the most actionable analyses — it tells you exactly where to focus improvement effort.

### How to Build the Breakdown

Map each record's evaluation score back to its topic (using the record ID convention, e.g., `fork-detection-basic-001` → `tactics/fork-detection/fork-detection-basic`). Then compute per-topic stats:

```
Topic                              Records   Avg Score   Std Dev   Min    Max
tactics/fork-detection-basic           20      0.82       0.12     0.55   1.00
tactics/fork-detection-complex         20      0.35       0.25     0.00   0.70
tactics/pin-recognition-absolute       18      0.75       0.18     0.30   0.95
strategy/plan-single-idea              15      0.70       0.15     0.40   0.90
strategy/plan-competing-ideas          15      0.28       0.15     0.05   0.50
endgame/kp-basic-opposition            12      0.78       0.10     0.55   0.95
endgame/kp-breakthrough                12      0.42       0.30     0.00   0.85
```

### What the Distribution Tells You

| Pattern | What it means | Action |
|---------|--------------|--------|
| High avg, low std (e.g., fork-detection-basic) | Consistently good — model handles this well. **This is an easy topic.** | Reduce records here; it will go zero-variance in training |
| High avg, high std (e.g., kp-breakthrough) | Good on average but inconsistent | Review the low-scoring records — they likely have different characteristics |
| Low avg, low std (e.g., plan-competing-ideas) | Consistently bad — **this is a hard topic** | Check system prompt, grader fit. This is where GRPO learning signal is strongest — prioritize more records here |
| Low avg, high std (e.g., fork-detection-complex) | Mixed results — some prompts work, most don't | Study what's different about the working prompts. Generate more like those |
| All topics similar scores | Grader doesn't differentiate by skill | May need skill-specific grading criteria |
| Easy topics >> hard topics in score | Expected for GRPO | Don't worry — the hard topics are where learning happens |

### Using Eval Scores to Set Difficulty Weights

After the first eval, use per-topic scores to classify difficulty and set record distribution:

```
Topic                         Avg Score → Difficulty → Target Share
fork-detection-basic            0.82    → Easy       → 10-20% of records
fork-detection-complex          0.35    → Hard       → 40-50% of records
pin-recognition-absolute        0.75    → Easy       → 10-20% of records
plan-competing-ideas            0.28    → Hard       → 40-50% of records
```

Then regenerate records with the weighted distribution before training.

### Tracking Score Distribution Across Iterations

Save per-topic scores each iteration so you can see which topics are improving:

```
                              Iter 1    Iter 2    Iter 3
fork-detection-complex:        0.20  →   0.35  →   0.48   ↑ improving (hard topic, good signal)
plan-competing-ideas:          0.22  →   0.25  →   0.28   ↑ slow (may need better source material)
fork-detection-basic:          0.78  →   0.82  →   0.85   → plateau (expected — easy topic)
kp-breakthrough:               0.45  →   0.42  →   0.40   ↓ investigate (may need grader fix)
```

If a topic's score drops between iterations, your changes may have negatively affected it.

---

## Using the Backend API

Optionally, use the topic generation endpoint instead of designing manually:

```bash
curl -X POST http://localhost:9090/finetune/topic-hierarchy/generate \
  -H "Content-Type: application/json" \
  -d '{
    "goals": "Customer support for SaaS",
    "depth": 3,
    "degree": 4,
    "records": [],
    "max_topics": 5,
    "seed_topics": ["Billing", "Technical Support", "Account Management"]
  }'
```

The `seed_topics` parameter is useful — but pass **skill descriptions** not document headings. Instead of `["Chapter 3: Tactical Motifs"]`, pass `["Fork Detection", "Pin Recognition", "Combination Calculation"]`.

---

## Research Sources

| Paper / Source | arXiv / URL | Key Finding for Topic Design |
|---------------|-------------|------------------------------|
| "On Diversity of Synthetic Data" | arXiv:2410.15226 | More topics > more examples/topic. ~20 examples/topic sweet spot |
| STEPS — Skill Taxonomy | arXiv:2601.03676 | Skill-based hierarchies outperform content-based |
| TAGS — From Tags to Trees | arXiv:2601.13995 | Hierarchical tree; 5% of data outperformed full dataset |
| DeepSeek-R1 | arXiv:2501.12948 | Organized by capability domain, not content structure |
| DAPO | arXiv:2503.14476 | Dynamic sampling filters zero-variance prompts |
| "Hard Examples Are All You Need" | arXiv:2508.14094 | Hardest 10% yields 47% gains; easy yields 3-15% |
| "No Prompt Left Behind" | arXiv:2509.21880 | 30-99% of prompts per batch are zero-variance |
| F-GRPO | arXiv:2602.06717 | Down-weight high-success prompts → 4x fewer rollouts |
| GRPO-LEAD | arXiv:2504.09696 | Difficulty-weighted advantage scaling |
| AceGRPO | arXiv:2602.07906 | Adaptive curriculum: allocate to "learning frontier" |
| Reinforce-Ada | arXiv:2510.04996 | Dynamic budget allocation → 2x convergence speedup |
| DRA-GRPO | arXiv:2505.09655 | Diversity-aware rewards; 7K samples sufficient |
| OpenAI RFT Guide | platform.openai.com | Works with ~100 examples; quality > quantity |

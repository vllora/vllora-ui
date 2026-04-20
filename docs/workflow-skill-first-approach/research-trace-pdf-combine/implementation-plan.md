# Implementation Plan: Trace-Informed Finetune Pipeline

> **Date**: 2026-04-13
> **Status**: Ready for implementation
> **Depends on**: [research-trace-informed-curriculum.md](./research-trace-informed-curriculum.md)

## Overview

Unify the two finetune skills into one skill that auto-detects inputs (PDFs, traces, or both). When both are present, traces inform 4 pipeline steps: topics, prompts, record allocation, and grader design.

---

## Phase 1: Skill — Trace Analysis Script (NEW)

### 1.1 Create `finetune-skill/scripts/trace_analyze.py` (~300 lines)

**Purpose**: Read OTel traces → produce 4 artifacts in `finetune-project/`.

**Historical note**: These helpers originated in the now-consolidated `finetune-skill-otel/` codebase; they were copied into `finetune-skill/scripts/trace_analyze.py` during the consolidation. Paths below refer to the pre-consolidation source for provenance.

| Existing code | What it does | Reuse for |
|---|---|---|
| `otel_distill.py:group_by_trace_id()` | Partition spans by trace | All artifacts |
| `otel_distill.py:is_llm_chat_span()` | Identify LLM decision points | trace_priority, trace_prompts |
| `otel_distill.py:extract_tool_calls_from_output()` | Parse tool calls from assistant msgs | trace_priority, trace_grader_hints |
| `otel_distill.py:all_tool_calls_succeeded()` | Check tool execution success | trace_priority (failure detection) |
| `trace_topics.py:build_topic_hierarchy()` | Build topic tree from tool schemas | trace_topics |
| `trace_topics.py:count_records_per_tool()` | Count tool calls per tool | trace_priority |

**New code needed**:

```python
def analyze_traces(spans: list[dict]) -> dict:
    """Main entry point. Returns all 4 artifacts."""

    # 1. trace_priority.json
    #    - Group spans by trace_id
    #    - Count tool call frequency per topic
    #    - Compute per-topic success/failure (from span status + tau_bench.reward)
    #    - priority_score = frequency × (1 - success_rate)

    # 2. trace_topics.json
    #    - Reuse build_topic_hierarchy() from trace_topics.py
    #    - Compare against PDF-derived topics (if topics.json exists)
    #    - Flag topics found in traces but not in PDF

    # 3. trace_prompts.json
    #    - Extract system prompt from first system message in traces
    #    - Simplify: keep role + format + key constraints, strip verbose rules
    #    - Extract real user queries grouped by topic (for seed prompts)

    # 4. trace_grader_hints.json
    #    - Cluster failed traces by failure mode (tool name mismatch, missing auth, etc.)
    #    - Extract explicit rules from system prompt as grader criteria
    #    - Select calibration pairs (one success + one failure per task, if available)
```

**CLI**:
```bash
python3 scripts/trace_analyze.py \
  --traces source_traces_semconv.json \
  --topics topics.json \               # optional: compare against PDF topics
  --output-dir finetune-project/
```

**Outputs**:
- `finetune-project/trace_priority.json`
- `finetune-project/trace_topics.json`
- `finetune-project/trace_prompts.json`
- `finetune-project/trace_grader_hints.json`

### 1.2 Modify `finetune-skill/scripts/generate_records.py` (~80 lines)

**File**: `finetune-skill/scripts/generate_records.py` (7270 lines)

**Change 1: New CLI arguments** (after line 1180):
```python
parser.add_argument("--trace-priority-file", help="Path to trace_priority.json")
parser.add_argument("--trace-prompts-file", help="Path to trace_prompts.json for seed queries")
```

**Change 2: New weighting mode in `compute_topic_record_counts()`** (line 467):
- Add parameter: `trace_priority_scores: dict[str, float] | None = None`
- Add branch: if trace_priority_scores provided, use them for allocation
- Same tier logic as `--weight-by-difficulty` (hard 45%, medium 35%, easy 20%)
- Auto-detect: if `finetune-project/trace_priority.json` exists, load it

**Change 3: Seed query injection in `_call_llm_for_type()`** (line 613):
- If `trace_prompts.json` has seed queries for the current topic, include 2-3 as examples in the LLM prompt
- Fallback to existing synthetic generation if no seeds available

### 1.3 Create `finetune-skill/scripts/grader_from_traces.py` (~150 lines)

**Purpose**: Read `trace_grader_hints.json` → generate initial grader rubric.

**Logic**:
1. Read failure dimensions from hints
2. Read prompt rules from hints
3. Generate grader template with:
   - One scoring criterion per failure dimension (weighted by failure frequency)
   - Explicit rule checks from production prompt
   - Score ranges: correct tier (0.5–1.0), wrong tier (0.02–0.5)
4. Output: `grader-draft.js` (user reviews + adjusts)

**Important**: This generates a DRAFT. The user must review and confirm before training.

### 1.4 Update `finetune-skill/SKILL.md` (~100 lines)

**Step 1 — Input Detection**: Add auto-detection logic:
```
Check for:
- pdfs/ directory → PDF mode
- source_traces_semconv.json or *.traces.json → Trace mode  
- Both → Combined mode (trace-informed)
```

**Step 2 — Add parallel trace extraction**:
```
If traces detected:
  Run trace_analyze.py → 4 artifacts
  (runs in parallel with PDF extraction)
```

**Step 3 — Topic generation**: Add trace enrichment:
```
If trace_topics.json exists:
  Merge trace-discovered topics into PDF topic hierarchy
  Flag coverage gaps (trace topics with no PDF source)
```

**Step 4 — Record generation**: Add trace weighting:
```
If trace_priority.json exists:
  Use trace-informed allocation (auto-detected)
If trace_prompts.json exists:
  Use real user queries as seed prompts
```

**Step 5 — Grader**: Add trace-informed rubric:
```
If trace_grader_hints.json exists:
  Run grader_from_traces.py → grader-draft.js
  Present to user for review before finalizing
```

---

## Phase 2: UI — Display Trace Artifacts

### 2.1 New Types (`src/types/dataset-types.ts`)

```typescript
interface TopicTraceMetrics {
  frequency: number;        // fraction of traces touching this topic
  traceCount: number;       // absolute count
  failureRate: number;      // fraction of traces that failed
  priorityScore: number;    // frequency × failureRate
  priorityTier: 'high' | 'medium' | 'low';
  source: 'pdf' | 'trace' | 'both';  // where topic was discovered
}

interface GraderDimension {
  name: string;             // e.g., "authentication_before_action"
  description: string;      // human-readable
  failureRate: number;      // from traces
  source: 'trace_failure' | 'prompt_rule';
}

interface TraceAnalysisResult {
  priority: Record<string, TopicTraceMetrics>;
  topics: { discovered: string[]; coverageGaps: string[] };
  prompts: { systemPrompt: string; simplifiedPrompt: string; seedQueries: Record<string, string[]> };
  graderHints: { dimensions: GraderDimension[]; calibrationPairCount: number };
}
```

### 2.2 New Context: `src/contexts/TraceAnalysisContext.tsx`

- Holds `TraceAnalysisResult` state
- Loaded when dataset has trace artifacts
- Provides `topicTraceMetrics` map for topics view
- Provides `graderDimensions` list for grader view

### 2.3 Topics View Enhancement

**File**: `src/components/datasets/topics-dialog/TopicTreeNode.tsx`

Add per-topic trace badges (only when trace data available):
- Frequency badge: "127 traces (27.6%)"
- Failure rate: "43.3% fail" in red/yellow/green
- Priority tier: HIGH / MEDIUM / LOW chip
- Source indicator: "from PDF" / "from traces" / "both"
- Coverage gap warning: "No PDF source" for trace-only topics

### 2.4 Grader View Enhancement

**File**: `src/components/datasets/evaluation-dialog/EvaluationConfigPanel.tsx`

Add new section/tab "Auto-Generated Dimensions" (only when trace_grader_hints available):
- List of grader dimensions with name, description, failure rate
- "From trace failures" vs "From prompt rules" labels
- Button: "Apply to Grader" → populates grader template with these dimensions
- Calibration status: "20 success + 15 failure traces available for validation"

**New component**: `src/components/datasets/evaluation-dialog/TraceGraderDimensionsPanel.tsx`

### 2.5 Records View Enhancement

**File**: `src/components/datasets/records-table/RecordRow.tsx`

Add "Query Origin" indicator (only when trace_prompts used):
- Blue dot: "Seed Query" (from real traces)
- Gray dot: "Synthetic" (LLM-generated)
- In detail sidebar: show original trace_id for seed queries

### 2.6 Services

**File**: `src/services/finetune-api.ts`

Add function to fetch trace analysis artifacts:
```typescript
async function getTraceAnalysis(workflowId: string): Promise<TraceAnalysisResult | null>
```

This reads the 4 JSON files from the gateway (they're stored as workflow artifacts alongside topics.json and training.jsonl).

### 2.7 Gateway API

**File**: `../gateway/src/http.rs`

New endpoint:
- `GET /api/workflows/:id/trace-analysis` → returns combined trace artifacts
- Or: store trace artifacts as regular workflow files (simplest — gateway already stores topics.json, training.jsonl)

---

## Phase 3: Test Scenario Validation

### 3.1 tau-retail-combined Assessment

| Artifact | Can demo produce it? | Data quality | Notes |
|---|---|---|---|
| `trace_priority.json` | Yes | High | 460 traces, clear frequency skew (0.1%–99.4%), failure rates 0%–61% |
| `trace_topics.json` | Yes | High | Wiki covers 7 procedures; traces surface "unknown" category (order tracking, gift card balance) |
| `trace_prompts.json` | Yes | High | System prompt extractable from all spans; 3,114 unique user queries |
| `trace_grader_hints.json` | Partial | Medium | Failure labels exist (reward=0.0) but failure REASONS need inference. Policy rules are rich and extractable |

### 3.2 Test Scenario Adjustments Needed

**Update `finetune-prompt.md`** to match the actual unified skill flow:

```markdown
Current: "Run the full finetune pipeline: extract knowledge, analyze traces..."
Should be: Match SKILL.md step numbering and auto-detection language
```

**Update `README.md`** to document expected outputs for all 4 artifacts with concrete examples from the retail data.

**Add `expected/` folder back** (as validation reference, not as skill outputs):
- `expected/trace_priority_sample.json` — what the analysis should produce
- `expected/trace_topics_sample.json` — coverage gaps it should find
- `expected/trace_grader_dimensions.md` — what failure patterns it should detect

### 3.3 Grader Hints Limitation

tau-bench traces have top-level `reward: 0.0/1.0` but NOT per-step failure reasons. The trace_grader_hints extraction must use a hybrid approach:

1. **From traces**: Which tasks failed (reward=0.0) + which tools were called → infer failure category
2. **From policy text**: Extract explicit rules → convert to grader criteria
3. **Calibration**: Use success/failure trace pairs (4 trials per task → natural calibration set)

This is sufficient for the demo but the extraction logic needs to be smart about inference.

---

## Implementation Order

### Sprint 1: Core Skill (can demo end-to-end)

| Task | File | Est. Lines | Depends on |
|---|---|---|---|
| 1. `trace_analyze.py` — priority + topics | `finetune-skill/scripts/trace_analyze.py` | 150 | — |
| 2. `trace_analyze.py` — prompts + grader hints | `finetune-skill/scripts/trace_analyze.py` | 150 | #1 |
| 3. `generate_records.py` — trace priority loading | `finetune-skill/scripts/generate_records.py` | 50 | #1 |
| 4. `generate_records.py` — seed query injection | `finetune-skill/scripts/generate_records.py` | 30 | #2 |
| 5. `grader_from_traces.py` — draft grader gen | `finetune-skill/scripts/grader_from_traces.py` | 150 | #2 |
| 6. SKILL.md — auto-detection + combined flow | `finetune-skill/SKILL.md` | 100 | #1-5 |
| 7. Test: run tau-retail-combined end-to-end | — | — | #1-6 |

**Sprint 1 total: ~630 lines, produces working demo**

### Sprint 2: UI Visualization

| Task | File | Est. Lines | Depends on |
|---|---|---|---|
| 8. Types: TraceAnalysisResult, TopicTraceMetrics | `src/types/dataset-types.ts` | 40 | Sprint 1 |
| 9. Context: TraceAnalysisContext | `src/contexts/TraceAnalysisContext.tsx` | 80 | #8 |
| 10. Service: getTraceAnalysis | `src/services/finetune-api.ts` | 30 | #8 |
| 11. Topics: trace badges in TopicTreeNode | `src/components/datasets/topics-dialog/` | 60 | #9 |
| 12. Grader: TraceGraderDimensionsPanel | `src/components/datasets/evaluation-dialog/` | 120 | #9 |
| 13. Records: query origin badge | `src/components/datasets/records-table/` | 40 | #9 |

**Sprint 2 total: ~370 lines, full UI visualization**

### Sprint 3: Gateway + Polish

| Task | File | Est. Lines | Depends on |
|---|---|---|---|
| 14. Gateway: store trace artifacts | `../gateway/src/http.rs` | 50 | Sprint 1 |
| 15. Test scenario: expected outputs | `test-samples/tau-retail-combined/expected/` | docs | Sprint 1 |
| 16. Update tau-retail-combined README + prompt | `test-samples/tau-retail-combined/` | docs | Sprint 1 |
| 17. Documentation sync | `docs/` | docs | All |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Trace→topic mapping accuracy (embedding similarity) | Medium — wrong mapping = wrong priorities | Start with tool-name matching (deterministic), add embedding later |
| Grader hints too vague from traces | Low — user always reviews draft | Hybrid approach: trace failures + policy rules. Draft is a starting point, not final |
| Large trace files slow down analysis | Low — one-time cost | Stream processing, cap at 1000 traces for analysis |
| OTel format variations across producers | Medium — different tools emit different attributes | Validate required attributes upfront, degrade gracefully on missing optional fields |
| Two-skill isolation rule conflict | None | Decision: only modify `finetune-skill/`. The separate OTel skill has since been consolidated away. |

---

## Decisions (Resolved 2026-04-13, updated 2026-04-20)

### 1. Scope: Only modify `finetune-skill/`

Add trace analysis capability to the existing PDF skill. The formerly separate `finetune-skill-otel/` was a short-lived parallel pipeline; on 2026-04-20 it was consolidated into `finetune-skill/` (which already covered combined PDF + OTel mode), eliminating the two-skill maintenance cost.

### 2. Gateway storage: Separate `trace_analyses` table

**Decided**: Option B — new table in SQLite.

```sql
CREATE TABLE trace_analyses (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  priority_json TEXT,      -- trace_priority.json content
  topics_json TEXT,        -- trace_topics.json content
  prompts_json TEXT,       -- trace_prompts.json content
  grader_hints_json TEXT,  -- trace_grader_hints.json content
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_trace_analyses_workflow ON trace_analyses(workflow_id);
```

**API**: `GET/PUT /api/workflows/:id/trace-analysis` — single endpoint, all 4 fields. Optional `?fields=priority,topics` for partial fetches.

**Why this over alternatives**:
- Workflow columns: pollutes existing schema, every query fetches blobs
- Files on disk: loses queryability, second source of truth
- Project folder only: UI can't access skill's working directory
- Matches MLflow (structured metadata in DB, large artifacts on disk) and LangFuse (JSON columns in Postgres) patterns
- Zero migration risk: old workflows simply have no row

**Research sources**: MLflow artifact store pattern, W&B run metadata pattern, LangFuse trace/observation schema.

### 3. Seed query ratio: 15-25% real, 75-85% synthetic

**Decided**: Variable per topic, anchored at ~20% overall.

| Topic type | Real seed % | Synthetic % | Rationale |
|---|---|---|---|
| High-traffic (>20% of traces) | 30-40% | 60-70% | Enough real examples, deployment accuracy matters most |
| Medium-traffic (5-20%) | 15-25% | 75-85% | Balance real diversity with synthetic coverage |
| Long-tail (<5%) | 5-10% | 90-95% | Insufficient real examples, synthetic fills gaps |
| Novel/aspirational (0 traces) | 0% | 100% | No production data exists |

**Rules**:
- Use real queries **as-is** — don't paraphrase. Their value IS authentic phrasing, typos, ambiguity.
- **Difficulty filter**: drop real queries scoring >0.9 at K=8 (trivial, zero GRPO signal)
- **Collapse monitor**: if model echoes production phrasing patterns, reduce real ratio to 10%

**Research sources**: DCLM (arXiv:2406.11794) — 10-30% curated data in synthetic-heavy mix optimizes generalization. Self-Instruct (arXiv:2212.10560) — 175 real seeds shaped 52K synthetic distribution. Lima (arXiv:2305.11206) — quality over quantity. "No Prompt Left Behind" (arXiv:2509.21880) — zero-variance prompts waste compute regardless of source.

### 4. Priority formula: `frequency × failure_rate`

Start with this. Tune after first demo run on tau-retail-combined. If the formula over-weights rare-but-failing topics, add a frequency floor.

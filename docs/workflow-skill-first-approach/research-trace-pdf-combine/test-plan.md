# Test Plan: Trace-Informed Finetune Pipeline

> **Date**: 2026-04-13
> **Test scenario**: `test-samples/tau-retail-combined/`
> **Data**: 460 real GPT-4o retail trajectories (tau-bench, MIT license) + retail agent policy wiki

## Overview

This plan verifies the trace-informed pipeline end-to-end: auto-detection → trace analysis → enriched topics → weighted records → trace-informed grader → eval → train.

Each test phase builds on the previous. If a phase fails, fix before proceeding.

---

## Phase 1: Trace Analysis (4 artifacts)

### Test 1.1: trace_priority.json

**Run**:
```bash
python3 scripts/trace_analyze.py \
  --traces source_traces_semconv.json \
  --output-dir finetune-project/
```

**Verify**:
- [ ] File `finetune-project/trace_priority.json` exists
- [ ] Contains all 16 tools as keys (matching tau-bench retail tools)
- [ ] Each entry has: `frequency`, `traceCount`, `failureRate`, `priorityScore`
- [ ] `frequency` values sum to roughly 1.0 (normalized)
- [ ] `modify_pending_order_payment` has frequency < 0.02 (barely used)
- [ ] `get_order_details` has highest frequency (>0.25)
- [ ] `priorityScore` = frequency × failureRate (verify for 3 random topics)
- [ ] At least 3 topics have failureRate > 0.3 (enough failure signal)

**Expected values** (approximate):
```
get_order_details:              frequency ~0.28, failureRate ~0.36
exchange_delivered_order_items: frequency ~0.04, failureRate ~0.43
modify_pending_order_payment:   frequency ~0.001, failureRate ~0.00
```

### Test 1.2: trace_topics.json

**Verify**:
- [ ] File `finetune-project/trace_topics.json` exists
- [ ] Contains `discovered_topics` list (topics from traces)
- [ ] Contains `coverage_gaps` list (trace topics NOT in PDF)
- [ ] All 16 tau-bench tools appear in discovered_topics
- [ ] At least 1 coverage gap identified (e.g., "order tracking" or "gift card balance" queries that the wiki doesn't explicitly cover as a procedure)
- [ ] Each coverage gap has: `topic_name`, `trace_count`, `sample_queries`

### Test 1.3: trace_prompts.json

**Verify**:
- [ ] File `finetune-project/trace_prompts.json` exists
- [ ] `system_prompt` field contains the full retail agent policy (starts with "# Retail agent policy")
- [ ] `simplified_prompt` field is shorter than `system_prompt` (distilled)
- [ ] `simplified_prompt` contains: role ("retail agent"), output format, key constraints
- [ ] `simplified_prompt` does NOT contain the full procedure details (those are learned from training)
- [ ] `seed_queries` is a dict mapping topic → list of real user queries
- [ ] At least 5 topics have seed queries
- [ ] Seed queries are natural language (not synthetic-sounding)
- [ ] Total seed queries > 100 (tau-bench has 3,114 unique queries)

**Sample seed queries to check**:
```
"exchange-delivered-order": [
  "I received my order and I'd like to exchange a couple of items",
  "I need to exchange my keyboard for one with clicky switches",
  ...
]
```

### Test 1.4: trace_grader_hints.json

**Verify**:
- [ ] File `finetune-project/trace_grader_hints.json` exists
- [ ] `failure_dimensions` list has at least 3 entries
- [ ] Each dimension has: `name`, `description`, `failure_rate`, `source` (trace_failure or prompt_rule)
- [ ] At least 1 dimension from trace failures (e.g., "authentication skipped")
- [ ] At least 1 dimension from prompt rules (e.g., "only cancel pending orders")
- [ ] `calibration_pairs` list has at least 10 entries
- [ ] Each calibration pair has: `trace_id`, `outcome` (success/failure), `task_id`
- [ ] Calibration pairs include BOTH successes and failures
- [ ] `prompt_rules_as_criteria` list extracted from the production system prompt

**Expected dimensions** (at minimum):
```
- "authentication_before_action" (from traces — agents sometimes skip auth)
- "user_confirmation_required" (from prompt rule — "obtain explicit user confirmation")
- "order_status_check" (from prompt rule — "check status before taking action")
```

---

## Phase 2: Topic Generation (Enriched)

### Test 2.1: PDF Topics Created

**Run**: Standard topic generation from PDF

**Verify**:
- [ ] `finetune-project/topics.json` exists
- [ ] Contains topics for all 7 wiki procedures: cancel, modify-payment, modify-items, modify-address, return, exchange, transfer-to-human
- [ ] Topic hierarchy has at least 2 levels (root + leaves)

### Test 2.2: Topics Enriched with Trace Data

**Run**: Topic enrichment with trace_topics.json

**Verify**:
- [ ] All PDF-derived topics preserved (traces never remove topics)
- [ ] Coverage gap topics flagged with `source: "trace"` marker
- [ ] Each topic has trace metadata: `traceFrequency`, `traceFailureRate`, `tracePriorityScore`
- [ ] Topics with no trace presence have neutral defaults (frequency=0, priority="low")

### Test 2.3: No Topic Removal

**Verify**:
- [ ] `modify_pending_order_payment` topic still exists (0.1% frequency but in PDF)
- [ ] `transfer_to_human` topic still exists (0.7% frequency but in PDF)
- [ ] Minimum floor applied: no topic has priority below the minimum threshold

---

## Phase 3: Record Generation (Trace-Weighted)

### Test 3.1: Weighted Allocation

**Run**: `generate_records.py` with trace_priority.json

**Verify**:
- [ ] `finetune-project/training.jsonl` exists
- [ ] Total record count matches budget (e.g., 200)
- [ ] Count records per topic (group by `topic` field in JSONL)
- [ ] High-priority topics have MORE records than equal allocation (16 each)
- [ ] Low-priority topics have FEWER records but at least the minimum floor (3)
- [ ] Ratio check: highest-allocation topic has at least 2x records vs lowest

**Expected allocation** (200 budget):
```
Topic with highest priority:  25-40 records
Topic with lowest priority:   3-5 records (floor)
```

### Test 3.2: Seed Query Integration

**Verify**:
- [ ] At least 20% of records have user messages that match seed queries from trace_prompts.json
- [ ] Seed-query records are distributed across topics (not all in one topic)
- [ ] Seed queries are used as-is or lightly paraphrased (not completely rewritten)
- [ ] Remaining records still have synthetic prompts (not 100% seed)

### Test 3.3: Prompt Type Distribution

**Verify**:
- [ ] High-failure topics have more `edge_case` and `scenario` prompt types
- [ ] Low-failure topics have default distribution (explain, scenario, edge_case, comparative)
- [ ] Every topic has at least 2 different prompt types

---

## Phase 4: Grader (Trace-Informed Rubric)

### Test 4.1: Auto-Generated Grader Draft

**Run**: `grader_from_traces.py` with trace_grader_hints.json

**Verify**:
- [ ] `finetune-project/grader-draft.js` exists (or equivalent grader file)
- [ ] Grader has at least 3 scoring dimensions matching trace_grader_hints dimensions
- [ ] Each dimension has a score weight proportional to its failure frequency
- [ ] Score range: correct tier 0.5–1.0, wrong tier 0.02–0.5 (never 0.0)
- [ ] Grader includes explicit rule checks from prompt_rules_as_criteria

### Test 4.2: Grader Calibration

**Run**: Score calibration pairs from trace_grader_hints.json

**Verify**:
- [ ] Success traces (reward=1.0) score > 0.7 from the grader
- [ ] Failed traces (reward=0.0) score < 0.4 from the grader
- [ ] If calibration fails: grader rubric needs adjustment (not a code bug)
- [ ] Correlation between grader scores and trace outcomes is positive

### Test 4.3: Grader Produces Variance

**Run**: Score 20 random records from training.jsonl

**Verify**:
- [ ] Score distribution has standard deviation > 0.1 (not all same score)
- [ ] At least 3 distinct score values across 20 records
- [ ] No dimension always scores 1.0 or always 0.0 (each dimension produces variance)

---

## Phase 5: Auto-Detection (Unified Skill)

### Test 5.1: Both Inputs → Combined Mode

**Setup**: Folder with `pdfs/` AND `source_traces_semconv.json`

**Verify**:
- [ ] Skill detects both inputs
- [ ] Runs trace analysis (produces 4 artifacts)
- [ ] Runs PDF extraction (produces knowledge/)
- [ ] Enriches topics with trace data
- [ ] Generates records with trace weighting
- [ ] Generates grader draft from trace hints
- [ ] All 4 trace artifacts visible in finetune-project/

### Test 5.2: PDF Only → Standard Mode

**Setup**: Folder with `pdfs/` only (no traces)

**Verify**:
- [ ] Skill runs standard PDF pipeline
- [ ] No trace artifacts produced
- [ ] Records allocated equally per topic (no trace weighting)
- [ ] Grader is manual (no auto-generated draft)
- [ ] No errors or warnings about missing traces

### Test 5.3: Traces Only → OTel Mode

**Setup**: Folder with `source_traces_semconv.json` only (no PDFs)

**Verify**:
- [ ] Skill runs standard OTel pipeline
- [ ] No PDF extraction attempted
- [ ] Topics built from trace tool schemas
- [ ] Records extracted from trace decision points
- [ ] Programmatic Jaccard grader (not LLM judge)

---

## Phase 6: UI Verification

### Test 6.1: Topics View Shows Trace Data

**Run**: Open dataset in UI after combined pipeline run

**Verify**:
- [ ] Topics view shows trace frequency badge per topic
- [ ] Topics view shows failure rate indicator per topic
- [ ] Topics view shows priority tier (HIGH/MEDIUM/LOW)
- [ ] Coverage gap topics show warning icon
- [ ] Trace-only topics labeled as "from traces"

### Test 6.2: Grader View Shows Auto-Generated Dimensions

**Verify**:
- [ ] Grader config panel shows "Auto-Generated Dimensions" section
- [ ] Each dimension shows name, description, failure rate
- [ ] "From trace failures" vs "From prompt rules" labels present
- [ ] "Apply to Grader" button works (populates grader template)

### Test 6.3: Records View Shows Query Origin

**Verify**:
- [ ] Records table shows query origin column (when trace data available)
- [ ] Seed queries have blue badge
- [ ] Synthetic queries have gray badge
- [ ] Record detail shows trace_id for seed-query records

---

## Phase 7: Comparison (Proof of Value)

### Test 7.1: Equal vs Trace-Informed Allocation

**Run two pipelines on same data**:
1. PDF only (equal allocation) → `training_equal.jsonl`
2. PDF + traces (trace-informed) → `training_trace.jsonl`

**Verify**:
- [ ] Same total record count
- [ ] trace-informed has 2-3x more records for top-priority topics
- [ ] trace-informed has minimum-floor records for low-priority topics
- [ ] Per-topic counts differ by at least 50% for highest vs lowest priority

### Test 7.2: Record Quality Comparison

**Spot-check 10 records from each pipeline**:
- [ ] Trace-informed records include seed-query phrasing (more natural)
- [ ] Trace-informed records for high-failure topics have more edge_case prompts
- [ ] Equal-allocation records have uniform prompt type distribution

### Test 7.3: Grader Dimension Comparison

- [ ] Equal-allocation grader: generic dimensions (manually written)
- [ ] Trace-informed grader: specific dimensions targeting real failure modes
- [ ] Trace-informed grader: calibrated against known success/failure traces

---

## Acceptance Criteria (Must Pass Before Merge)

1. **All 4 trace artifacts produced** from tau-retail-combined data
2. **Auto-detection works** for all 3 modes (both, PDF-only, trace-only)
3. **Record allocation shifts** meaningfully from equal distribution
4. **Grader draft** includes at least 3 trace-derived dimensions
5. **Grader calibration** passes (success traces > 0.7, failure traces < 0.4)
6. **No regression** in PDF-only mode (existing tests still pass)
7. **UI surfaces** trace data in topics, grader, and records views
8. **tau-retail-combined** runs end-to-end without manual intervention

---

## Test Execution Checklist

| Phase | Test | Status |
|---|---|---|
| 1.1 | trace_priority.json produced correctly | [ ] |
| 1.2 | trace_topics.json with coverage gaps | [ ] |
| 1.3 | trace_prompts.json with system prompt + seeds | [ ] |
| 1.4 | trace_grader_hints.json with dimensions + calibration | [ ] |
| 2.1 | PDF topics created | [ ] |
| 2.2 | Topics enriched with trace data | [ ] |
| 2.3 | No topic removal (low-freq topics preserved) | [ ] |
| 3.1 | Weighted record allocation | [ ] |
| 3.2 | Seed query integration | [ ] |
| 3.3 | Prompt type distribution shifted | [ ] |
| 4.1 | Auto-generated grader draft | [ ] |
| 4.2 | Grader calibration passes | [ ] |
| 4.3 | Grader produces score variance | [ ] |
| 5.1 | Auto-detect: both → combined | [ ] |
| 5.2 | Auto-detect: PDF only → standard | [ ] |
| 5.3 | Auto-detect: traces only → OTel | [ ] |
| 6.1 | UI: topics view trace badges | [ ] |
| 6.2 | UI: grader auto-generated dimensions | [ ] |
| 6.3 | UI: record query origin | [ ] |
| 7.1 | Equal vs trace-informed allocation comparison | [ ] |
| 7.2 | Record quality comparison | [ ] |
| 7.3 | Grader dimension comparison | [ ] |

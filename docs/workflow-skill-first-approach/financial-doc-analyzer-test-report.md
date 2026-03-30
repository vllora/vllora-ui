# Test Report: Financial Document Analyzer (2026-03-30)

Test of the vLLora finetune skill pipeline against 3 real SEC 10-K filings (Apple FY2024, Microsoft FY2024, Tesla FY2024). Objective: extract key financial metrics with exact number accuracy and near-zero hallucination.

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Test directory | `/Users/anhthuduong/Documents/GitHub/test-samples/financial-doc-analyzer` |
| Model | `claude sonnet` (agent), `gpt-4o-mini` (eval), `unsloth/Qwen3.5-4B` (training) |
| Max turns | 200 |
| Documents | Apple 10-K (963KB, ~77p), Microsoft 10-K (3.2MB, ~200p), Tesla 10-K (1.7MB, ~200p) |
| Workflow ID | `b5897fb1-dcea-4236-b7e2-230f6cef9f15` |

## Pipeline Execution Summary

| Step | Status | Time | Notes |
|------|--------|------|-------|
| 1. Create Workflow | Done | <1s | Clean |
| 2. Extract Documents (3 PDFs) | Done | ~21 min | All 3 PDFs extracted in parallel via Docling |
| 3. Create Topics | Done | ~8 min | 24 topics (9 parent + 15 leaf), well-structured hierarchy |
| 3b. Upload Relations | Done | ~1 min | 136 topic-source relations |
| 4. Generate Records | Done | ~3 min | 225 records (15 per topic, perfectly balanced) |
| 5. Write Grader | Done | ~2 min | Multi-criteria grader (accuracy, hallucination, completeness, format) |
| 5.5 Validate | Done | <1 min | Passed |
| 7. Start Eval + Training | Done | Ongoing | Eval: 157/225 (avg 0.35), Training: epoch 1/8 |

**Total data-prep time: ~35 min** (mostly extraction). Record generation was fast (~3 min for 225 records).

## Extraction Quality

| Document | Parts | Avg Length | Parts/Page | Issues |
|----------|-------|-----------|------------|--------|
| Apple 10-K | 198 | 2,295 chars | 2.6 | Healthy — 177/198 unique titles, 36 tables, 0 short parts |
| Microsoft 10-K | 345 | 1,752 chars | ~1.7 | **19 parts share "PART II Item 8" title** — heading detection issue |
| Tesla 10-K | **35** | **14,627 chars** | **~0.17** | **Way too coarse** — massive chunks, 18 tables but only 17 text parts |

**Total parts: 578** across all 3 documents.

### Extraction Issues

- **Tesla**: Only 35 parts for a ~200-page filing means extraction merged too aggressively. Average content length 14,627 chars is 6x larger than Apple/Microsoft. This reduces topic-linking granularity and makes records less grounded.
- **Microsoft**: 19 parts sharing the same title ("PART II Item 8") indicates heading detection fell back to section-level headers instead of financial statement subsections.
- **Apple**: Clean extraction. Good title diversity, appropriate parts-per-page ratio.

## Topic Hierarchy

9 parent categories + 15 leaf topics:

```
Income Statement Metrics (60 records)
├── Revenue Extraction (15) — 12 sources
├── Net Income Extraction (15) — 10 sources
├── Gross Profit and Gross Margin (15) — 10 sources
└── Operating Margin and Other Margins (15) — 9 sources

Balance Sheet Metrics (30 records)
├── Total Assets (15) — 5 sources
└── Liabilities and Stockholders Equity (15) — 4 sources

Cash Flow Statement Metrics (30 records)
├── Operating Cash Flow (15) — 7 sources
└── Capital Expenditures (15) — 6 sources

Per-Share Metrics (15 records)
└── Basic and Diluted EPS (15) — 7 sources

Year-over-Year Growth (15 records)
└── Revenue YoY Growth Rate (15) — 11 sources

GAAP vs Non-GAAP Reconciliation (15 records)
└── Identifying and Labeling GAAP vs Non-GAAP (15) — 6 sources

Forward Guidance (15 records)
└── Extracting Quantitative Guidance (15) — 5 sources

Missing and Unavailable Metrics (15 records)
└── Flagging Not-Reported Metrics (15) — 12 sources

Full 10-K Metrics Extraction (30 records)
├── Single-Company Full Extraction (15) — 16 sources
└── Multi-Company Comparison (15) — 16 sources
```

**Relations**: 136 topic-source relations. All leaf topics have at least 4 relations. Good coverage.

## Record Quality

- **225 records**, exactly 15 per leaf topic (perfectly balanced)
- **100% gateway format** (`{"input":{"messages":[...]}}`)
- **0 uncategorized records** — all assigned to topics
- **0 original, 225 generated** — all LLM-generated, no trace-based records

## Evaluation Results (Partial — 157/225 scored)

| Metric | Value |
|--------|-------|
| Average score | 0.35 |
| Score range | 0.00 – 1.00 |
| Distribution | 0.0: 10, **0.3: 115**, 0.4: 7, 0.5: 3, 0.6: 2, 0.7: 1, 0.8: 1, 1.0: 11 |

77% of scored records got 0.30. This is expected for a base model eval — `gpt-4o-mini` doesn't have the actual filing content in-context, so it can't extract specific numbers. The grader correctly scores low because the model asks the user to provide data instead of extracting it.

## Training Status

| Parameter | Value |
|-----------|-------|
| Base model | unsloth/Qwen3.5-4B |
| Output model | financial-doc-analyzer-v1 |
| Epochs | 8 |
| Learning rate | 1e-06 |
| LoRA rank | 16 |
| Response candidates | 8 (GRPO) |
| Status | Running (epoch 1/8, 13%) |
| Avg score (epoch 1) | 0.40 |

---

## Pipeline Issues

### P1: Execution log not incrementally updated [Critical]

The execution log only contains Step 1 entries despite all 7 steps completing. SKILL.md instructs the agent to "create `execution-log.md` at Step 1 start and append after every action using `echo`/`cat >>`" but the agent ignores this after workflow creation.

**Impact**: Makes debugging impossible. If the pipeline fails mid-run, there's no log of what happened.

**Fix**: Add explicit log-append commands in SKILL.md after each step's completion gate. Consider making the checkpoint system double as the execution log.

### P2: Tesla extraction too coarse [High]

Only 35 parts for a ~200-page filing (0.17 parts/page vs target 2-10). Average content length 14,627 chars — 6x larger than Apple/Microsoft.

**Impact**: Topic-source relations are coarse. Training records reference massive chunks instead of specific sections. Reduces grounding quality.

**Fix**: Investigate Docling's chunk merging behavior for Tesla's filing format. The Tesla 10-K may have different document structure (fewer headings) that causes aggressive merging. May need per-document merging thresholds or fallback heading detection.

### P3: Microsoft heading detection issue [Medium]

19 parts share the title "PART II Item 8". The extraction script used section-level headers instead of financial statement subsections.

**Impact**: Parts within Item 8 (Financial Statements) are distinguishable only by content, not by title. UI shows duplicate names in source detail.

**Fix**: Heading detection should look deeper than top-level sections. For SEC filings, financial statement names (Income Statement, Balance Sheet, etc.) should be detected as headings.

### P4: Checkpoint doesn't track upload steps [Medium]

Checkpoint shows extract → topics → relations → generate-data → grader → validate but doesn't track `upload-knowledge`, `upload-topics`, `upload-records` as separate steps.

**Impact**: If agent crashes after extraction but before upload, it can't distinguish between "extracted but not uploaded" and "not extracted at all". Resume logic would re-extract unnecessarily.

**Fix**: Add upload steps to checkpoint: `upload-knowledge`, `upload-topics`, `upload-records`, `upload-grader`.

### P5: Eval-001 completed with 0 results [Medium]

First eval (`b703f133`) shows `status: "completed"` but `completed_rows: 0` out of 225 total. Second eval (`eval-002.json`) was created and has actual results.

**Impact**: Wastes an eval run. Creates a "done" eval in the UI that shows no data.

**Fix**: Investigate why eval-001 completed without processing any rows. Likely a race condition (eval started before records were fully uploaded) or a misconfiguration in the eval request.

### P6: Old failed workflows not cleaned up [Low]

Previous test run created workflow `b5a54f3a` (Draft, 0 rows) that lingers in the DB. No cleanup step in the pipeline.

**Impact**: UI shows duplicate "Financial Document Analyzer" workflows, confusing users.

**Fix**: Add a cleanup step to the test guide: delete stale workflows before testing. Consider adding a "delete workflow" action in the UI.

### P7: Perfectly uniform record distribution [Low]

All 15 leaf topics have exactly 15 records each. This uniformity suggests the generator is not adapting to content volume per topic.

**Impact**: Topics with richer source material (e.g., Revenue with 12 sources) produce the same number of records as topics with fewer sources (e.g., Total Assets with 5 sources). Training data quality may vary.

**Fix**: Consider proportional record generation based on source material volume. Topics with more linked source parts should generate more records.

---

## UI Issues & Improvements

### Bugs / Data Display Issues

#### U1: Eval Score card shows "No evaluations" on overview [Critical]

The overview page's Eval Score card shows "—" and "No evaluations" despite 2 evals existing (1 running with 157/225 results, 1 done). The `flattenEvaluationResults()` function in `finetune-api.ts` doesn't populate `epoch` and `trend` fields — this is a known gap documented in the testing guide.

**File**: `src/services/adapters/finetune-api.ts` — `flattenEvaluationResults()`

#### U2: Eval date shows "Jan 1 08:00 AM" instead of actual date [Critical]

The eval detail view shows "Jan 1 08:00 AM" as the creation date. The eval was created on Mar 30, 2026. The timestamp field is either null, epoch 0, or not being parsed correctly.

**File**: Eval detail header component (timestamp rendering)

#### U3: Eval polling errors in console [High]

Console shows repeated `[EvalJobManager] Poll failed for a3f544b9` errors with 404 responses. The eval polling manager continues polling an endpoint that returns errors.

**Impact**: Console noise, potential performance impact from repeated failed requests.

**File**: `src/services/eval-polling-manager.ts:204`

**Fix**: Add error count tracking. Stop polling after N consecutive failures. Handle 404 as "eval deleted/not found" and remove from polling queue.

#### U4: All eval records show "Pass" at score 0.30 [High]

In the eval results view, every record shows "Pass" status even with scores of 0.30. For a financial extraction task, 0.30 should clearly be a failing score.

**Fix**: Pass/fail threshold should be configurable per grader or default to 0.6 (the "acceptable" threshold shown in the training chart). The grader's `score >= 0.5` threshold may need adjustment.

#### U5: Failed eval column wastes space in records table [Medium]

The records table shows an `eval-141a8e` column with "—" for all 225 rows (the eval that completed with 0 results). This wastes horizontal space.

**Fix**: Hide eval columns that have 0 results, or collapse them into a "failed evals" indicator.

#### U6: Training view loading inconsistency [Medium]

Navigating to training detail sometimes shows the full Score Trend chart with epoch progress, other times shows only a "Training in progress" spinner with no data. The data was previously available but disappears on re-navigation.

**Fix**: Likely a race condition in data fetching. Ensure cached training data persists across navigation, or show a skeleton with the last-known state while refetching.

### UX Improvements

#### U7: Add topic grouping to eval results [High]

The records table groups beautifully by topic (parent → child → records). The eval results view shows flat numbered rows with no grouping. Users need to see which topic areas score well vs poorly.

**Improvement**: Group eval results by topic, showing per-topic avg scores. This directly answers "which financial extraction areas need more training data?"

#### U8: Show grader "reason" in eval result rows [High]

The grader returns a `reason` field (e.g., "The model did not provide any financial figures...") but it's not shown in the eval results list. Users must expand each row individually.

**Improvement**: Add a reason summary column or tooltip. Even a truncated reason (first 100 chars) would save many clicks when reviewing 225 results.

#### U9: Table data rendering for financial source parts [High]

Source parts containing financial tables (income statements, balance sheets) render as plain text with pipe characters (`| Revenue | $ 245,122 | $ 211,915 |`). These tables are the core data for this use case.

**Improvement**: Detect markdown-style tables in part content and render them as formatted HTML tables. This is especially important for financial data where exact numbers matter.

#### U10: Header bar should show partial eval results [Medium]

The header shows "0 evaluated" even when an eval is running with 157/225 scored. This contradicts what the user sees in the eval detail view.

**Improvement**: Show "157 evaluated (running)" or "70% evaluated" to reflect partial progress.

#### U11: Topic names truncated in sidebar [Medium]

Long financial topic names like "Liabilities and Stockholders Equity", "Identifying and Labeling GAAP vs Non-GAAP" get truncated to "Liabilities and Stockh...", "Identifying and Labeli..."

**Improvement**: Add tooltips on hover. Consider a wider sidebar option or wrappable text mode. For financial workflows, topic names tend to be longer than general-purpose ones.

#### U12: Duplicate workflow names are confusing [Medium]

Two "Financial Document Analyzer" workflows appear in the list — one Running (225 rows) and one Draft (0 rows) from a previous failed attempt. Users can't easily tell which is which.

**Improvement**: Show creation date/time more prominently on workflow cards. Add ability to delete or archive draft/failed workflows. Consider auto-naming with a version suffix (e.g., "Financial Document Analyzer v2").

#### U13: Epoch x-axis labels in Score Trend chart [Medium]

The Score Trend chart x-axis shows "Eval 1" instead of "Epoch 1". When multiple epochs complete, the distinction matters — users want to track score improvement across training epochs.

**Improvement**: Label x-axis as "Epoch N" when in training context. Show epoch boundaries clearly.

#### U14: "8 rows" misleading in training header [Low]

Training detail header shows "8 rows" but there are 225 training records. The "8" refers to 8 evaluation samples completed in this epoch.

**Improvement**: Show "225 records · 8 evaluated this epoch" to disambiguate.

#### U15: Canvas dense for large topic hierarchies [Low]

With 24 nodes, the canvas renders compactly but topic names are small and hard to read. Larger hierarchies (50+ topics) would be unusable.

**Improvement**: Add collapsible parent nodes on the canvas. Allow zooming to subtrees. Consider a list-based alternative view for very large hierarchies.

---

## What Works Well

These features should be preserved and built upon:

1. **System Prompt Chain** visualization in Records view — shows hierarchical prompt composition (Root → Parent → Leaf)
2. **Canvas topic hierarchy** with record counts, coverage percentages, and source link counts per node
3. **Linked Sources view** with content previews and extraction paths for each part
4. **Color-coded eval scores** (red/orange/yellow/green) in records table
5. **Training Score Trend** chart with target/acceptable/critical zones and warning messages
6. **Explorer sidebar** combining source documents, topic hierarchy, eval runs, and training jobs in one navigable tree
7. **Parallel Docling extraction** — all 3 PDFs submitted and polled simultaneously
8. **Record format handling** — UI correctly handles both gateway and OpenAI formats via `extractMessages()`
9. **Topic grouping in records table** — parent headers with aggregate counts and child topics with individual records
10. **Export button** — allows downloading training data

---

## Recommended Actions (Prioritized)

### Immediate (fix bugs)

1. Fix eval score card on overview — wire up `flattenEvaluationResults()` (U1)
2. Fix eval timestamp rendering — parse date correctly (U2)
3. Fix eval polling error handling — stop polling after failures (U3)
4. Fix pass/fail threshold logic — default to 0.6 or use grader config (U4)

### Short-term (UX wins)

5. Add topic grouping to eval results (U7)
6. Show grader reasons in eval result rows (U8)
7. Show partial eval progress in header bar (U10)
8. Add table renderer for financial data parts (U9)

### Skill improvements

9. Force incremental execution log updates — add explicit log-append after each step (P1)
10. Investigate Tesla extraction coarseness — tune Docling merging thresholds (P2)
11. Add upload steps to checkpoint for crash recovery (P4)
12. Add proportional record generation based on source volume (P7)

### Nice-to-have

13. Workflow delete/archive for failed runs (U12)
14. Sidebar tooltips for long topic names (U11)
15. Collapsible canvas nodes for large hierarchies (U15)

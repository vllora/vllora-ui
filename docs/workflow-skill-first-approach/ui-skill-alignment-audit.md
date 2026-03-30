# UI ↔ Finetune Skill Pipeline — Alignment Audit

**Last updated:** 2026-03-30
**Pipeline coverage:** 91-93% (component-level)
**Validated by:** Financial Document Analyzer test (3 SEC 10-K filings), Contract Translator test (11 legal docs)

This document tracks how well the UI reflects each step of the finetune skill pipeline. Issues are discovered through live test runs and updated here. Test-specific details (extraction stats, topic hierarchies, scores) belong in per-run reports under `docs/workflow-skill-first-approach/test-runs/`.

---

## 1. Pipeline Step Coverage

| Step | What Skill Produces | UI Component | Coverage | Known Issues |
|------|-------------------|-------------|----------|--------------|
| 1. Define Objective | Objective text, system prompt | Overview card (`DatasetOverviewPanel`) | ✅ | — |
| 2. Extract Documents | Knowledge sources with typed parts (text/table/image) | Knowledge tab (`KnowledgeSourcesPanel`, `SourcesView`) | ✅✅ | Table data renders as pipe-delimited text (U9) |
| 3. Build Topics | Topic hierarchy with parent/child, relations | Canvas (`TopicHierarchyCanvas`), explorer sidebar | ✅✅ | Long topic names truncated in sidebar (U12) |
| 4. Generate Data | Training records (JSONL) with topic labels, source refs | Records table (`RecordsTable`, `ConversationThreadCell`) | ✅✅ | — |
| 5. Write Grader | JavaScript grader function | Evaluations tab (`EvaluationConfigPanel`) | ✅✅ | — |
| 6. Verify | Gateway state validation | Overview → Eval Health (`VerdictBadge`) | ✅ | — |
| 7. Evaluate | Per-record scores, reasons, topic breakdowns | Eval dialog (`ResultsTable`, `ScoreHistogram`) | ⚠️ | Eval score card broken (U1), timestamps wrong (U2), pass/fail incorrect (U4) |
| 8. Analyze | Coverage matrix, balance scores, insights | Insights tab (`InsightsPane`, `CoverageDistribution`) | ✅✅ | — |
| 9. Train | Training jobs with metrics (reward, KL, loss, grad_norm) | Finetune tab (`FinetuneMetricsChart`, `EpochScoresTable`) | ⚠️ | Loading inconsistent (U6), row count misleading (U17) |

---

## 2. UI Bugs (Open)

### U1: Failed eval columns waste space in records table [Medium]

Eval runs that completed with 0 results still get a column in the records table, showing "—" for every row.

**Fix**: Hide eval columns with 0 results, or collapse into a "failed evals" indicator.

### U2: Training view loading inconsistency [Medium]

Navigating to training detail sometimes shows Score Trend chart with data, other times shows only a "Training in progress" spinner. Same data, different result on re-navigation.

**Fix**: Cache training data across navigation. Show skeleton with last-known state while refetching.

---

## 3. UI Improvements (UX Gaps)

Gaps identified across test runs. Prioritized by how much they affect the skill → UI feedback loop.

### High Priority

| # | Improvement | Why it matters | Effort |
|---|------------|----------------|--------|
| U9 | **Topic grouping in eval results** | Records table groups by topic. Eval results are flat rows. Users need per-topic score breakdown to know which areas need more data. | 3-4h |
| U10 | **Show grader "reason" in eval rows** | `reason` field exists but hidden. Users must expand each row. Add tooltip or summary column. | 1-2h |
| U11 | **Table renderer for structured source parts** | Parts containing tables (financial statements, legal clauses, data tables) render as pipe-delimited text. Need formatted HTML tables. | 3-4h |
| U12 | **Dead-weight record filter (score = 0)** | Skill Step 8b identifies records to remove+regenerate. UI has no way to filter or highlight these. This is the feedback loop the skill depends on most. | 1-2h |
| U13 | **Show partial eval progress in header** | Header shows "0 evaluated" while eval is running with partial results. Should show actual progress. | 1h |
| U14 | **State tracker overwrites cancelled jobs** | Gateway `finetune_state_tracker` polls cloud and may write "running" back over a user-cancelled job if the cloud cancel failed. Should skip jobs in terminal states. | 1h |

### Medium Priority

| # | Improvement | Why it matters | Effort |
|---|------------|----------------|--------|
| U15 | **Topic names truncated in sidebar** | Domain-specific topic names tend to be long. Add tooltips or wider sidebar option. | 1h |
| U16 | **Duplicate workflow names confusing** | Failed/draft workflows linger alongside active ones. Show creation date prominently. Add delete/archive action. | 2h |
| U17 | **Per-epoch aggregate summary table** | Shows if training works at a glance (Epoch / Avg / Std / Delta) without scanning all rows. | 1-2h |
| U18 | **Epoch x-axis labels in Score Trend** | Chart shows "Eval N" instead of "Epoch N". Clarify labeling for training context. | 1h |
| U19 | **Run-to-run comparison dialog** | Compare eval v1 vs v2 side-by-side with per-topic deltas. Currently only final score comparison. | 3-4h |

### Low Priority

| # | Improvement | Why it matters | Effort |
|---|------------|----------------|--------|
| U20 | **Row count misleading in training header** | Shows evaluated-this-epoch count instead of total records. Should disambiguate. | 30m |
| U21 | **Canvas dense for large hierarchies** | Works at 24 nodes. May need collapsible parent nodes for 50+ topic trees. | 3-4h |
| U22 | **Record-to-part lineage** | Can't trace how a specific record was generated from source material. | 3-4h |
| U23 | **"Dead parts" indicator** | Parts extracted but never linked to any topic or used in training — wasted extraction. | 2-3h |
| U24 | **Extraction quality metrics** | OCR confidence, completeness indicators, extraction error rates per document. | 2-3h |
| U25 | **Record diversity/similarity detection** | Find near-duplicate records, highlight coverage gaps across topics. | 3-4h |

---

## 4. Pipeline Issues (Skill-Side)

Issues in the finetune skill itself (not the UI). These affect what data reaches the gateway and therefore what the UI can display.

### P1: Execution log not incrementally updated [Critical]

Agent writes Step 1 to execution-log.md but never appends subsequent steps. SKILL.md says "append after every action" but agents ignore this consistently across test runs.

**Fix**: Add explicit `echo >> execution-log.md` after each step's completion gate. Consider making the checkpoint system double as the log.

### P2: Extraction granularity varies wildly across documents [High]

Same pipeline produces 2.6 parts/page for one document and 0.17 parts/page for another. Documents with fewer headings get merged into massive chunks.

**Fix**: Investigate Docling merging behavior. May need per-document thresholds, minimum parts-per-page floor, or fallback heading detection for documents with sparse structure.

### P3: Heading detection falls back to generic section names [Medium]

Multiple parts share the same generic title (e.g., section headers repeated for subsections). Extraction script uses top-level headers instead of detecting deeper subsection names.

**Fix**: Look deeper than top-level sections when building `extraction_path`. Domain-specific subsection names should be detected as headings.

### P4: Checkpoint doesn't track upload steps [Medium]

Checkpoint tracks local steps (extract, topics, generate-data, grader, validate) but not gateway uploads (upload-knowledge, upload-topics, upload-records).

**Impact**: Can't resume after crash between local generation and gateway upload.
**Fix**: Add upload steps to checkpoint.

### P5: First eval can complete with 0 results [Medium]

Eval job created immediately after record upload sometimes completes with 0/N rows processed. A second eval works fine.

**Fix**: Investigate race condition — eval may start before records are fully committed in the gateway.

### P6: Old failed workflows not cleaned up [Low]

Aborted/failed pipeline runs leave Draft workflows with 0 records in the gateway DB.

**Fix**: Add cleanup guidance to test guide. Add "delete workflow" UI action.

### P7: Uniform record distribution ignores source volume [Low]

Generator produces exactly the same number of records per topic regardless of how much source material is available.

**Fix**: Consider proportional generation — topics with more linked source parts should produce more records.

---

## 5. What Works Well (Don't Touch)

### UI Components

- **System Prompt Chain** — hierarchical prompt composition (Root → Parent → Leaf) in records view
- **Canvas ghost nodes** — topic-source linking with fade-in animation
- **FinetuneMetricsChart** — GRPO-aware multi-metric normalized lanes with loss tooltip
- **Dynamic job score columns** — eval/train columns with trend arrows in records table
- **Score distribution histogram** — automated diagnosis + GO/NO-GO verdict
- **Data Flow Banner** — visual pipeline with live counts and clickable stage navigation
- **Record detail sidebar** — conversation, scores, source context, all in one view
- **Coverage Distribution Dialog** — full-screen topic hierarchy with balance score
- **15-second polling** — real-time job progress with graceful failure handling
- **Color-coded eval scores** — red/orange/yellow/green thresholds in records table

### Pipeline Behavior

- **Parallel Docling extraction** — multiple PDFs submitted and polled simultaneously
- **Record format handling** — UI handles both gateway (`data.input.messages`) and OpenAI (`data.messages`) formats via `extractMessages()`
- **Topic grouping in records table** — parent headers with aggregate counts and child records
- **Multi-criteria grader** — weighted scoring with smooth GRPO gradient

---

## 6. Key Files Reference

### Dataset Pages
- `src/pages/datasets/index.tsx` → `DatasetsGrid.tsx` (list)
- `src/components/datasets/DatasetDetailContentV2.tsx` (detail layout)
- `src/components/datasets/DatasetOverviewPanel.tsx` (overview)

### Canvas & Topics
- `src/components/datasets/dataset-canvas/TopicHierarchyCanvas.tsx`
- `src/components/datasets/dataset-canvas/SourceGhostNodes.tsx`
- `src/components/datasets/dataset-canvas/topic-node/CollapsedTopicNode.tsx`

### Knowledge Sources
- `src/components/datasets/KnowledgeSourcesPanel.tsx`
- `src/components/datasets/sources-view/SourcesView.tsx`
- `src/components/datasets/KnowledgeSourceCard.tsx`

### Records
- `src/components/datasets/records-table/RecordsTable.tsx`
- `src/components/datasets/records-table/cells/ConversationThreadCell.tsx`
- `src/components/datasets/records-table/cells/QualityIndicator.tsx`
- `src/components/datasets/records-table/job-score-columns.ts`

### Evaluation
- `src/components/datasets/eval-dialog/ResultsTable.tsx`
- `src/components/datasets/eval-dialog/ScoreHistogram.tsx`
- `src/components/datasets/eval-dialog/VerdictBadge.tsx`
- `src/components/datasets/TopicEvalBreakdown.tsx`
- `src/services/adapters/finetune-api.ts` — `flattenEvaluationResults()`
- `src/services/eval-polling-manager.ts` — polling logic

### Training
- `src/components/finetune/FinetuneMetricsChart.tsx`
- `src/components/finetune/content/FinetuneJobsOverview.tsx`
- `src/components/finetune/content/EpochScoresTable.tsx`
- `src/components/finetune/content/FinetuneMetricsSection.tsx`

### Data Quality
- `src/components/datasets/CoverageDistribution.tsx`
- `src/components/datasets/DataFlowBanner.tsx`
- `src/components/datasets/InsightsPane.tsx`

---

## 7. Prioritized Action Plan

### Immediate (fix bugs)

1. Fix state tracker overwriting cancelled jobs (U14)
2. Hide empty eval columns in records table (U1)
3. Fix training view loading inconsistency (U2)

### Short-term (UX wins)

4. Add dead-weight record filter for score=0 records (U12)
5. Add topic grouping to eval results (U9)
6. Show grader reasons in eval result rows (U10)
7. Show partial eval progress in header bar (U13)
8. Add table renderer for structured source parts (U11)

### Skill improvements

9. Force incremental execution log updates (P1)
10. Improve extraction granularity consistency across documents (P2)
11. Add upload steps to checkpoint for crash recovery (P4)
12. Proportional record generation based on source volume (P7)

### Polish

13. Per-epoch aggregate summary table (U17)
14. Run-to-run eval comparison dialog (U19)
15. Workflow delete/archive for failed runs (U16)
16. Record-to-part lineage tracking (U22)
17. Sidebar tooltips for long topic names (U15)

---

## 8. Test Run Log

Concrete test results live in separate files. This section tracks which runs validated which findings.

| Date | Test Case | Docs | Records | Key Findings | Report |
|------|-----------|------|---------|--------------|--------|
| 2026-03-30 | Financial Document Analyzer | 3 SEC 10-K filings (Apple, Microsoft, Tesla) | 225 | U1-U6 bugs confirmed, P1-P7 identified, extraction varies 0.17-2.6 parts/page | `test-runs/2026-03-30-financial-doc-analyzer.md` |
| 2026-03-30 | Contract Translator | 11 legal documents | 205 | Training eval in progress | *(in progress)* |

> **To add a test run**: Create a file in `test-runs/` with extraction stats, topic hierarchy, eval scores, and any new issues found. Update this table and the issue lists above.

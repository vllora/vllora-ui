# UI vs Finetune Skill Pipeline — Alignment Audit

**Date:** 2026-03-30
**Coverage:** 91-93%
**Verdict:** Production-ready. One meaningful gap (dead-weight record filter).

---

## Pipeline Step Coverage

| Step | What Skill Produces | UI Component | Coverage |
|------|-------------------|-------------|----------|
| 1. Define Objective | Objective text, system prompt | Overview card (`DatasetOverviewPanel`) | ✅ Shows objective snippet |
| 2. Extract Documents | Knowledge sources with typed parts (text/table/image) | Knowledge tab (`KnowledgeSourcesPanel`, `SourcesView`) | ✅✅ Full — docs, parts, types, search, part viewer |
| 3. Build Topics | Topic hierarchy with parent/child, relations | Canvas (`TopicHierarchyCanvas`), explorer sidebar | ✅✅ Full — tree, coverage bars, ghost source nodes |
| 4. Generate Data | Training records (JSONL) with topic labels, source refs | Records table (`RecordsTable`, `ConversationThreadCell`) | ✅✅ Full — filterable, topic labels, quality scores |
| 5. Write Grader | JavaScript grader function | Evaluations tab (`EvaluationConfigPanel`) | ✅✅ Full — code editor, version history, dry-run |
| 6. Verify | Gateway state validation | Overview → Eval Health (`VerdictBadge`) | ✅ GO/NO-GO verdict badge |
| 7. Evaluate | Per-record scores, reasons, topic breakdowns | Eval dialog (`ResultsTable`, `TopicEvalBreakdown`, `ScoreHistogram`) | ✅✅ Full — scores, reasons, distributions, verdict |
| 8. Analyze | Coverage matrix, balance scores, insights | Insights tab (`InsightsPane`, `CoverageDistribution`) | ✅✅ Full — coverage matrix, balance, quality |
| 9. Train | Training jobs with metrics (reward, KL, loss, grad_norm) | Finetune tab (`FinetuneMetricsChart`, `EpochScoresTable`) | ✅✅ Full — multi-tab metrics, epoch trajectories |

---

## Detailed Component Assessment

### Dataset List Page (`/finetune`)

**Component:** `DatasetsGrid.tsx`

| Data | Displayed | Source |
|------|-----------|--------|
| Objective | 1-2 lines, truncated with tooltip | `datasetObjective` |
| Document count | Stat chip | `knowledgeSourceCount` |
| Topic count | Stat chip | `topicCount` |
| Record count | Stat chip | `recordsCount` |
| Eval status | Footer badge | `evalJobs[]` |
| Training status | Footer badge + model name | `trainingJobs[]` |

**Verdict:** Excellent — user sees all pipeline outputs at a glance.

### Dataset Detail Page (`/finetune/:workflowId`)

**Layout:**
```
Explorer Sidebar          Content Area
- Overview               [Selected section rendered here]
- Data (Records)
- Topics
- Knowledge
- Evaluations
- Finetune
- Insights
```

### Canvas View

**Component:** `TopicHierarchyCanvas.tsx`

- React Flow-based canvas with Dagre auto-layout
- Topic nodes show name, record count, coverage bar (color-coded: emerald/amber/red)
- Click node → zoom-to-inspect (1.4x) with 3-column bottom drawer:
  1. Info panel (stats, coverage, scores)
  2. Sources panel (linked knowledge parts)
  3. Records panel (sample records with scores)
- Source ghost nodes appear left of selected topic (linked parts with fade-in animation)

### Knowledge Sources View

**Component:** `KnowledgeSourcesPanel.tsx`, `SourcesView.tsx`

- Search-first interface across all sources and parts
- Per-document cards with expand/collapse, part count, type breakdown
- Part types: text (green), table (amber), image (purple) — consistent icons
- Single document mode: parts organized by `extractionPath` sections
- All sources mode: coverage matrix (topics x documents)
- Part viewer: title, type badge, metadata, rendered markdown content, "Referenced by Topics" chips

### Records Table

**Component:** `RecordsTable.tsx`

- Conversation thread display (system/user messages)
- Topic labels with breadcrumb path, color-coded
- Source references (span ID or "Generated" badge)
- Dynamic job score columns (Eval v1/v2/v3, Train v1/v2) with trend arrows
- Quality indicator: color-coded dot + score (emerald >= 0.8, amber >= 0.6, red < 0.6)
- Search, filter by topic/role/source, sort by score
- Record detail sidebar: conversation + scores + source context + details grid
- Analytics dialog: quality stats, message length histograms, topic distribution

### Evaluation Display

**Components:** `ResultsTable.tsx`, `TopicEvalBreakdown.tsx`, `ScoreHistogram.tsx`, `VerdictBadge.tsx`

- Per-record scores with expandable grader reasons
- Per-topic aggregate scores (mean, std, count) with quality badges
- Score distribution histogram (10 bins, color-coded, stats overlay)
- GO/NO-GO verdict: automated logic (mean >= 0.7 + std < 0.15 = GO)
- Multiple eval runs visible with comparison chart
- Evaluator version tracking (highlights staleness)
- CSV export, virtual rendering for large datasets

### Training Metrics

**Components:** `FinetuneMetricsChart.tsx`, `EpochScoresTable.tsx`

Multi-tab chart with normalized stacked lanes:

| Tab | Metrics |
|-----|---------|
| Reward | reward, reward_std, frac_reward_zero_std |
| Stability | loss, KL, grad_norm, learning_rate, clip_ratio |
| Completions | clipped_ratio, mean/min/max response length |
| Throughput | num_tokens/step, batch size |

- GRPO-aware: loss tooltip explains "unlike SFT, lower is NOT always better"
- Per-record epoch trajectories with delta columns
- Per-candidate scoring (RFT: multiple responses per prompt)
- Live badge + 15-second polling for active jobs

### Job Management

- Progress bars with completed/total/failed counts
- Cancel button for running jobs
- Download fine-tuned weights (tar.gz)
- Evaluator version tracking per job

### Data Flow Banner

**Component:** `DataFlowBanner.tsx`

Visual pipeline with live counts and stage navigation:
```
📄 Documents → 📋 Extracted → 🏷️ Topics → 💬 Records
   3 sources     19 parts      12 topics    150 records
```

Clickable stages, extracting state with shimmer animation.

---

## Gaps

### P0 — Directly Impacts Skill Workflow

| Gap | Why It Matters | Effort |
|-----|---------------|--------|
| **Dead-weight record filter (score = 0)** | Skill Step 8b+ identifies records scoring 0 and tells user to remove+regenerate. UI has no way to filter or highlight these. This is the feedback loop the skill depends on most. | 1-2h |
| **Per-epoch aggregate summary table** | Shows if training is working at a glance (Epoch / Avg Score / Std Dev / Improvement) without scanning all rows. | 1-2h |

### P1 — Improves Iteration Experience

| Gap | Why It Matters | Effort |
|-----|---------------|--------|
| **Run-to-run comparison dialog** | Compare eval v1 vs v2 side-by-side with per-topic deltas. Currently only final score comparison. | 3-4h |
| **Topic-part relation visibility** | Can't see which knowledge parts inform each topic. Important for debugging bad data. | 3-4h |
| **Record-to-part lineage** | Can't trace how a specific record was generated from source material. | 3-4h |
| **"Dead parts" indicator** | Parts extracted but never used in any training record — wasted extraction. | 2-3h |

### P2 — Nice-to-Have Polish

| Gap | Why It Matters | Effort |
|-----|---------------|--------|
| **Extraction quality metrics** | OCR confidence, completeness indicators, extraction error rates. | 2-3h |
| **Record diversity/similarity detection** | Find near-duplicate records, highlight coverage gaps. | 3-4h |
| **Iteration sequence UI** | "Iteration N" labels, prev/next navigation between runs. | 2h |
| **Record quality heatmap** | Records x Epochs matrix with color = score. Visual pattern recognition. | 2-3h |

---

## What's Already Great (Don't Touch)

- **Data Flow Banner** — visual pipeline with live counts and stage navigation
- **Canvas ghost nodes** — topic-source linking with fade-in animation
- **FinetuneMetricsChart** — GRPO-aware multi-metric normalized lanes
- **Dynamic job score columns** — eval/train columns with trend arrows in records table
- **Score distribution histogram** — automated diagnosis + GO/NO-GO verdict
- **15-second polling** — real-time job progress with graceful failure handling
- **Record detail sidebar** — conversation, scores, source context, all in one view
- **Coverage Distribution Dialog** — full-screen topic hierarchy with balance score

---

## Key Files Reference

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
- `src/components/datasets/eval-dialog/EvalRunsOverview.tsx`

### Training
- `src/components/finetune/FinetuneMetricsChart.tsx`
- `src/components/finetune/content/FinetuneJobsOverview.tsx`
- `src/components/finetune/content/EpochScoresTable.tsx`
- `src/components/finetune/content/PerRowDetailsSection.tsx`
- `src/components/finetune/content/FinetuneMetricsSection.tsx`

### Data Quality
- `src/components/datasets/CoverageDistribution.tsx`
- `src/components/datasets/DataFlowBanner.tsx`
- `src/components/datasets/InsightsPane.tsx` (coverage matrix, balance)

### Services & State
- `src/services/finetune-api.ts` (API types, data flattening)
- `src/services/eval-polling-manager.ts` (polling logic)
- `src/types/eval-job.ts` (job state management)

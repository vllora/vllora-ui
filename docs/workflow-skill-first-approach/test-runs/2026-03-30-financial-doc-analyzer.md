# Test Run: Financial Document Analyzer — 2026-03-30

**Workflow ID:** `b5897fb1-dcea-4236-b7e2-230f6cef9f15`
**Objective:** Extract key financial metrics from SEC 10-K filings with exact number accuracy and near-zero hallucination.

## Configuration

| Parameter | Value |
|-----------|-------|
| Test directory | `/Users/anhthuduong/Documents/GitHub/test-samples/financial-doc-analyzer` |
| Models | `claude sonnet` (agent), `gpt-4o-mini` (eval), `Qwen3.5-4B` (training) |
| Max turns | 200 |
| Documents | Apple 10-K (963KB, ~77p), Microsoft 10-K (3.2MB, ~200p), Tesla 10-K (1.7MB, ~200p) |

## Pipeline Timing

| Step | Time | Notes |
|------|------|-------|
| 1. Create Workflow | <1s | — |
| 2. Extract (3 PDFs, parallel) | ~21 min | Bottleneck — Docling API processing |
| 3. Topics + Relations | ~9 min | 24 topics, 136 relations |
| 4. Generate Records | ~3 min | 225 records |
| 5. Grader + Validate | ~3 min | Multi-criteria JS grader |
| 7. Eval + Training | Ongoing | Eval: 157/225 (avg 0.35), Training: epoch 1/8 |
| **Total data-prep** | **~35 min** | |

## Extraction Quality

| Document | Parts | Avg Length | Parts/Page | Tables | Unique Titles | Issues |
|----------|-------|-----------|------------|--------|---------------|--------|
| Apple 10-K | 198 | 2,295 | 2.6 | 36 | 177/198 (89%) | Clean |
| Microsoft 10-K | 345 | 1,752 | ~1.7 | 87 | 262/345 (76%) | 19 parts share "PART II Item 8" |
| Tesla 10-K | 35 | 14,627 | ~0.17 | 18 | 35/35 (100%) | Way too coarse — 6x avg length |

**Total: 578 parts.** No short parts (<50 chars), no Unicode encoding issues.

## Topic Hierarchy

9 parent categories, 15 leaf topics:

```
Income Statement Metrics (60 records)
├── Revenue Extraction (15) — 12 sources
├── Net Income Extraction (15) — 10 sources
├── Gross Profit and Gross Margin (15) — 10 sources
└── Operating Margin and Other Margins (15) — 9 sources
Balance Sheet Metrics (30)
├── Total Assets (15) — 5 sources
└── Liabilities and Stockholders Equity (15) — 4 sources
Cash Flow Statement Metrics (30)
├── Operating Cash Flow (15) — 7 sources
└── Capital Expenditures (15) — 6 sources
Per-Share Metrics (15)
└── Basic and Diluted EPS (15) — 7 sources
Year-over-Year Growth (15)
└── Revenue YoY Growth Rate (15) — 11 sources
GAAP vs Non-GAAP Reconciliation (15)
└── Identifying and Labeling GAAP vs Non-GAAP (15) — 6 sources
Forward Guidance (15)
└── Extracting Quantitative Guidance (15) — 5 sources
Missing and Unavailable Metrics (15)
└── Flagging Not-Reported Metrics (15) — 12 sources
Full 10-K Metrics Extraction (30)
├── Single-Company Full Extraction (15) — 16 sources
└── Multi-Company Comparison (15) — 16 sources
```

## Records

- 225 total, 15 per leaf topic (uniform distribution)
- 100% gateway format, 0 uncategorized
- 136 topic-source relations (all leaf topics have 4-16 relations)

## Evaluation (Partial — 157/225)

| Metric | Value |
|--------|-------|
| Average score | 0.35 |
| Distribution | 0.0: 10, 0.3: 115, 0.4: 7, 0.5: 3, 0.6: 2, 0.7: 1, 0.8: 1, 1.0: 11 |

77% scored 0.30 — expected for base model (gpt-4o-mini lacks filing content in-context). Common reason: "The model did not provide any financial figures from the 10-K filing."

## Training

| Parameter | Value |
|-----------|-------|
| Base model | Qwen3.5-4B |
| Output model | financial-doc-analyzer-v1 |
| Config | 8 epochs, lr 1e-06, LoRA 16, 8 candidates (GRPO) |
| Epoch 1 avg score | 0.40 |

## Issues Found

This test run confirmed/discovered the following issues (tracked in `ui-skill-alignment-audit.md`):

| Issue | Type | Details specific to this run |
|-------|------|------------------------------|
| P1 | Skill | Execution log only has Step 1 entries |
| P2 | Skill | Tesla: 35 parts for ~200 pages (0.17 parts/page) |
| P3 | Skill | Microsoft: 19 parts titled "PART II Item 8" |
| P5 | Skill | eval-001 completed with 0/225 rows |
| P6 | Skill | Old workflow `b5a54f3a` (Draft, 0 rows) lingered |
| P7 | Skill | All topics exactly 15 records despite varying source volume |
| U1 | UI | Overview shows "No evaluations" despite 2 evals |
| U2 | UI | Eval date shows "Jan 1 08:00 AM" |
| U3 | UI | Console: `[EvalJobManager] Poll failed for a3f544b9` (repeated 404s) |
| U4 | UI | All records show "Pass" at score 0.30 |
| U5 | UI | eval-141a8e column shows "—" for all rows |
| U6 | UI | Training view flips between chart and spinner on re-navigation |

## Grader

Multi-criteria weighted grader (`grader.js`):
- FIELD_ACCURACY (35%): exact number match vs source
- HALLUCINATION (30%): no invented numbers/dates/companies
- COMPLETENESS (20%): all requested metrics attempted, NOT_REPORTED for absent data
- FORMAT (15%): structured JSON with section/page references

Hard gate: hallucination markers (hedging language) cap the score.

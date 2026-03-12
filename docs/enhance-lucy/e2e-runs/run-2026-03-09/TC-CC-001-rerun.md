# TC-CC-001 Re-run: Full Pipeline (Mock Server)

**Status**: PASS
**Date**: 2026-03-09
**Purpose**: Verify full Lucy pipeline with mock finetune server (port 2209)

## Setup

- Frontend: `localhost:5173` with `VITE_BACKEND_PORT=2209`
- Mock server: `localhost:2209` with `--proxy-to 9090` (healthy eval + improving training, 0 polls)
- Real gateway: `localhost:9090` (proxied for non-finetune calls)
- Distri server: `localhost:8081` (real LLM for data generation)

## Test Steps

1. Created new dataset: "[E2E] A simple math tutor..." via New Experiment page
2. Lucy generated plan: "Set Up Math Tutor Training Pipeline" (6 topics, 150 records, 3 eval criteria)
3. Approved plan — Lucy executed all 6 steps automatically

## Pipeline Results

| Step | Status | Duration | Details |
|------|--------|----------|---------|
| Apply Topic Hierarchy | PASS | 4.6s | 6 topics in 3 categories |
| Generate Training Data | PASS | ~4m 13s | 150 records (real LLM via Distri) |
| Configure Evaluator | PASS | ~5s | 3 quality scoring criteria |
| Run Evaluation | PASS | instant | Mock eval completed (0 polls) |
| Generate Skill Package | PASS | ~5s | SKILL.md + resources downloaded |
| Start Fine-tune | PASS | instant | Mock training job created |

## Mock Server Verification

```
GET /mock/datasets → {
  "datasets": [{
    "datasetId": "mock-ds-001",
    "evalRunIds": ["mock-eval-001"],
    "trainingJobIds": ["mock-ft-002"]
  }],
  "total": 1
}
```

Confirmed: All finetune API calls routed through mock server at port 2209.

## Evaluation Results (Mock Data)

- Eval job: `eval-d44e90` — completed
- 150 samples, avg score 0.65 ± 0.06, verdict: WARNING
- Scores match healthy scenario: 0.55-0.75 range
- Lucy analysis: identified low variance, recommended refining grader

## Training Results (Mock Data)

- Job: `ft-ft-job` → `ft-job-001` (status: Succeeded)
- Model: Qwen 3 4B, Provider: test
- Epoch 4/7, Avg Score 0.61, 5 rows
- Score trend chart showing improving pattern (matching `improving` scenario)
- Weights download button available

## Key Assertions

- [x] Frontend routes API calls to mock server (port 2209), not real gateway
- [x] `/api/env` returns `VITE_BACKEND_PORT: 2209` (proxied correctly)
- [x] Real LLM generates training data (via Distri at 8081)
- [x] Mock eval completes instantly (0 poll delay)
- [x] Mock training completes instantly (0 poll delay)
- [x] Eval results rendered correctly in jobs view
- [x] Training epoch chart shows improving trend
- [x] Lucy auto-analyzes eval results (WARNING verdict)
- [x] Skill package generated and downloadable
- [x] Dataset uses [E2E] naming prefix for cleanup

---
id: TC-TRN-005
title: "Post-Training Dry Run Eval — Fine-tuned vs Base Model Comparison"
area: training
priority: P1
type: edge-case
mock-scenario: '{"evalScenario":"healthy","trainingScenario":"improving"}'
preconditions:
  - Dataset with completed training (improving pattern)
  - Fine-tuned model ID available
---

# TC-TRN-005: Post-Training Dry Run Eval

## Purpose

Verify the outer loop completion: after training completes with an improving pattern, Lucy recommends running a post-training dry run evaluation on the fine-tuned model to compare with the base model. This tests the `post_training_eval` execution step and the base-vs-fine-tuned comparison.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","trainingScenario":"improving"}'
```

## Preconditions

- Full pipeline completed through training (improving scenario)
- Training analysis shows "Improving" pattern
- Fine-tuned model ID available (from training completion)

## Steps

### Step 1: Complete training with improving pattern

- **Action**: Run the full pipeline through training
- **Hard checks**:
  - [ ] Training completes with "Improving" badge
  - [ ] Fine-tuned model ID present in training result
  - [ ] `analyze_training` recommends "Run Post-Training Eval"

### Step 2: Lucy recommends post-training eval

- **Action**: After training analysis, observe Lucy's recommendation
- **Hard checks**:
  - [ ] `next_action` is "deploy_eval" in training analysis
  - [ ] Lucy mentions running eval on the fine-tuned model
  - [ ] Lucy proposes to compare fine-tuned vs base model
- **Evidence**: screenshot of training analysis with deploy_eval recommendation

### Step 3: User accepts — post-training eval runs

- **Action**: Accept Lucy's proposal to run post-training eval
- **Hard checks**:
  - [ ] `post_training_eval` execution step triggers
  - [ ] Eval runs using the fine-tuned model ID (not base model)
  - [ ] Eval completes successfully

### Step 4: Lucy presents comparison results

- **Action**: Lucy analyzes post-training eval results
- **Hard checks**:
  - [ ] Analysis shows eval results for fine-tuned model
  - [ ] Comparison available with base model scores (from pre-training eval)
  - [ ] Fine-tuned model scores higher than base model
  - [ ] Lucy recommends deployment (scores improved)
- **Soft checks**:
  - [ ] Lucy mentions which topics improved most
  - [ ] Lucy provides confidence in deployment readiness
- **Evidence**: screenshot of comparison analysis

### Step 5: Verify iteration state updated

- **Action**: Check iteration state in IndexedDB
- **Hard checks**:
  - [ ] `outerLoop.postTrainingEvalId` is set
  - [ ] Phase updated to reflect post-training eval completion
- **Evidence**: IndexedDB state dump

## Pass Criteria

- Post-training eval runs on fine-tuned model
- Comparison shows improvement over base model
- Lucy recommends deployment based on comparison
- Iteration state tracks the outer loop correctly

## Fail Criteria

- Post-training eval runs on base model (wrong model)
- No comparison available between base and fine-tuned
- Lucy skips post-training eval and jumps to deployment
- Iteration state doesn't track outer loop

## Notes

This test requires the `post_training_eval` `ExecutionStepId` to be functional. The mock server needs to handle eval requests with a fine-tuned model ID and return healthy scores.

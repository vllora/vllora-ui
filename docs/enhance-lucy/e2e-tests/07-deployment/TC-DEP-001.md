---
id: TC-DEP-001
title: "Deployment - Happy Path: Deploy trained model"
area: deployment
priority: P0
type: happy-path
mock-scenario: '{"trainingScenario":"improving","trainingPollsBeforeComplete":1}'
preconditions:
  - Training completed successfully with improving pattern
  - Lucy has analyzed training and recommends deployment
---

# TC-DEP-001: Deployment - Happy Path

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","trainingScenario":"improving","evalPollsBeforeComplete":1,"trainingPollsBeforeComplete":1}'
```

## Preconditions

- Training completed with "improving" pattern
- Lucy recommended deployment after training analysis
- Fine-tuned model ID is set

## Steps

### Step 1: Lucy proceeds to deployment
- **Action**: After successful training analysis, Lucy advances to deploy step
- **Expected**: Lucy calls `deploy_model` or guides user through deployment
- **Hard checks**:
  - [ ] Lucy reaches the deployment step in the pipeline
  - [ ] Model ID from training is available for deployment
  - [ ] Weights download URL available (`GET /finetune/reinforcement-jobs/:id/weights/url`)
- **Soft checks**:
  - [ ] Lucy explains what deployment means
  - [ ] Lucy provides the model ID and download info
- **Evidence**: screenshot of deployment step

### Step 2: Deployment info visible in UI
- **Action**: Check deployment section in dataset detail
- **Hard checks**:
  - [ ] Deploy tab/section accessible
  - [ ] Model ID displayed
  - [ ] Deployment guidance visible (DeployGuidancePanel)
  - [ ] Workflow indicator shows pipeline complete or at deployment
- **Evidence**: screenshot of deployment panel

### Step 3: Model weights URL accessible
- **Action**: Verify weights download endpoint
- **Hard checks**:
  - [ ] Network request to `GET /finetune/reinforcement-jobs/:id/weights/url` succeeds
  - [ ] Response includes `download_url` and `expires_at`
  - [ ] URL is displayable in UI
- **Evidence**: network request log

### Step 4: Verify complete workflow state
- **Action**: Check final workflow state in IndexedDB
- **Hard checks**:
  - [ ] `deployment.modelId` is set
  - [ ] `deployment.deployedAt` is set
  - [ ] All previous steps preserved (topics, categorization, grader, eval, training)
  - [ ] Workflow step is at `deployment` or `completed`
- **Evidence**: IndexedDB state

## Pass Criteria

- Deployment step reached after successful training
- Model ID and weights URL available
- Complete workflow state preserved
- UI shows deployment guidance

## Fail Criteria

- Deployment step unreachable (workflow stuck)
- Model ID missing after training
- Previous workflow steps lost
- Deployment UI empty or shows stale data

## Agent Orchestration Checks

- [ ] Lucy only reached deployment after training analysis confirmed "improving"
- [ ] Lucy provided model info (not just "done!")
- [ ] Full pipeline completed in correct order: topics → categorize → coverage → grader → eval → training → deploy

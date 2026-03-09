---
id: TC-COV-001
title: "Coverage & Generation - Happy Path: Analyze coverage and generate synthetic data"
area: coverage
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Dataset with topics + categorized records
  - Lucy sidebar open
---

# TC-COV-001: Coverage & Generation - Happy Path

## Preconditions

- Dataset has topics configured and records categorized
- Some topics may have fewer records than others (natural imbalance)
- Lucy sidebar is open

## Steps

### Step 1: Lucy analyzes coverage
- **Action**: During plan execution, Lucy calls `analyze_coverage`
- **Expected**: Coverage analysis results appear
- **Hard checks**:
  - [ ] `analyze_coverage` tool execution card shows in chat
  - [ ] Tool result includes `balanceScore` (0-1)
  - [ ] Tool result includes `topicDistribution` with per-topic counts
  - [ ] `recommendations` array is populated if imbalance detected
- **Evidence**: screenshot of coverage analysis

### Step 2: Coverage distribution visible in UI
- **Action**: Check the dataset overview or coverage indicators
- **Expected**: Topic balance visualization appears
- **Hard checks**:
  - [ ] CoverageDistributionDialog or CoverageIndicator shows data
  - [ ] Per-topic record counts are visible
  - [ ] Balance score matches tool result
  - [ ] No topics show 0 records (all should have at least some)
- **Evidence**: screenshot of coverage view

### Step 3: Lucy generates synthetic data for low-coverage topics
- **Action**: If imbalance exists, Lucy calls `generate_synthetic_data` or `generate_initial_data`
- **Expected**: New records created for underrepresented topics
- **Hard checks**:
  - [ ] Generation tool execution card appears
  - [ ] `syntheticCount` increases after generation
  - [ ] Total record count increases
  - [ ] Generated records are assigned to the correct (low-coverage) topics
- **Soft checks**:
  - [ ] Lucy explains why synthetic data was generated
  - [ ] Lucy mentions which topics needed more data
- **Evidence**: screenshot of generation results

### Step 4: Verify balance improvement
- **Action**: Check coverage stats after generation
- **Hard checks**:
  - [ ] `balanceScore` improved (higher than before generation)
  - [ ] Previously low-coverage topics now have more records
  - [ ] `syntheticPercentage` is reasonable (not > 80% synthetic)
  - [ ] Total record count = original + synthetic
- **Evidence**: screenshot of updated coverage

### Step 5: Verify persistence
- **Action**: Refresh the page
- **Hard checks**:
  - [ ] Synthetic records survive refresh
  - [ ] Coverage stats unchanged after reload
  - [ ] `coverageGeneration` workflow state persists in IndexedDB
- **Evidence**: screenshot after refresh

## Pass Criteria

- Coverage analysis completes with valid metrics
- Synthetic data generated for underrepresented topics
- Balance score improves after generation
- All data persists across refresh

## Fail Criteria

- `balanceScore` is NaN or negative
- Generated records assigned to wrong topics
- Synthetic records lost on refresh
- Record count in UI doesn't match IndexedDB

## Agent Orchestration Checks

- [ ] Lucy analyzed coverage BEFORE generating synthetic data
- [ ] Lucy only generated data for topics that actually needed it (not all topics)
- [ ] Lucy advanced to grader config after coverage was satisfactory
- [ ] If balance was already good, Lucy skipped synthetic generation (didn't over-generate)

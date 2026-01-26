# 12 - Implementation Plan

[← Back to Index](./00_INDEX.md)

---

## Overview

This document outlines the detailed implementation plan for the RFT Fine-Tuning Pipeline feature. The plan leverages the existing `DatasetDetailContext` as a foundation and extends it with finetune-specific functionality.

**Estimated Phases:** 6
**Key Principle:** Maximize reuse of existing code while maintaining separation of concerns.

---

## Architecture Decision

### Approach: Wrapper Context Pattern

We will create a `FinetuneProcessContext` that wraps `DatasetDetailProvider` and adds finetune-specific state and handlers.

```
┌─────────────────────────────────────────────────────────────┐
│                  FinetuneProcessProvider                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              DatasetDetailProvider                       │ │
│  │  - dataset, records, topics                              │ │
│  │  - handleGenerateTraces, handleAutoTagRecords            │ │
│  │  - handleStartFinetune, etc.                             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  + validationReport, isValidating                            │
│  + coverageReport, balanceScore                              │
│  + graderConfig, testGraderResults                           │
│  + dryRunResults, isDryRunning                               │
│  + pipelineSteps (computed)                                  │
│  + handleValidateRecords, handleRunDryRun, etc.              │
└─────────────────────────────────────────────────────────────┘
```

**Why this approach:**
1. Reuses all existing dataset management logic
2. Keeps finetune-specific code isolated
3. Easy to test each layer independently
4. Existing components continue to work unchanged

---

## Phase 1: Data Validation & Health Indicator

**Goal:** Implement automatic validation that runs when data changes.

### 1.1 Create Validation Types

**File:** `src/types/validation-types.ts`

```typescript
export type ValidationError =
  | 'invalid_data_structure'
  | 'missing_input'
  | 'missing_messages'
  | 'empty_messages'
  | 'invalid_role'
  | 'no_user_message'
  | 'empty_user_message'
  | 'user_message_too_short'
  | 'orphan_tool_result'
  | 'missing_tool_call_id'
  | 'exceeds_max_tokens'
  | 'duplicate';

export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
  details?: string;
}

export interface ValidationConfig {
  minUserMessageLength: number;  // default: 10
  maxTokens: number;             // default: 8000
  allowedRoles: Set<string>;
}

export interface HygieneReport {
  timestamp: string;
  total: number;
  valid: number;
  rejected: number;
  rejectionRate: string;
  errorsByType: Record<ValidationError, number>;
  duplicatesRemoved: number;
  recommendations: string[];
}

export interface RecordValidationStatus {
  recordId: string;
  isValid: boolean;
  errors: ValidationError[];
  details?: string;
}
```

### 1.2 Create Validation Service

**File:** `src/lib/distri-dataset-tools/validation/validate-records.ts`

```typescript
// Core validation functions
export function validateRecord(record: DatasetRecord, config?: ValidationConfig): ValidationResult;
export function validateToolChain(messages: Message[]): ValidationResult;
export function estimateTokens(messages: Message[]): number;

// Batch validation
export async function validateRecordsBatch(
  records: DatasetRecord[],
  config?: ValidationConfig
): Promise<{
  validRecords: DatasetRecord[];
  invalidRecords: Map<string, ValidationError[]>;
  report: HygieneReport;
}>;
```

### 1.3 Add Validation State to Context

**Extend:** `DatasetDetailContext.types.ts`

```typescript
// Add to DatasetDetailContextType
validationReport: HygieneReport | null;
invalidRecordIds: Set<string>;
recordValidationErrors: Map<string, ValidationError[]>;
isValidating: boolean;

// Handlers
handleValidateRecords: () => Promise<void>;
```

### 1.4 Create Health Indicator Component

**File:** `src/components/finetune/HealthIndicator.tsx`

```typescript
interface HealthIndicatorProps {
  validCount: number;
  invalidCount: number;
  rejectionRate: string;
  onViewIssues: () => void;
}

// Shows: "✓ 1,008 valid records    ⚠ 34 invalid (3%)    [View Issues]"
```

### 1.5 Integration Points

- Run validation on initial dataset load
- Run validation after importing records
- Run validation after generating synthetic data
- Run validation after editing records
- Show Health Indicator in dataset canvas header

**Reused from DatasetDetailContext:**
- `records` state
- `loadDataset` / `refreshDataset`
- Event listeners for record changes

---

## Phase 2: Coverage Analysis

**Goal:** Analyze topic distribution and calculate balance score.

### 2.1 Create Coverage Types

**File:** `src/types/coverage-types.ts`

```typescript
export interface TopicDistribution {
  count: number;
  percentage: number;
  targetPercentage: number;
  gap: number;
  status: 'under' | 'ok' | 'over';
}

export interface CoverageReport {
  timestamp: string;
  totalRecords: number;
  validRecords: number;
  distribution: Record<string, TopicDistribution>;
  balanceScore: number;
  balanceRating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  recommendations: string[];
  uncategorizedCount: number;
}

export interface TargetDistribution {
  [topic: string]: number;  // target percentage (0-100)
}
```

### 2.2 Create Coverage Service

**File:** `src/lib/distri-dataset-tools/analysis/analyze-coverage.ts`

```typescript
export function analyzeCoverage(
  records: DatasetRecord[],
  hierarchy: TopicHierarchyConfig | null,
  targets?: TargetDistribution
): CoverageReport;

export function calculateBalanceScore(distribution: Record<string, number>): number;

export function generateCoverageRecommendations(
  distribution: Record<string, TopicDistribution>,
  totalRecords: number
): string[];

export function getBalanceRating(score: number): CoverageReport['balanceRating'];
```

### 2.3 Add Coverage State to Context

```typescript
// Add to FinetuneProcessContextType
coverageReport: CoverageReport | null;
targetDistribution: TargetDistribution | null;

// Handlers
handleAnalyzeCoverage: () => void;
handleSetTargetDistribution: (targets: TargetDistribution) => void;
```

### 2.4 Create Coverage Dashboard Component

**File:** `src/components/finetune/CoverageDashboard.tsx`

Features:
- Bar chart showing current vs target distribution
- Balance score with rating badge
- Topic list with status indicators
- Recommendations section
- "Generate to Fill Gaps" button

**Reused from DatasetDetailContext:**
- `records` state
- `dataset.topicHierarchy`
- `handleGenerateTraces` (for synthetic generation)

---

## Phase 3: Grader Configuration

**Goal:** Allow users to configure LLM Judge or Script graders.

### 3.1 Create Grader Types

**File:** `src/types/grader-types.ts`

```typescript
export interface LLMJudgeConfig {
  type: 'llm-judge';
  prompt: string;              // Mustache template
  outputSchema: JSONSchema;    // Expected response structure
  model: string;               // e.g., "gpt-4o-mini"
  temperature?: number;        // Default: 0
  maxTokens?: number;          // Default: 256
}

export interface ScriptGraderConfig {
  type: 'script';
  script: string;              // JavaScript code
}

export type GraderConfig = LLMJudgeConfig | ScriptGraderConfig;

export interface MultiGraderConfig {
  graders: GraderConfig[];
  weights: number[];           // Must sum to 1
}

export interface GraderTestResult {
  recordId: string;
  score: number;
  reasoning?: string;
  error?: string;
  responsePreview?: string;
}

export interface GraderTestReport {
  timestamp: string;
  graderConfig: GraderConfig;
  results: GraderTestResult[];
  stats: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };
}

// Mustache template variables
export type GraderTemplateVariables = {
  messages: string;           // JSON array of conversation
  response: string;           // Model's response text
  lastUserMessage: string;    // Last user message only
  tools: string;              // Available tools (JSON)
  toolCalls: string;          // Tool calls made (JSON)
  systemPrompt: string;       // System prompt if present
};
```

### 3.2 Create Grader Service

**File:** `src/lib/distri-dataset-tools/grader/grader-service.ts`

```typescript
// Execute grader on a single response
export async function executeGrader(
  response: string,
  record: DatasetRecord,
  config: GraderConfig
): Promise<{ score: number; reasoning?: string; error?: string }>;

// Execute LLM Judge
export async function executeLLMJudge(
  response: string,
  record: DatasetRecord,
  config: LLMJudgeConfig
): Promise<{ score: number; reasoning: string }>;

// Execute Script grader
export function executeScriptGrader(
  response: string,
  record: DatasetRecord,
  config: ScriptGraderConfig
): { score: number };

// Test grader on sample records
export async function testGraderOnSample(
  records: DatasetRecord[],
  config: GraderConfig,
  sampleSize?: number
): Promise<GraderTestReport>;

// Render mustache template
export function renderGraderPrompt(
  template: string,
  record: DatasetRecord,
  response: string
): string;
```

### 3.3 Create Grader Presets

**File:** `src/lib/distri-dataset-tools/grader/grader-presets.ts`

```typescript
export const GRADER_PRESETS = {
  quality: { ... },
  correctness: { ... },
  toolUsage: { ... },
  formatCompliance: { ... },
  conciseness: { ... },
};
```

### 3.4 Add Grader State to Context

```typescript
// Add to FinetuneProcessContextType
graderConfig: GraderConfig | MultiGraderConfig | null;
graderTestReport: GraderTestReport | null;
isTestingGrader: boolean;

// Handlers
handleSetGraderConfig: (config: GraderConfig | MultiGraderConfig) => void;
handleTestGrader: () => Promise<void>;
```

### 3.5 Create Grader Configuration UI

**Files:**
- `src/components/finetune/GraderConfigDialog.tsx` - Main dialog
- `src/components/finetune/LLMJudgeEditor.tsx` - Prompt + schema editor
- `src/components/finetune/ScriptGraderEditor.tsx` - JS code editor
- `src/components/finetune/GraderPresetSelector.tsx` - Preset dropdown
- `src/components/finetune/GraderTestResults.tsx` - Test results display

---

## Phase 4: Dry Run Validation

**Goal:** Test dataset + grader quality before training.

### 4.1 Create Dry Run Types

**File:** `src/types/dry-run-types.ts`

```typescript
export interface DryRunConfig {
  sampleSize: number;          // default: 300
  baseModel: string;           // default: "o4-mini"
  stratifyByTopic: boolean;    // default: true
}

export interface DryRunSample {
  recordId: string;
  topic?: string;
  prompt: Message[];
  response: string;
  score: number;
  reasoning?: string;
}

export interface DryRunStatistics {
  mean: number;
  std: number;
  median: number;
  min: number;
  max: number;
  percentiles: {
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
  scoreFractions: {
    gt0: number;      // % with score > 0
    eq1: number;      // % with score = 1
  };
}

export interface DryRunByTopic {
  [topic: string]: {
    mean: number;
    std: number;
    count: number;
    status: 'good' | 'attention' | 'problem';
  };
}

export interface DryRunDiagnosis {
  datasetQuality: 'good' | 'attention' | 'problem';
  graderQuality: 'good' | 'attention' | 'problem';
  verdict: 'GO' | 'CAUTION' | 'NO-GO';
  warnings: string[];
  recommendations: string[];
}

export interface DryRunReport {
  timestamp: string;
  config: DryRunConfig;
  samplesEvaluated: number;
  statistics: DryRunStatistics;
  distribution: Record<string, number>;  // bucket -> percentage
  byTopic: DryRunByTopic;
  diagnosis: DryRunDiagnosis;
  samples: DryRunSample[];              // For inspection
}
```

### 4.2 Create Dry Run Service

**File:** `src/lib/distri-dataset-tools/validation/dry-run-service.ts`

```typescript
// Main dry run execution
export async function runDryRun(
  records: DatasetRecord[],
  graderConfig: GraderConfig,
  config?: DryRunConfig,
  onProgress?: (progress: { completed: number; total: number }) => void
): Promise<DryRunReport>;

// Generate response from base model
export async function generateBaseModelResponse(
  prompt: Message[],
  model: string
): Promise<string>;

// Compute statistics from scores
export function computeDryRunStatistics(scores: number[]): DryRunStatistics;

// Compute per-topic breakdown
export function computeByTopic(
  samples: DryRunSample[]
): DryRunByTopic;

// Diagnose results
export function diagnoseDryRun(
  statistics: DryRunStatistics,
  byTopic: DryRunByTopic
): DryRunDiagnosis;

// Sample records for dry run (stratified by topic)
export function sampleRecordsForDryRun(
  records: DatasetRecord[],
  sampleSize: number,
  stratify: boolean
): DatasetRecord[];
```

### 4.3 Add Dry Run State to Context

```typescript
// Add to FinetuneProcessContextType
dryRunReport: DryRunReport | null;
isDryRunning: boolean;
dryRunProgress: { completed: number; total: number } | null;

// Handlers
handleRunDryRun: (config?: DryRunConfig) => Promise<void>;
handleCancelDryRun: () => void;
```

### 4.4 Create Dry Run UI

**Files:**
- `src/components/finetune/DryRunDialog.tsx` - Main dialog with config
- `src/components/finetune/DryRunProgress.tsx` - Progress indicator
- `src/components/finetune/DryRunResults.tsx` - Results display
- `src/components/finetune/ScoreDistributionChart.tsx` - Histogram
- `src/components/finetune/SampleInspector.tsx` - View high/low scores

---

## Phase 5: Pipeline State & Canvas UI

**Goal:** Create the visual pipeline canvas with step tracking.

### 5.1 Create Pipeline Types

**File:** `src/types/pipeline-types.ts`

```typescript
export type PipelineStepId =
  | 'extract'
  | 'topics'
  | 'coverage'
  | 'grader'
  | 'dryrun'
  | 'train'
  | 'deploy';

export type PipelineStepStatus =
  | 'waiting'      // Prerequisites not met
  | 'ready'        // Can be started
  | 'processing'   // Currently running
  | 'complete'     // Successfully finished
  | 'attention'    // Finished but needs review
  | 'failed';      // Error occurred

export interface PipelineStep {
  id: PipelineStepId;
  name: string;
  category: string;           // e.g., "INGESTION", "CLASSIFICATION"
  status: PipelineStepStatus;
  statusText: string;         // e.g., "7 topics • 1,008 records"
  progress?: number;          // 0-100 for processing state
  canRerun: boolean;
  isBlocked: boolean;
  blockedReason?: string;
}

export interface PipelineState {
  steps: PipelineStep[];
  currentStepId: PipelineStepId | null;
  overallProgress: number;    // 0-100
}
```

### 5.2 Create Pipeline State Computer

**File:** `src/lib/distri-dataset-tools/pipeline/compute-pipeline-state.ts`

```typescript
export function computePipelineState(
  dataset: Dataset | null,
  records: DatasetRecord[],
  validationReport: HygieneReport | null,
  coverageReport: CoverageReport | null,
  graderConfig: GraderConfig | null,
  dryRunReport: DryRunReport | null,
  trainingJob: FinetuneJob | null,
  loadingStates: {
    isValidating: boolean;
    isGeneratingHierarchy: boolean;
    isAutoTagging: boolean;
    isGeneratingTraces: boolean;
    isTestingGrader: boolean;
    isDryRunning: boolean;
    isTraining: boolean;
  }
): PipelineState;

// Individual step status computers
export function computeExtractStepStatus(...): PipelineStep;
export function computeTopicsStepStatus(...): PipelineStep;
export function computeCoverageStepStatus(...): PipelineStep;
export function computeGraderStepStatus(...): PipelineStep;
export function computeDryRunStepStatus(...): PipelineStep;
export function computeTrainStepStatus(...): PipelineStep;
export function computeDeployStepStatus(...): PipelineStep;
```

### 5.3 Create Canvas Components

**Files:**
- `src/components/finetune/PipelineCanvas.tsx` - Main canvas layout
- `src/components/finetune/PipelineStepCard.tsx` - Individual step node
- `src/components/finetune/PipelineConnector.tsx` - Lines between nodes
- `src/components/finetune/StepDetailPanel.tsx` - Bottom panel for selected step

### 5.4 Create Step-Specific Detail Panels

**Files:**
- `src/components/finetune/steps/ExtractStepPanel.tsx`
- `src/components/finetune/steps/TopicsStepPanel.tsx`
- `src/components/finetune/steps/CoverageStepPanel.tsx`
- `src/components/finetune/steps/GraderStepPanel.tsx`
- `src/components/finetune/steps/DryRunStepPanel.tsx`
- `src/components/finetune/steps/TrainStepPanel.tsx`
- `src/components/finetune/steps/DeployStepPanel.tsx`

---

## Phase 6: Integration & Polish

**Goal:** Wire everything together and polish the UX.

### 6.1 Create FinetuneProcessContext

**File:** `src/contexts/FinetuneProcessContext.tsx`

```typescript
interface FinetuneProcessContextType extends DatasetDetailContextType {
  // Validation
  validationReport: HygieneReport | null;
  invalidRecordIds: Set<string>;
  isValidating: boolean;
  handleValidateRecords: () => Promise<void>;

  // Coverage
  coverageReport: CoverageReport | null;
  targetDistribution: TargetDistribution | null;
  handleSetTargetDistribution: (targets: TargetDistribution) => void;

  // Grader
  graderConfig: GraderConfig | MultiGraderConfig | null;
  graderTestReport: GraderTestReport | null;
  isTestingGrader: boolean;
  handleSetGraderConfig: (config: GraderConfig | MultiGraderConfig) => void;
  handleTestGrader: () => Promise<void>;

  // Dry Run
  dryRunReport: DryRunReport | null;
  isDryRunning: boolean;
  dryRunProgress: { completed: number; total: number } | null;
  handleRunDryRun: (config?: DryRunConfig) => Promise<void>;

  // Pipeline
  pipelineState: PipelineState;
  selectedStepId: PipelineStepId | null;
  setSelectedStepId: (id: PipelineStepId | null) => void;
}

export function FinetuneProcessProvider({ children, datasetId, onBack }) {
  return (
    <DatasetDetailProvider datasetId={datasetId} onBack={onBack}>
      <FinetuneProcessInner>{children}</FinetuneProcessInner>
    </DatasetDetailProvider>
  );
}
```

### 6.2 Create Main Page Component

**File:** `src/pages/FinetuneDatasetPage.tsx`

```typescript
export function FinetuneDatasetPage({ datasetId }: { datasetId: string }) {
  return (
    <FinetuneProcessProvider datasetId={datasetId} onBack={...}>
      <div className="flex flex-col h-full">
        {/* Header with dataset name + Health Indicator */}
        <FinetuneHeader />

        {/* Main canvas area */}
        <div className="flex-1 flex">
          <PipelineCanvas />
        </div>

        {/* Detail panel at bottom */}
        <StepDetailPanel />

        {/* Dialogs */}
        <GraderConfigDialog />
        <DryRunDialog />
        <GenerateSyntheticDataDialog />
        {/* ... other dialogs */}
      </div>
    </FinetuneProcessProvider>
  );
}
```

### 6.3 Add Persistence

**File:** `src/services/finetune-db.ts`

```typescript
// Store grader config in dataset
export async function updateDatasetGraderConfig(
  datasetId: string,
  config: GraderConfig
): Promise<void>;

// Store dry run results
export async function saveDryRunReport(
  datasetId: string,
  report: DryRunReport
): Promise<void>;

export async function getDryRunReport(
  datasetId: string
): Promise<DryRunReport | null>;
```

### 6.4 Update Routing

**File:** Update `src/App.tsx` or router config

```typescript
// Add route
/finetune/:datasetId → FinetuneDatasetPage
```

---

## File Structure Summary

```
src/
├── types/
│   ├── validation-types.ts          # Phase 1
│   ├── coverage-types.ts            # Phase 2
│   ├── grader-types.ts              # Phase 3
│   ├── dry-run-types.ts             # Phase 4
│   └── pipeline-types.ts            # Phase 5
│
├── lib/distri-dataset-tools/
│   ├── validation/
│   │   ├── validate-records.ts      # Phase 1
│   │   └── dry-run-service.ts       # Phase 4
│   ├── analysis/
│   │   ├── analyze-coverage.ts      # Phase 2
│   │   └── (existing files)
│   ├── grader/
│   │   ├── grader-service.ts        # Phase 3
│   │   └── grader-presets.ts        # Phase 3
│   └── pipeline/
│       └── compute-pipeline-state.ts # Phase 5
│
├── contexts/
│   ├── DatasetDetailContext.tsx     # (existing - minimal changes)
│   └── FinetuneProcessContext.tsx   # Phase 6
│
├── components/finetune/
│   ├── HealthIndicator.tsx          # Phase 1
│   ├── CoverageDashboard.tsx        # Phase 2
│   ├── GraderConfigDialog.tsx       # Phase 3
│   ├── LLMJudgeEditor.tsx           # Phase 3
│   ├── ScriptGraderEditor.tsx       # Phase 3
│   ├── DryRunDialog.tsx             # Phase 4
│   ├── DryRunResults.tsx            # Phase 4
│   ├── ScoreDistributionChart.tsx   # Phase 4
│   ├── PipelineCanvas.tsx           # Phase 5
│   ├── PipelineStepCard.tsx         # Phase 5
│   ├── StepDetailPanel.tsx          # Phase 5
│   └── steps/
│       ├── ExtractStepPanel.tsx     # Phase 5
│       ├── TopicsStepPanel.tsx      # Phase 5
│       ├── CoverageStepPanel.tsx    # Phase 5
│       ├── GraderStepPanel.tsx      # Phase 5
│       ├── DryRunStepPanel.tsx      # Phase 5
│       ├── TrainStepPanel.tsx       # Phase 5
│       └── DeployStepPanel.tsx      # Phase 5
│
├── pages/
│   └── FinetuneDatasetPage.tsx      # Phase 6
│
└── services/
    └── finetune-db.ts               # Phase 6
```

---

## Reuse Summary

### From DatasetDetailContext (No Changes Needed)

| Feature | Used In |
|---------|---------|
| `dataset`, `records`, `sortedRecords` | All phases |
| `loadDataset`, `refreshDataset` | Phase 1 (validation triggers) |
| `dataset.topicHierarchy` | Phase 2 (coverage), Phase 5 (topics step) |
| `handleGenerateHierarchy` | Phase 5 (topics step) |
| `handleAutoTagRecords` | Phase 5 (topics step) |
| `handleGenerateTraces` | Phase 2 (fill gaps), Phase 5 (coverage step) |
| `handleStartFinetune` | Phase 5 (train step) |
| `selectedRecordIds` | Phase 2 (generate from selection) |
| Dialog states | All phases |
| Loading states | Phase 5 (pipeline status) |

### Minor Extensions to DatasetDetailContext

```typescript
// Add these fields to Dataset type
interface Dataset {
  // ... existing fields
  graderConfig?: GraderConfig | MultiGraderConfig;
  lastDryRunReport?: DryRunReport;
}

// Add dialog state
const [graderConfigDialog, setGraderConfigDialog] = useState(false);
```

---

## Testing Strategy

### Unit Tests

- `validate-records.test.ts` - All validation rules
- `analyze-coverage.test.ts` - Balance score, distribution
- `grader-service.test.ts` - Template rendering, script execution
- `dry-run-service.test.ts` - Statistics, diagnosis
- `compute-pipeline-state.test.ts` - Step status logic

### Integration Tests

- Validation runs on data load
- Coverage updates when records change
- Grader test executes correctly
- Dry run produces valid report
- Pipeline state reflects all components

### E2E Tests

- Complete flow: Upload → Topics → Coverage → Grader → Dry Run → Train
- Health indicator updates after import
- Coverage dashboard shows correct distribution
- Dry run GO/NO-GO decision

---

## Dependencies

### Required Packages (Check if already installed)

```json
{
  "recharts": "^2.x",           // For charts (coverage, dry run)
  "@monaco-editor/react": "^4.x", // For script editor
  "mustache": "^4.x"            // For grader template rendering
}
```

### API Dependencies

- Base model API for dry run response generation
- LLM API for grader evaluation (if using LLM Judge)
- Existing finetune API for training

---

## Migration Notes

### For Existing Users

- Existing datasets will show Health Indicator as "Validating..." on first load
- Grader config will be empty until configured
- Dry run results will be empty until first run
- Pipeline will show steps 1-2 complete if topics exist

### Data Migration

None required - new fields are optional and computed on demand.

---

## Next Steps

1. Review this plan with the team
2. Create feature branch: `feat/finetune-pipeline`
3. Start with Phase 1 (validation) as foundation
4. Iterate through phases, testing each before moving on
5. Final integration and polish in Phase 6

---

[← Back to Index](./00_INDEX.md)

export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
}

// Stored in 'records' object store
export interface DatasetRecord {
  id: string;
  datasetId: string;           // Foreign key to dataset
  data: unknown;               // Trace payload (DataInfo) or imported object
  metadata?: Record<string, unknown>; // Record-level metadata (provenance, flags)
  spanId?: string;             // For duplicate detection and keeping track of span (optional - undefined for generated data)
  topic?: string;              // Leaf topic name (look up full path in dataset's topicHierarchy)
  is_generated?: boolean;      // True for synthetic/generated traces
  evaluation?: DatasetEvaluation;
  createdAt: number;
  updatedAt: number;           // Last modified timestamp
}

export interface DataInfo {
  input: {
    messages?: any[]
    tools?: any[]
    tool_choice?: string
  }
  output: {
    messages?: any[] | any
    tool_calls?: any[]
    finish_reason?: string;
  }
}

// Topic hierarchy node for tree structure
export interface TopicHierarchyNode {
  id: string;
  name: string;
  children?: TopicHierarchyNode[];
  // Whether this node is selected/checked
  selected?: boolean;
}

// Topic hierarchy configuration stored at dataset level
export interface TopicHierarchyConfig {
  // User's description of dataset goals (used as context for LLM)
  goals?: string;
  // Hierarchy depth (1-5 levels)
  depth: number;
  // The generated topic hierarchy tree
  hierarchy?: TopicHierarchyNode[];
  // Timestamp when hierarchy was last generated
  generatedAt?: number;
}

// Evaluator type discriminator
export type EvaluatorType = 'llm_as_judge' | 'js';

// Base completion params shared by both evaluator types
export interface CompletionParams {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// LLM-as-a-Judge specific config
export interface LlmAsJudgeConfig {
  type: 'llm_as_judge';
  // Combined prompt template with evaluation instructions and variable placeholders
  promptTemplate: string;
  // JSON Schema for structured output
  outputSchema: string;
  // Completion parameters
  completionParams: CompletionParams;
  // Timestamp when config was last updated
  updatedAt?: number;
}

// JavaScript evaluator specific config
export interface JsEvaluatorConfig {
  type: 'js';
  // JavaScript code for evaluation
  script: string;
  // Completion parameters (for any LLM calls within the script)
  completionParams: CompletionParams;
  // Timestamp when config was last updated
  updatedAt?: number;
}

// Union type for evaluation config
export type EvaluationConfig = LlmAsJudgeConfig | JsEvaluatorConfig;

// Backend evaluator format for upload - LLM as Judge
export interface BackendLlmAsJudgeEvaluator {
  type: 'llm_as_judge';
  config: {
    prompt_template: string;
    output_schema: string;
    completion_params: {
      model_name: string;
      temperature?: number;
      max_tokens?: number;
    };
  };
}

// Backend evaluator format for upload - JavaScript
export interface BackendJsEvaluator {
  type: 'js';
  config: {
    script: string;
    completion_params: {
      model_name: string;
      temperature?: number;
      max_tokens?: number;
    };
  };
}

// Union type for backend evaluator
export type BackendEvaluator = BackendLlmAsJudgeEvaluator | BackendJsEvaluator;

// Coverage statistics stored on dataset for UI display
export interface CoverageStats {
  // Balance score (0-1, where 1 is perfectly balanced)
  balanceScore: number;
  // Balance rating for display
  balanceRating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  // Count of records per topic
  topicDistribution: Record<string, number>;
  // Number of records without topics
  uncategorizedCount: number;
  // Total number of records when calculated
  totalRecords: number;
  // When this was last calculated
  lastCalculatedAt: number;
}

// Dry run verdict
export type DryRunVerdict = 'GO' | 'NO-GO' | 'WARNING';

// Quality assessment for dataset or grader
export type QualityRating = 'good' | 'warning' | 'problem' | 'unknown';

// Per-topic dry run statistics
export interface TopicDryRunStats {
  mean: number;
  std: number;
  count: number;
  status: QualityRating;
}

// Score distribution buckets (0.0-0.2, 0.2-0.4, etc.)
export interface ScoreDistribution {
  '0.0-0.2': number;
  '0.2-0.4': number;
  '0.4-0.6': number;
  '0.6-0.8': number;
  '0.8-1.0': number;
}

// Percentile statistics
export interface Percentiles {
  p10: number;
  p25: number;
  p50: number; // median
  p75: number;
  p90: number;
}

// Diagnosis result from dry run analysis
export interface DryRunDiagnosis {
  // Overall quality assessments
  datasetQuality: QualityRating;
  graderQuality: QualityRating;
  // Final verdict
  verdict: DryRunVerdict;
  // Issues detected
  warnings: string[];
  // Actionable recommendations
  recommendations: string[];
  // Detailed issue descriptions for UI
  issues: {
    type: 'mean_low' | 'mean_high' | 'std_low' | 'std_high' | 'low_success' | 'too_easy' | 'topic_problem';
    severity: 'warning' | 'error';
    message: string;
    suggestion: string;
  }[];
}

// Dry run statistics stored on dataset for UI display
export interface DryRunStats {
  // When this was run
  evaluationRunId: string;
  lastRunAt: number;

  // Sample info
  samplesEvaluated: number;
  samplePercentage: number;

  // Core statistics
  statistics: {
    mean: number;
    std: number;
    median: number;
    min: number;
    max: number;
    percentiles: Percentiles;
    // Score fractions
    percentAboveZero: number;  // %>0
    percentPerfect: number;    // %=1.0
  };

  // Distribution for histogram visualization
  distribution: ScoreDistribution;

  // Per-topic breakdown
  byTopic: Record<string, TopicDryRunStats>;

  // Diagnosis and recommendations
  diagnosis: DryRunDiagnosis;

  // Sample results for manual review (top/bottom scores)
  sampleResults: {
    highest: Array<{ recordId: string; score: number; reason?: string }>;
    lowest: Array<{ recordId: string; score: number; reason?: string }>;
    aroundMean: Array<{ recordId: string; score: number; reason?: string }>;
  };
}

// Dataset state for tracking finetune progress
export type DatasetState = 'draft' | 'in_finetune' | 'completed';

// Consolidated state configuration for UI display
export interface DatasetStateConfig {
  value: DatasetState;
  label: string;
  className: string;
}

export const DATASET_STATE_CONFIG: DatasetStateConfig[] = [
  {
    value: 'draft',
    label: 'Draft',
    className: 'bg-muted text-muted-foreground',
  },
  {
    value: 'in_finetune',
    label: 'Processing',
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  {
    value: 'completed',
    label: 'Completed',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
];

// Helper to get config by state value
export function getDatasetStateConfig(state: DatasetState): DatasetStateConfig {
  return DATASET_STATE_CONFIG.find((c) => c.value === state) ?? DATASET_STATE_CONFIG[0];
}

// Stored in 'datasets' object store (metadata only, no records array)
export interface Dataset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  // Dataset state: draft (default), in_finetune, or completed
  state?: DatasetState;
  // Training objective describing specific behaviors to reinforce or suppress
  datasetObjective?: string;
  // Backend dataset ID from the cloud provider (set after first finetune upload)
  backendDatasetId?: string;
  // Topic hierarchy configuration
  topicHierarchy?: TopicHierarchyConfig;
  // LLM-as-a-Judge evaluation configuration
  evaluationConfig?: EvaluationConfig;
  // Coverage statistics for UI display (updated by analyze_coverage)
  coverageStats?: CoverageStats;
  // Dry run statistics for UI display (updated by run_dry_run)
  dryRunStats?: DryRunStats;
}

// Combined view for UI (dataset + its records)
export interface DatasetWithRecords extends Dataset {
  records: DatasetRecord[];
}

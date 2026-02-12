export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
  /** Latest dry-run evaluation score */
  dryRunScore?: number;
  /** Running average across all dry runs */
  dryRunAvg?: number;
  /** Number of dry runs that included this record */
  dryRunCount?: number;
  /** Latest finetune average score across epochs */
  finetuneScore?: number;
  /** Running average across all finetune jobs */
  finetuneAvg?: number;
  /** Number of finetune jobs that included this record */
  finetuneCount?: number;
}

// Stored in 'records' object store
export interface DatasetRecord {
  id: string;
  datasetId: string;           // Foreign key to dataset
  data: unknown;               // Trace payload (DataInfo) or imported object
  metadata?: Record<string, unknown>; // Record-level metadata (provenance, flags)
  spanId?: string;             // For duplicate detection and keeping track of span (optional - undefined for generated data)
  topic?: string;              // Leaf topic ID using path syntax (e.g., "Category/Subcategory/Topic")
  is_generated?: boolean;      // True for synthetic/generated traces
  sourceRecordId?: string;     // ID of parent record this was generated from (for variant tracking)
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
  /** Optional description explaining what this topic covers */
  description?: string;
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

// Sanitization hygiene report (subset of HygieneReport for storage)
export interface SanitizationStats {
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  validationRate: number; // 0-1
  errorsByType: Record<string, number>;
  recommendations: string[];
}

// Dataset statistics computed by get_dataset_stats tool
// Stored on dataset for UI display and agent reference
export interface DatasetStats {
  // Record counts
  totalRecords: number;
  generatedRecords: number;
  originalRecords: number;
  // Message stats
  totalMessages: number;
  averageMessagesPerRecord: number;
  // Topic info
  topicDistribution: Record<string, number>;
  topicCount: number;
  uncategorizedCount: number;
  // Configuration flags
  hasTopicHierarchy: boolean;
  hasEvalScript: boolean;
  // Sanitization/validation stats
  sanitization?: SanitizationStats;
  // When stats were last calculated
  lastCalculatedAt: number;
}

// Coverage statistics stored on dataset for UI display
export interface CoverageStats {
  // Balance score (0-1, where 1 is perfectly balanced) - undefined when no topics configured
  balanceScore?: number;
  // Balance rating for display - undefined when no topics configured
  balanceRating?: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
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

// Training configuration for finetune jobs (from sample or user-configured)
export interface SampleTrainingConfig {
  base_model?: string;
  training_config?: {
    learning_rate?: number;
    lora_rank?: number;
    epochs?: number;
    batch_size?: number;
  };
  inference_parameters?: {
    max_output_tokens?: number;
    temperature?: number;
    top_p?: number;
  };
}

// Dataset state for tracking finetune progress (persisted on Dataset)
export type DatasetState = 'draft' | 'in_finetune' | 'completed';

// =============================================================================
// Filter Group — 3 states for badge display and filtering
// =============================================================================

/** Filter group for header tabs and badge display */
export type DatasetFilterGroup = 'draft' | 'in_finetune' | 'completed';

export interface DatasetFilterGroupConfig {
  value: DatasetFilterGroup;
  label: string;
  className: string;
  tooltip: string;
}

export const DATASET_FILTER_CONFIG: DatasetFilterGroupConfig[] = [
  { value: 'draft', label: 'Draft', className: 'bg-muted text-muted-foreground', tooltip: 'Dataset is being prepared' },
  { value: 'in_finetune', label: 'Processing', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', tooltip: 'Evaluation or finetuning in progress' },
  { value: 'completed', label: 'Completed', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', tooltip: 'Finetuning completed' },
];

/** Get filter config by group value */
export function getFilterGroupConfig(group: DatasetFilterGroup): DatasetFilterGroupConfig {
  return DATASET_FILTER_CONFIG.find((c) => c.value === group) ?? DATASET_FILTER_CONFIG[0];
}

/**
 * Compute the filter group for a dataset from its workflow + dry run jobs.
 * Used for both badge display and tab filtering.
 */
export function computeFilterGroup(
  dataset: { state?: DatasetState; dryRunStats?: DryRunStats },
  workflow: { currentStep: string; training?: { status: string } | null } | null,
  activeDryRunCount: number,
): DatasetFilterGroup {
  // If explicitly set, honor it
  if (dataset.state === 'completed') return 'completed';

  if (workflow) {
    const { currentStep, training } = workflow;

    // Completed / deployed / training succeeded
    if (currentStep === 'completed' || currentStep === 'deployment' || training?.status === 'completed') {
      return 'completed';
    }

    // Active training
    if (training && ['pending', 'queued', 'running'].includes(training.status)) {
      return 'in_finetune';
    }
  }

  // Active evaluations
  if (activeDryRunCount > 0) return 'in_finetune';

  // Has eval results or workflow in progress
  if (dataset.dryRunStats) return 'in_finetune';
  if (workflow && workflow.currentStep !== 'not_started') return 'in_finetune';

  return 'draft';
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
  // JavaScript evaluation script for grading
  evalScript?: string;
  // Coverage statistics for UI display (updated by analyze_coverage)
  coverageStats?: CoverageStats;
  // Dry run statistics for UI display (updated by run_dry_run)
  dryRunStats?: DryRunStats;
  // Dataset statistics for UI display (updated by get_dataset_stats)
  stats?: DatasetStats;
  // Training configuration (from sample or user-configured)
  trainingConfig?: SampleTrainingConfig;
  // Auto-generated README markdown content
  readme?: string;
  // Last time README was updated
  readmeUpdatedAt?: number;
}

// Combined view for UI (dataset + its records)
export interface DatasetWithRecords extends Dataset {
  records: DatasetRecord[];
}

// =============================================================================
// Knowledge Sources (for data generation)
// =============================================================================

/** Type of knowledge source */
export type KnowledgeSourceType = 'pdf' | 'image' | 'url' | 'text' | 'markdown';

/** Classification of markdown file purpose */
export type MarkdownPurpose = 'knowledge' | 'process';

/** Processing status for knowledge sources */
export type KnowledgeSourceStatus = 'pending' | 'processing' | 'ready' | 'failed';

/** Progress info for knowledge source processing */
export interface KnowledgeSourceProgress {
  /** Current step description */
  step: string;
  /** Current step number (e.g., 1 of 5) */
  current?: number;
  /** Total steps */
  total?: number;
  /** Percentage complete (0-100) */
  percent?: number;
}

/** Extracted content from a knowledge source */
export interface ExtractedContent {
  /** Raw text content */
  text: string;
  /** Structured sections/chapters if applicable */
  sections?: Array<{
    title: string;
    content: string;
    level: number;
  }>;
  /** Extracted topics/concepts */
  topics?: string[];
  /** Metadata about the content */
  metadata?: Record<string, unknown>;
}

/** Knowledge source stored in IndexedDB */
export interface KnowledgeSource {
  id: string;
  datasetId: string;
  /** Original filename or URL */
  name: string;
  /** Type of source */
  type: KnowledgeSourceType;
  /** Processing status */
  status: KnowledgeSourceStatus;
  /** File size in bytes (for files) */
  size?: number;
  /** MIME type */
  mimeType?: string;
  /** Base64 encoded file content (for small files) or URL */
  content?: string;
  /** Extracted and processed content */
  extractedContent?: ExtractedContent;
  /** Error message if processing failed */
  error?: string;
  /** Current processing progress */
  progress?: KnowledgeSourceProgress;
  /** When the source was uploaded */
  createdAt: number;
  /** When processing completed */
  processedAt?: number;
}

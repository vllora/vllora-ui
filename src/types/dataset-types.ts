export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
  /** Latest dry-run evaluation score */
  evalScore?: number;
  /** Running average across all dry runs */
  dryRunAvg?: number;
  /** Number of dry runs that included this record */
  evalCount?: number;
  /** Timestamp of the latest dry-run evaluation */
  dryRunEvaluatedAt?: number;
  /** Model used for the latest dry-run evaluation */
  evalModel?: string;
  /** Latest finetune average score across epochs */
  finetuneScore?: number;
  /** Running average across all finetune jobs */
  finetuneAvg?: number;
  /** Number of finetune jobs that included this record */
  finetuneCount?: number;
  /** Timestamp of the latest finetune evaluation */
  finetuneEvaluatedAt?: number;
  /** Model used for the latest finetune evaluation */
  finetuneModel?: string;
}

// Stored in 'records' object store
export interface DatasetRecord {
  id: string;
  workflowId: string;           // Foreign key to dataset/workflow
  data: unknown;               // Trace payload (DataInfo) or imported object
  metadata?: Record<string, unknown>; // Record-level metadata (provenance, flags)
  spanId?: string;             // For duplicate detection and keeping track of span (optional - undefined for generated data)
  topic?: string;              // Leaf topic ID using path syntax (e.g., "Category/Subcategory/Topic")
  is_generated?: boolean;      // True for synthetic/generated traces
  sourceRecordId?: string;     // ID of parent record this was generated from (for variant tracking)
  evaluation?: DatasetEvaluation;
  /** Per-job evaluation scores — keyed by evaluation job ID.
   *  Coexists with `evaluation` (flat) for backward compat.
   *  - `evaluation` = UI display, running averages
   *  - `evaluations` = per-job scores for skill package JSONL output */
  evaluations?: Record<string, {
    score: number;
    model?: string;
    evaluatedAt?: number;
  }>;
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
  /** Composite refs to knowledge source chunks: "sourceId:chunkId" */
  sourceChunkRefs?: string[];
  /** Custom mustache template for system prompt construction. If absent, auto-generated from hierarchy. */
  promptTemplate?: string;
  /** LLM-generated natural language sentence describing this node's specialization. Cached per node, used to build natural system prompts instead of formulaic PAIR patterns. */
  normalizedPromptSegment?: string;
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

// Dataset statistics computed by get_workflow_state tool
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

// Knowledge-level coverage statistics (which chunks are covered by training data)
export interface KnowledgeCoverageStats {
  /** Total chunks across all knowledge sources */
  totalChunks: number;
  /** Chunks that appear in at least one record's sourceChunkRefs */
  coveredChunks: number;
  /** Coverage percentage (0-100) */
  coveragePercent: number;
  /** Per-source breakdown */
  bySource: Record<string, {
    sourceName: string;
    totalChunks: number;
    coveredChunks: number;
    coveragePercent: number;
    /** Chunk IDs not yet covered by any record */
    uncoveredChunkIds: string[];
  }>;
  /** Per-chunk usage count: "sourceId:chunkId" → record count */
  chunkUsageCounts: Record<string, number>;
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
export interface TopicEvalStats {
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
export interface EvalStats {
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
  byTopic: Record<string, TopicEvalStats>;

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
    response_candidates_count?: number;
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
  { value: 'draft', label: 'Draft', className: 'bg-muted text-muted-foreground', tooltip: 'Workflow is being set up — no active jobs running' },
  { value: 'in_finetune', label: 'Running', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', tooltip: 'A finetune or evaluation job is actively running' },
  { value: 'completed', label: 'Completed', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', tooltip: 'Finetuning completed successfully' },
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
  dataset: { state?: DatasetState; evalStats?: EvalStats },
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

    // Active training — something is actually running right now
    if (training && ['pending', 'queued', 'running'].includes(training.status)) {
      return 'in_finetune';
    }
  }

  // Active evaluations — something is actually running right now
  if (activeDryRunCount > 0) return 'in_finetune';

  // Everything else (has eval history, workflow in progress but idle, etc.) is draft
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
  // LLM-normalized "You are ..." role sentence derived from datasetObjective
  normalizedObjective?: string;
  // Topic hierarchy configuration
  topicHierarchy?: TopicHierarchyConfig;
  // JavaScript evaluation script for grading
  evalScript?: string;
  // Coverage statistics for UI display (updated by analyze_coverage)
  coverageStats?: CoverageStats;
  // Knowledge source coverage stats (which chunks are covered by training data)
  knowledgeCoverageStats?: KnowledgeCoverageStats;
  // Dry run statistics for UI display (updated by run_evaluation)
  evalStats?: EvalStats;
  // Dataset statistics for UI display (updated by get_workflow_state)
  stats?: DatasetStats;
  // Training configuration (from sample or user-configured)
  trainingConfig?: SampleTrainingConfig;
  // Auto-generated README markdown content
  readme?: string;
  // Last time README was updated
  readmeUpdatedAt?: number;
  // Whether the README was written by the agent or auto-generated from template
  readmeSource?: 'template' | 'agent';
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
  /** Extracted section headings from document structure */
  sectionHeadings?: string[];
  /** Metadata about the content */
  metadata?: Record<string, unknown>;
}

/** Knowledge source stored in IndexedDB */
export interface KnowledgeSource {
  id: string;
  workflowId: string;
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
  /** Optional user comment / objective for this source */
  comment?: string;
  /** Current processing progress */
  progress?: KnowledgeSourceProgress;
  /** Whether this source needs LLM-based re-extraction (Phase 2) */
  needsLlmExtraction?: boolean;
  /** Current extraction phase: 'basic' (page-based) or 'enhanced' (LLM-structured) */
  extractionPhase?: 'basic' | 'enhanced';
  /** When the source was uploaded */
  createdAt: number;
  /** When processing completed */
  processedAt?: number;
}

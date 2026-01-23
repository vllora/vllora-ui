// Finetune Process Types

export type NodeStatus = 'waiting' | 'running' | 'complete' | 'attention' | 'failed';

export type PipelineStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PipelineNode {
  id: PipelineStep;
  name: string;
  shortName: string;
  status: NodeStatus;
  summary: string;
  canRetrigger: boolean;
  category: 'data-prep' | 'validation' | 'training';
}

export interface PipelineEdge {
  from: PipelineStep;
  to: PipelineStep;
  status: 'inactive' | 'active' | 'running';
}

export interface DatasetRecord {
  id: string;
  messages: Message[];
  topic?: string;
  topicConfidence?: number;
  isValid: boolean;
  invalidReason?: string;
  isGenerated: boolean;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  parent?: string;
  recordCount: number;
  targetPercentage?: number;
}

export interface TopicHierarchy {
  topics: Topic[];
}

export interface GraderConfig {
  type: 'llm_judge' | 'script' | 'string_check' | 'multi';
  model?: string;
  prompt?: string;
  temperature?: number;
  script?: string;
  criteria?: GraderCriteria[];
}

export interface GraderCriteria {
  name: string;
  weight: number;
  description: string;
}

export interface DryRunResult {
  decision: 'GO' | 'NO_GO';
  sampleSize: number;
  mean: number;
  std: number;
  percentAboveZero: number;
  percentPerfect: number;
  distribution: number[];
  problemType?: 'scores_too_low' | 'no_variance' | 'scores_too_high';
}

export interface TrainingResult {
  modelId: string;
  improvement: number;
  baselineScore: number;
  finalScore: number;
  epochs: number;
  duration: number;
  topicImprovements?: Record<string, { baseline: number; final: number; improvement: number }>;
}

export interface DatasetSummary {
  id: string;
  name: string;
  recordCount: number;
  topicCount: number;
  balanceScore: number;
  currentStep: PipelineStep;
  status: 'in_progress' | 'attention' | 'training' | 'complete' | 'failed';
  statusText: string;
  improvement?: number;
  updatedAt: Date;
}

export interface Dataset {
  id: string;
  name: string;
  objective: string;
  records: DatasetRecord[];
  topicHierarchy: TopicHierarchy;
  graderConfig?: GraderConfig;
  dryRunResult?: DryRunResult;
  trainingResult?: TrainingResult;
  pipelineNodes: PipelineNode[];
  validRecordCount: number;
  invalidRecordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Trace {
  id: string;
  systemPrompt: string;
  model: string;
  turns: number;
  timestamp: Date;
  messages: Message[];
}

export interface DetectedPattern {
  title: string;
  icon: string;
  systemPrompt: string;
  capabilities: string[];
  toolCount: number;
}

export interface CoverageGap {
  topic: string;
  currentPercentage: number;
  targetPercentage: number;
  recordsNeeded: number;
}

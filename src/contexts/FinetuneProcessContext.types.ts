/**
 * Type definitions for FinetuneProcessContext
 *
 * Extends DatasetDetailContext with finetune-specific state and handlers.
 */

import type { DatasetDetailContextType } from './DatasetDetailContext';
import type {
  HygieneReport,
  ValidationError,
  HealthIndicatorData,
  ValidationConfig,
} from '@/types/validation-types';
import type {
  CoverageReport,
  TargetDistribution,
  GenerationTargets,
} from '@/types/coverage-types';

// Pipeline step identifiers
export type PipelineStepId =
  | 'extract'
  | 'topics'
  | 'coverage'
  | 'grader'
  | 'dryrun'
  | 'train'
  | 'deploy';

// Pipeline step status
export type PipelineStepStatus =
  | 'waiting'      // Prerequisites not met
  | 'ready'        // Can be started
  | 'processing'   // Currently running
  | 'complete'     // Successfully finished
  | 'attention'    // Finished but needs review
  | 'failed';      // Error occurred

// Pipeline step definition
export interface PipelineStep {
  id: PipelineStepId;
  name: string;
  category: string;
  status: PipelineStepStatus;
  statusText: string;
  progress?: number;
  canRerun: boolean;
  isBlocked: boolean;
  blockedReason?: string;
}

// Pipeline state
export interface PipelineState {
  steps: PipelineStep[];
  currentStepId: PipelineStepId | null;
  overallProgress: number;
}

// Finetune process context type (extends DatasetDetailContext)
export interface FinetuneProcessContextType extends DatasetDetailContextType {
  // Validation state
  validationReport: HygieneReport | null;
  invalidRecordIds: Set<string>;
  recordValidationErrors: Map<string, ValidationError[]>;
  isValidating: boolean;
  healthIndicatorData: HealthIndicatorData | null;

  // Validation handlers
  handleValidateRecords: () => Promise<void>;
  handleSetValidationConfig: (config: Partial<ValidationConfig>) => void;

  // Coverage state
  coverageReport: CoverageReport | null;
  targetDistribution: TargetDistribution | null;
  generationTargets: GenerationTargets | null;

  // Coverage handlers
  handleAnalyzeCoverage: () => void;
  handleSetTargetDistribution: (targets: TargetDistribution) => void;

  // Coverage dialog
  coverageDialog: boolean;
  setCoverageDialog: (open: boolean) => void;

  // Pipeline state (computed)
  pipelineState: PipelineState;
  selectedStepId: PipelineStepId | null;
  setSelectedStepId: (id: PipelineStepId | null) => void;

  // View issues dialog
  validationIssuesDialog: boolean;
  setValidationIssuesDialog: (open: boolean) => void;
}

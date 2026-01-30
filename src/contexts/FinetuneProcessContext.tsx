/**
 * FinetuneProcessContext
 *
 * Wraps DatasetDetailContext and adds finetune-specific state and handlers.
 * Manages the RFT pipeline: validation, coverage, grader, dry run, training.
 */

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  DatasetDetailProvider,
  DatasetDetailConsumer,
} from './DatasetDetailContext';
import { validateRecordsBatch } from '@/lib/distri-dataset-tools/validation';
import { analyzeCoverage, calculateGenerationTargets } from '@/lib/distri-dataset-tools/analysis/analyze-coverage';
import { createHealthIndicatorData } from '@/components/finetune/HealthIndicator';
import type { CoverageReport, GenerationTargets, TargetDistribution } from '@/types/coverage-types';
import type {
  FinetuneProcessContextType,
  PipelineState,
  PipelineStep,
  PipelineStepId,
} from './FinetuneProcessContext.types';
import type {
  HygieneReport,
  ValidationError,
  HealthIndicatorData,
  ValidationConfig,
} from '@/types/validation-types';
import { DEFAULT_VALIDATION_CONFIG } from '@/types/validation-types';

// ============================================================================
// Context
// ============================================================================

const FinetuneProcessContext = createContext<FinetuneProcessContextType | undefined>(undefined);

// ============================================================================
// Inner Provider (needs DatasetDetailContext)
// ============================================================================

function FinetuneProcessInner({ children }: { children: ReactNode }) {
  // Get all values from DatasetDetailContext
  const datasetContext = DatasetDetailConsumer();
  const { records, dataset, isLoading } = datasetContext;

  // Validation state
  const [validationReport, setValidationReport] = useState<HygieneReport | null>(null);
  const [invalidRecordIds, setInvalidRecordIds] = useState<Set<string>>(new Set());
  const [recordValidationErrors, setRecordValidationErrors] = useState<Map<string, ValidationError[]>>(new Map());
  const [isValidating, setIsValidating] = useState(false);
  const [validationConfig, setValidationConfig] = useState<ValidationConfig>(DEFAULT_VALIDATION_CONFIG);

  // Coverage state
  const [coverageReport, setCoverageReport] = useState<CoverageReport | null>(null);
  const [targetDistribution, setTargetDistribution] = useState<TargetDistribution | null>(null);
  const [generationTargets, setGenerationTargets] = useState<GenerationTargets | null>(null);

  // Pipeline state
  const [selectedStepId, setSelectedStepId] = useState<PipelineStepId | null>(null);

  // Dialog states
  const [validationIssuesDialog, setValidationIssuesDialog] = useState(false);
  const [coverageDialog, setCoverageDialog] = useState(false);

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Run validation on all records
   */
  const handleValidateRecords = useCallback(async () => {
    if (records.length === 0) {
      setValidationReport(null);
      setInvalidRecordIds(new Set());
      setRecordValidationErrors(new Map());
      return;
    }

    setIsValidating(true);
    try {
      const result = await validateRecordsBatch(records, validationConfig);
      setValidationReport(result.report);
      setInvalidRecordIds(new Set(result.invalidRecords.keys()));
      setRecordValidationErrors(result.invalidRecords);
    } catch (err) {
      console.error('Validation failed:', err);
    } finally {
      setIsValidating(false);
    }
  }, [records, validationConfig]);

  /**
   * Update validation config
   */
  const handleSetValidationConfig = useCallback((config: Partial<ValidationConfig>) => {
    setValidationConfig((prev) => ({ ...prev, ...config }));
  }, []);

  // Auto-validate when records change (debounced)
  useEffect(() => {
    if (isLoading) return;

    // Debounce validation to avoid running on every small change
    const timer = setTimeout(() => {
      handleValidateRecords();
    }, 500);

    return () => clearTimeout(timer);
  }, [records, isLoading, handleValidateRecords]);

  // ============================================================================
  // Coverage Analysis
  // ============================================================================

  /**
   * Analyze coverage distribution
   */
  const handleAnalyzeCoverage = useCallback(() => {
    if (!dataset?.topicHierarchy || records.length === 0) {
      setCoverageReport(null);
      setGenerationTargets(null);
      return;
    }

    // Get valid record IDs from validation
    const validIds = validationReport
      ? new Set(
        records
          .filter((r) => !invalidRecordIds.has(r.id))
          .map((r) => r.id)
      )
      : undefined;

    const report = analyzeCoverage({
      records,
      hierarchy: dataset.topicHierarchy,
      targets: targetDistribution || undefined,
      validRecordIds: validIds
    });

    setCoverageReport(report);

    // Calculate generation targets
    const targets = calculateGenerationTargets(report);
    setGenerationTargets(targets);
  }, [records, dataset, targetDistribution, validationReport, invalidRecordIds]);

  /**
   * Set target distribution for coverage
   */
  const handleSetTargetDistribution = useCallback(
    (targets: TargetDistribution) => {
      setTargetDistribution(targets);
    },
    []
  );

  // Auto-analyze coverage when hierarchy or records change
  useEffect(() => {
    if (isLoading || isValidating) return;

    // Debounce coverage analysis
    const timer = setTimeout(() => {
      handleAnalyzeCoverage();
    }, 600); // Slightly longer than validation

    return () => clearTimeout(timer);
  }, [records, dataset?.topicHierarchy, isLoading, isValidating, handleAnalyzeCoverage]);

  // ============================================================================
  // Computed State
  // ============================================================================

  /**
   * Health indicator data derived from validation report
   */
  const healthIndicatorData: HealthIndicatorData | null = useMemo(() => {
    if (isValidating) {
      return createHealthIndicatorData(0, 0, {}, true);
    }
    if (!validationReport) {
      return null;
    }
    return createHealthIndicatorData(
      validationReport.valid,
      validationReport.rejected + validationReport.duplicatesRemoved,
      validationReport.errorsByType,
      false
    );
  }, [validationReport, isValidating]);

  /**
   * Compute pipeline state from all available data
   */
  const pipelineState: PipelineState = useMemo(() => {
    const steps: PipelineStep[] = [];

    // Step 1: Extract Data
    const hasRecords = records.length > 0;
    steps.push({
      id: 'extract',
      name: 'Extract Data',
      category: 'INGESTION',
      status: hasRecords ? 'complete' : 'ready',
      statusText: hasRecords ? `${records.length} records` : 'No data',
      canRerun: true,
      isBlocked: false,
    });

    // Step 2: Topics & Category
    const hasHierarchy = !!dataset?.topicHierarchy?.hierarchy?.length;
    const topicsCount = dataset?.topicHierarchy?.hierarchy?.length || 0;
    const taggedCount = records.filter((r) => r.topic).length;
    steps.push({
      id: 'topics',
      name: 'Topics & Category',
      category: 'CLASSIFICATION',
      status: datasetContext.isGeneratingHierarchy || datasetContext.isAutoTagging
        ? 'processing'
        : hasHierarchy
          ? 'complete'
          : hasRecords
            ? 'ready'
            : 'waiting',
      statusText: hasHierarchy
        ? `${topicsCount} topics \u2022 ${taggedCount} tagged`
        : 'Not configured',
      progress: datasetContext.autoTagProgress
        ? (datasetContext.autoTagProgress.completed / datasetContext.autoTagProgress.total) * 100
        : undefined,
      canRerun: true,
      isBlocked: !hasRecords,
      blockedReason: !hasRecords ? 'Import data first' : undefined,
    });

    // Step 3: Coverage Analysis
    const validCount = validationReport?.valid || 0;
    steps.push({
      id: 'coverage',
      name: 'Coverage Analysis',
      category: 'DISTRIBUTION',
      status: datasetContext.isGeneratingTraces
        ? 'processing'
        : hasHierarchy && validCount > 0
          ? 'complete'
          : hasHierarchy
            ? 'ready'
            : 'waiting',
      statusText: validCount > 0 ? `${validCount} valid records` : 'Analyze distribution',
      progress: datasetContext.generationProgress
        ? (datasetContext.generationProgress / 100) * 100
        : undefined,
      canRerun: true,
      isBlocked: !hasHierarchy,
      blockedReason: !hasHierarchy ? 'Configure topics first' : undefined,
    });

    // Step 4: Grader Config
    const hasGrader = !!dataset?.evaluationConfig;
    steps.push({
      id: 'grader',
      name: 'Grader Config',
      category: 'EVALUATION RULES',
      status: hasGrader ? 'complete' : validCount > 0 ? 'ready' : 'waiting',
      statusText: hasGrader
        ? dataset?.evaluationConfig?.type === 'llm_as_judge'
          ? 'LLM Judge'
          : 'Script'
        : 'Not configured',
      canRerun: true,
      isBlocked: validCount === 0,
      blockedReason: validCount === 0 ? 'Need valid records' : undefined,
    });

    // Step 5: Dry Run
    steps.push({
      id: 'dryrun',
      name: 'Dry Run',
      category: 'VALIDATION',
      status: hasGrader ? 'ready' : 'waiting',
      statusText: 'Validate before training',
      canRerun: true,
      isBlocked: !hasGrader,
      blockedReason: !hasGrader ? 'Configure grader first' : undefined,
    });

    // Step 6: Train Model
    steps.push({
      id: 'train',
      name: 'Train Model',
      category: 'RFT TRAINING',
      status: datasetContext.isStartingFinetune
        ? 'processing'
        : hasGrader && validCount > 0
          ? 'ready'
          : 'waiting',
      statusText: 'Start RFT training',
      canRerun: true,
      isBlocked: !hasGrader || validCount === 0,
      blockedReason: !hasGrader
        ? 'Configure grader first'
        : validCount === 0
          ? 'Need valid records'
          : undefined,
    });

    // Step 7: Deploy
    steps.push({
      id: 'deploy',
      name: 'Deploy',
      category: 'DEPLOYMENT',
      status: 'waiting',
      statusText: 'Push to gateway',
      canRerun: true,
      isBlocked: true,
      blockedReason: 'Complete training first',
    });

    // Calculate overall progress
    const completedSteps = steps.filter((s) => s.status === 'complete').length;
    const overallProgress = (completedSteps / steps.length) * 100;

    // Find current step (first non-complete, non-waiting step)
    const currentStep = steps.find(
      (s) => s.status !== 'complete' && s.status !== 'waiting'
    );

    return {
      steps,
      currentStepId: currentStep?.id || null,
      overallProgress,
    };
  }, [
    records,
    dataset,
    validationReport,
    datasetContext.isGeneratingHierarchy,
    datasetContext.isAutoTagging,
    datasetContext.autoTagProgress,
    datasetContext.isGeneratingTraces,
    datasetContext.generationProgress,
    datasetContext.isStartingFinetune,
  ]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: FinetuneProcessContextType = {
    // Spread all DatasetDetailContext values
    ...datasetContext,

    // Validation state
    validationReport,
    invalidRecordIds,
    recordValidationErrors,
    isValidating,
    healthIndicatorData,

    // Validation handlers
    handleValidateRecords,
    handleSetValidationConfig,

    // Coverage state
    coverageReport,
    targetDistribution,
    generationTargets,

    // Coverage handlers
    handleAnalyzeCoverage,
    handleSetTargetDistribution,

    // Coverage dialog
    coverageDialog,
    setCoverageDialog,

    // Pipeline state
    pipelineState,
    selectedStepId,
    setSelectedStepId,

    // Dialog states
    validationIssuesDialog,
    setValidationIssuesDialog,
  };

  return (
    <FinetuneProcessContext.Provider value={value}>
      {children}
    </FinetuneProcessContext.Provider>
  );
}

// ============================================================================
// Provider (wraps DatasetDetailProvider)
// ============================================================================

interface FinetuneProcessProviderProps {
  children: ReactNode;
  datasetId: string;
  onBack: () => void;
  onSelectDataset?: (datasetId: string) => void;
}

export function FinetuneProcessProvider({
  children,
  datasetId,
  onBack,
  onSelectDataset,
}: FinetuneProcessProviderProps) {
  return (
    <DatasetDetailProvider
      datasetId={datasetId}
      onBack={onBack}
      onSelectDataset={onSelectDataset}
    >
      <FinetuneProcessInner>{children}</FinetuneProcessInner>
    </DatasetDetailProvider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function FinetuneProcessConsumer() {
  const context = useContext(FinetuneProcessContext);
  if (context === undefined) {
    throw new Error(
      'FinetuneProcessConsumer must be used within a FinetuneProcessProvider'
    );
  }
  return context;
}

// Re-export types
export type {
  FinetuneProcessContextType,
  PipelineState,
  PipelineStep,
  PipelineStepId,
  PipelineStepStatus,
} from './FinetuneProcessContext.types';

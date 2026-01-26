/**
 * FinetuneDatasetPage
 *
 * Main page for the RFT fine-tuning pipeline.
 * Uses FinetuneProcessContext to manage state and render the pipeline canvas.
 */

import { useCallback, useMemo } from 'react';
import {
  FinetuneProcessProvider,
  FinetuneProcessConsumer,
} from '@/contexts/FinetuneProcessContext';
import { PipelineCanvas } from './PipelineCanvas';
import type { PipelineStepId } from '@/contexts/FinetuneProcessContext.types';

// Import dialogs
import { EvaluationConfigDialog } from '@/components/datasets/evaluation-dialog/EvaluationConfigDialog';
import { DryRunDialog } from '@/components/datasets/DryRunDialog';
import { GenerateSyntheticDataDialog } from '@/components/datasets/GenerateSyntheticDataDialog';
import { TopicHierarchyDialog } from '@/components/datasets/topics-dialog/TopicHierarchyDialog';
import { IngestDataDialog } from '@/components/datasets/IngestDataDialog';
import { SanitizeDataDialog } from '@/components/datasets/SanitizeDataDialog';
import { CoverageDistributionDialog } from '@/components/datasets/CoverageDistributionDialog';
import { updateDatasetEvaluationConfig } from '@/services/datasets-db';
import { toast } from 'sonner';
import type { EvaluationConfig } from '@/types/dataset-types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings } from 'lucide-react';
import { getLeafTopicsFromHierarchy } from '@/components/datasets/record-utils';

interface FinetuneDatasetPageProps {
  datasetId: string;
  onBack: () => void;
  onSelectDataset?: (datasetId: string) => void;
}

/**
 * Main page component
 */
export function FinetuneDatasetPage({
  datasetId,
  onBack,
  onSelectDataset,
}: FinetuneDatasetPageProps) {
  return (
    <FinetuneProcessProvider
      datasetId={datasetId}
      onBack={onBack}
      onSelectDataset={onSelectDataset}
    >
      <FinetuneDatasetPageContent />
    </FinetuneProcessProvider>
  );
}

/**
 * Page content (uses FinetuneProcessContext)
 */
function FinetuneDatasetPageContent() {
  const ctx = FinetuneProcessConsumer();
  const {
    dataset,
    records,
    pipelineState,
    selectedStepId,
    setSelectedStepId,
    healthIndicatorData,
    setValidationIssuesDialog,
    validationReport,
    datasetId,
    onBack,
  } = ctx;

  // Calculate topic counts for coverage dialog (as Record)
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const record of records) {
      if (record.topic) {
        counts[record.topic] = (counts[record.topic] || 0) + 1;
      }
    }
    return counts;
  }, [records]);

  // Calculate topic counts as Map for TopicHierarchyDialog
  const topicCountsMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      if (record.topic) {
        counts.set(record.topic, (counts.get(record.topic) || 0) + 1);
      }
    }
    return counts;
  }, [records]);

  // Get available topics for GenerateSyntheticDataDialog
  const availableTopics = useMemo(() => {
    return getLeafTopicsFromHierarchy(dataset?.topicHierarchy?.hierarchy);
  }, [dataset?.topicHierarchy?.hierarchy]);

  // Handle step click
  const handleStepClick = useCallback(
    (stepId: PipelineStepId) => {
      setSelectedStepId(stepId);

      // Open corresponding dialog based on step
      switch (stepId) {
        case 'extract':
          ctx.setImportDialog(true);
          break;
        case 'topics':
          ctx.setTopicHierarchyDialog(true);
          break;
        case 'coverage':
          ctx.setCoverageDialog(true);
          break;
        case 'grader':
          // Open grader config - we'll need to add this dialog state
          // For now, we can use a placeholder
          break;
        case 'dryrun':
          ctx.setDryRunDialog(true);
          break;
        case 'train':
          ctx.handleStartFinetune();
          break;
        default:
          break;
      }
    },
    [ctx, setSelectedStepId]
  );

  // Handle save evaluation config
  const handleSaveEvaluationConfig = useCallback(
    async (config: EvaluationConfig) => {
      if (!dataset) return;
      try {
        await updateDatasetEvaluationConfig(dataset.id, config);
        toast.success('Grader configuration saved');
      } catch (err) {
        console.error('Failed to save evaluation config:', err);
        toast.error('Failed to save configuration');
        throw err;
      }
    },
    [dataset]
  );

  // Handle dry run
  const handleRunDryRun = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_sampleSize: number) => {
      // Mock dry run result for now
      // In real implementation, this would call the API
      await new Promise((resolve) => setTimeout(resolve, 2000));

      return {
        samples: records.slice(0, 10).map((r) => ({
          prompt: 'Sample prompt...',
          response: 'Sample response...',
          score: Math.random(),
          topic: r.topic,
        })),
        statistics: {
          mean: 0.45,
          std: 0.18,
          min: 0.1,
          max: 0.9,
          median: 0.44,
        },
        byTopic: Object.fromEntries(
          [...new Set(records.map((r) => r.topic).filter(Boolean))].map(
            (topic) => [topic, { mean: Math.random(), count: 10 }]
          )
        ),
        verdict: 'GO' as const,
        recommendations: [
          'Dataset quality looks good for training',
          'Consider generating more samples for underrepresented topics',
        ],
      };
    },
    [records]
  );

  if (!dataset) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading dataset...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{dataset.name}</h1>
            <p className="text-sm text-muted-foreground">
              RFT Fine-Tuning Pipeline
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <PipelineCanvas
          pipelineState={pipelineState}
          selectedStepId={selectedStepId}
          onSelectStep={handleStepClick}
          healthIndicatorData={healthIndicatorData}
          onViewValidationIssues={() => setValidationIssuesDialog(true)}
        />
      </div>

      {/* Dialogs */}
      <IngestDataDialog
        open={ctx.importDialog}
        onOpenChange={ctx.setImportDialog}
        datasetId={datasetId}
        onImport={ctx.handleImportRecords}
        currentRecordCount={records.length}
      />

      <TopicHierarchyDialog
        open={ctx.topicHierarchyDialog}
        onOpenChange={ctx.setTopicHierarchyDialog}
        initialConfig={dataset.topicHierarchy || undefined}
        recordCount={records.length}
        recordsWithTopicsCount={ctx.recordsWithTopicsCount}
        topicCounts={topicCountsMap}
        onApply={ctx.handleApplyTopicHierarchy}
        onGenerate={ctx.handleGenerateHierarchy}
        onAutoTag={ctx.handleAutoTagRecords}
        onClearRecordTopics={ctx.handleClearRecordTopics}
        onRenameTopic={ctx.handleRenameTopicInRecords}
        onDeleteTopic={ctx.handleDeleteTopicFromRecords}
        isGenerating={ctx.isGeneratingHierarchy}
        isAutoTagging={ctx.isAutoTagging}
        autoTagProgress={ctx.autoTagProgress}
      />

      <GenerateSyntheticDataDialog
        open={ctx.generateDataDialog}
        onOpenChange={ctx.setGenerateDataDialog}
        availableTopics={availableTopics}
        sampleRecords={records.slice(0, 10)}
        onGenerate={ctx.handleGenerateTraces}
        isGenerating={ctx.isGeneratingTraces}
      />

      <SanitizeDataDialog
        open={ctx.sanitizeDataDialog}
        onOpenChange={ctx.setSanitizeDataDialog}
        records={records}
        onSanitizationComplete={() => {
          // Re-validate after sanitization
          ctx.handleValidateRecords();
        }}
      />

      <CoverageDistributionDialog
        open={ctx.coverageDialog}
        onOpenChange={ctx.setCoverageDialog}
        topicCounts={topicCounts}
        totalRecords={records.length}
        topicHierarchy={dataset.topicHierarchy?.hierarchy}
      />

      <EvaluationConfigDialog
        open={selectedStepId === 'grader'}
        onOpenChange={(open) => {
          if (!open) setSelectedStepId(null);
        }}
        config={dataset.evaluationConfig}
        onSave={handleSaveEvaluationConfig}
      />

      <DryRunDialog
        open={ctx.dryRunDialog}
        onOpenChange={ctx.setDryRunDialog}
        recordCount={validationReport?.valid || records.length}
        hasGraderConfig={!!dataset.evaluationConfig}
        onRunDryRun={handleRunDryRun}
      />
    </div>
  );
}

export default FinetuneDatasetPage;

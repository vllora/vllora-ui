/**
 * DatasetDetailContentV2
 *
 * Main content component for dataset detail view:
 * - Header with dataset objective and insights
 * - Section tabs (Records / Evaluator / Jobs)
 * - Records section: Canvas or Table view with view mode toggle
 * - Evaluator section: Evaluation function configuration
 * - Jobs section: Finetune jobs list
 */

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { DatasetUtilityBar } from "./dataset-detail-header/DatasetUtilityBar";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { emitter } from "@/utils/eventEmitter";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { AssignTopicDialog } from "./AssignTopicDialog";
import { IngestDataDialog } from "./IngestDataDialog";
import { CreateDatasetDialog } from "./CreateDatasetDialog";
import { TopicHierarchyDialog } from "./topics-dialog";
import { GenerateSyntheticDataDialog } from "./GenerateSyntheticDataDialog";
import { SanitizeDataDialog } from "./SanitizeDataDialog";
import { DryRunDialog } from "./dry-run-dialog";
import { getLeafTopicsFromHierarchy } from "./record-utils";
import { getTopicCounts } from "./topic-hierarchy-utils";
import { DatasetDetailHeader } from "./dataset-detail-header";
import { DatasetMainContent } from "./DatasetMainContent";
import { DatasetNotFound } from "./DatasetNotFound";
import { LucyDatasetAssistant } from "./LucyDatasetAssistant";
import { EvaluationConfigPanel, type EvaluationConfigPanelRef } from "./evaluation-dialog/EvaluationConfigPanel";
import { quickFinetune } from "@/services/quick-finetune";
import { toast } from "sonner";
import { FinetuneJobsContent } from "@/components/finetune/content";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DryRunJobsProvider } from "@/contexts/DryRunJobsContext";
import type { CoverageStats } from "@/types/dataset-types";

export function DatasetDetailContentV2() {
  const {
    // Core data
    dataset,
    sortedRecords,
    isLoading,
    datasetId,

    // Navigation
    onBack,

    // Selection
    selectedRecordIds,

    // UI View state
    activeSection,
    setActiveSection,
    viewMode,
    setViewMode,
    selectedTopic,
    setSelectedTopic,
    selectedRecordId,
    setSelectedRecordId,
    selectedRecord,

    // Dialog states
    deleteConfirm,
    setDeleteConfirm,
    assignTopicDialog,
    setAssignTopicDialog,
    importDialog,
    setImportDialog,

    // Loading states
    isGeneratingTraces,
    isGeneratingHierarchy,
    isAutoTagging,
    autoTagProgress,

    // Topic hierarchy dialog
    topicHierarchyDialog,
    setTopicHierarchyDialog,

    // Generate data dialog
    generateDataDialog,
    setGenerateDataDialog,

    // Sanitize data dialog
    sanitizeDataDialog,
    setSanitizeDataDialog,

    // Dry run dialog
    dryRunDialog,
    setDryRunDialog,

    // Handlers
    handleUpdateRecordTopic,
    handleDeleteConfirm,
    handleBulkAssignTopic,
    handleGenerateTraces,
    handleSaveRecordData,
    handleGenerateHierarchy,
    handleApplyTopicHierarchy,
    handleAutoTagRecords,
    handleClearRecordTopics,
    handleClearSelectedRecordTopics,
    handleRenameTopicInRecords,
    handleDeleteTopicFromRecords,
    handleDeleteTopic,
    handleRenameTopic,
    handleCreateChildTopic,
    handleSaveEvaluationConfig,
    handleImportRecords,
    handleExport,
    recordsWithTopicsCount,
  } = DatasetDetailConsumer();

  // Finetune jobs sidebar
  const { setCurrentBackendDatasetId } = FinetuneJobsConsumer();

  // Set the backend dataset ID for filtering jobs when dataset changes
  useEffect(() => {
    if (dataset?.backendDatasetId) {
      setCurrentBackendDatasetId(dataset.backendDatasetId);
    } else {
      setCurrentBackendDatasetId(null);
    }
    return () => {
      setCurrentBackendDatasetId(null);
    };
  }, [dataset?.backendDatasetId, setCurrentBackendDatasetId]);

  // Ref for EvaluationConfigPanel to expose reset/copy methods
  const evaluatorPanelRef = useRef<EvaluationConfigPanelRef>(null);

  // Compute available topics from hierarchy for topic selection
  const availableTopics = useMemo(
    () => getLeafTopicsFromHierarchy(dataset?.topicHierarchy?.hierarchy),
    [dataset?.topicHierarchy?.hierarchy]
  );

  // Compute topic counts for hierarchy preview
  const topicCounts = useMemo(
    () => getTopicCounts(sortedRecords),
    [sortedRecords]
  );

  // Get selected records for synthetic data generation samples
  const selectedRecords = useMemo(
    () => sortedRecords.filter((record) => selectedRecordIds.has(record.id)),
    [sortedRecords, selectedRecordIds]
  );

  // Compute coverage stats for canvas - use dataset.coverageStats if available,
  // otherwise derive from dataset.stats (which has the same topicDistribution data)
  const canvasCoverageStats = useMemo((): CoverageStats | undefined => {
    // Prefer explicit coverageStats from analyze_coverage
    if (dataset?.coverageStats) {
      return dataset.coverageStats;
    }
    // Fallback to stats from get_dataset_stats
    if (dataset?.stats) {
      return {
        balanceScore: 0, // Not computed in stats, default to 0
        balanceRating: 'fair', // Default rating
        topicDistribution: dataset.stats.topicDistribution,
        uncategorizedCount: dataset.stats.uncategorizedCount,
        totalRecords: dataset.stats.totalRecords,
        lastCalculatedAt: dataset.stats.lastCalculatedAt,
      };
    }
    return undefined;
  }, [dataset?.coverageStats, dataset?.stats]);

  // Wrapper for auto-tagging that closes the dialog when done
  const handleAutoTagSelected = async () => {
    await handleAutoTagRecords();
    setAssignTopicDialog(false);
  };

  // Handle add topic from canvas
  const handleAddTopic = (_parentTopicName: string | null) => {
    // Open the topic hierarchy dialog for adding
    setTopicHierarchyDialog(true);
    // TODO: Pass the parent topic to pre-select in the dialog
  };

  // Handle generate for specific topic from canvas toolbar
  const handleGenerateForTopic = useCallback((topicName: string) => {
    // Emit event to trigger Lucy with a generate prompt for this topic
    emitter.emit("vllora_lucy_prompt", {
      prompt: `Generate more synthetic data for the topic "${topicName}". Focus on creating diverse examples that fit this topic category.`,
    });
  }, []);

  // Handle generate subtopics for a topic from canvas toolbar
  const handleGenerateSubtopics = useCallback((topicId: string | null) => {
    // Emit event to trigger Lucy with a subtopics generation prompt
    const prompt = topicId
      ? `Generate subtopics for the topic "${topicId}". Analyze the existing data and suggest meaningful child categories that would help organize the content better.`
      : `Generate top-level topics for this dataset. Analyze the existing data and suggest meaningful categories to organize the content.`;
    emitter.emit("vllora_lucy_prompt", { prompt });
  }, []);

  // Handle finetune button click - directly start finetune workflow
  const [isFinetuning, setIsFinetuning] = useState(false);

  const handleFinetune = useCallback(async () => {
    if (!datasetId || isFinetuning) return;

    setIsFinetuning(true);
    toast.info("Starting finetune...", { duration: 2000 });

    try {
      const result = await quickFinetune({ datasetId });

      if (result.success) {
        toast.success(`Finetune job started! Job ID: ${result.jobId}`, {
          duration: 5000,
        });
        // Emit event to notify Lucy about the started job
        emitter.emit("vllora_lucy_prompt", {
          prompt: `Finetune job ${result.jobId} has been started for this dataset. Please monitor its progress.`,
        });
      } else {
        toast.error(`Failed to start finetune: ${result.error}`, {
          duration: 5000,
        });
      }
    } catch (error) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        duration: 5000,
      });
    } finally {
      setIsFinetuning(false);
    }
  }, [datasetId, isFinetuning]);

  // Check if finetune conditions are met
  const hasRecords = sortedRecords.length > 0;
  const hasEvaluator = !!dataset?.evalScript;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-muted-foreground">Loading dataset...</span>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return <DatasetNotFound onBack={onBack} />;
  }

  return (
    <DryRunJobsProvider dataset={dataset}>
    <div className="flex-1 flex overflow-hidden">
      {/* Lucy Assistant on the left */}
      <LucyDatasetAssistant />

      {/* Main content on the right */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with dataset objective and insights */}
        <div className="px-4 py-2 border-b border-border">
          <DatasetDetailHeader />
        </div>

        {/* Combined section tabs + utility bar */}
        <DatasetUtilityBar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onExport={handleExport}
          hasRecords={hasRecords}
          hasEvaluator={hasEvaluator}
          onFinetune={handleFinetune}
          isFinetuning={isFinetuning}
          onEvaluatorReset={() => evaluatorPanelRef.current?.reset()}
          onEvaluatorCopy={() => evaluatorPanelRef.current?.copy()}
        />

        {/* Main content area - Records, Evaluator, or Jobs based on active section */}
        {activeSection === "records" && (
          <DatasetMainContent
            viewMode={viewMode}
            datasetId={datasetId}
            records={sortedRecords}
            topicHierarchy={dataset.topicHierarchy?.hierarchy}
            coverageStats={canvasCoverageStats}
            availableTopics={availableTopics}
            selectedTopic={selectedTopic}
            onSelectTopic={setSelectedTopic}
            selectedRecord={selectedRecord}
            selectedRecordId={selectedRecordId}
            onSelectRecordId={setSelectedRecordId}
            onAddTopic={handleAddTopic}
            onRenameTopic={handleRenameTopic}
            onDeleteTopic={handleDeleteTopic}
            onUpdateRecordTopic={handleUpdateRecordTopic}
            onDeleteRecord={(recordId) =>
              setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
            }
            onSaveRecord={handleSaveRecordData}
            onCreateChildTopic={handleCreateChildTopic}
            onGenerateForTopic={handleGenerateForTopic}
            onGenerateSubtopics={handleGenerateSubtopics}
            datasetObjective={dataset.datasetObjective}
          />
        )}
        {activeSection === "evaluator" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <EvaluationConfigPanel
              ref={evaluatorPanelRef}
              evalScript={dataset.evalScript}
              onSave={handleSaveEvaluationConfig}
              hideHeaderActions
            />
          </div>
        )}
        {activeSection === "jobs" && (
          <FinetuneJobsContent
            datasetId={datasetId}
            canCreateJob={hasRecords && hasEvaluator}
            trainingConfig={dataset.trainingConfig}
          />
        )}
      </div>

      {/* Dialogs */}
      <DeleteConfirmationDialog
        confirmation={deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Assign topic dialog */}
      <AssignTopicDialog
        open={assignTopicDialog}
        onOpenChange={setAssignTopicDialog}
        selectedCount={selectedRecordIds.size}
        onAssign={handleBulkAssignTopic}
        availableTopics={availableTopics}
        onAutoTag={handleAutoTagSelected}
        isAutoTagging={isAutoTagging}
        autoTagProgress={autoTagProgress}
        onClearTopics={handleClearSelectedRecordTopics}
      />

      {/* Import data dialog */}
      <IngestDataDialog
        open={importDialog}
        onOpenChange={setImportDialog}
        datasetId={dataset.id}
        onImport={handleImportRecords}
        currentRecordCount={sortedRecords.length}
      />

      {/* Create dataset dialog */}
      <CreateDatasetDialog />

      {/* Topic hierarchy dialog */}
      <TopicHierarchyDialog
        open={topicHierarchyDialog}
        onOpenChange={setTopicHierarchyDialog}
        initialConfig={dataset.topicHierarchy}
        onApply={handleApplyTopicHierarchy}
        onGenerate={handleGenerateHierarchy}
        isGenerating={isGeneratingHierarchy}
        onAutoTag={handleAutoTagRecords}
        isAutoTagging={isAutoTagging}
        autoTagProgress={autoTagProgress}
        recordCount={sortedRecords.length}
        topicCounts={topicCounts}
        recordsWithTopicsCount={recordsWithTopicsCount}
        onClearRecordTopics={handleClearRecordTopics}
        onRenameTopic={handleRenameTopicInRecords}
        onDeleteTopic={handleDeleteTopicFromRecords}
      />

      {/* Generate synthetic data dialog */}
      <GenerateSyntheticDataDialog
        open={generateDataDialog}
        onOpenChange={setGenerateDataDialog}
        availableTopics={availableTopics}
        sampleRecords={selectedRecords}
        onGenerate={handleGenerateTraces}
        isGenerating={isGeneratingTraces}
      />

      {/* Sanitize data dialog */}
      <SanitizeDataDialog
        open={sanitizeDataDialog}
        onOpenChange={setSanitizeDataDialog}
        records={sortedRecords}
      />

      {/* Dry run validation dialog */}
      <DryRunDialog
        open={dryRunDialog}
        onOpenChange={setDryRunDialog}
        recordCount={sortedRecords.length}
        hasGraderConfig={!!dataset?.evalScript}
      />
    </div>
    </DryRunJobsProvider>
  );
}

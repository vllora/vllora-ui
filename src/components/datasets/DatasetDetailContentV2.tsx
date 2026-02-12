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
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
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
import { getLeafTopicsFromHierarchy, computeCoverageStats, computeDatasetInsights } from "./record-utils";
import { getTopicCounts } from "./topic-hierarchy-utils";
import { RecordsAnalyticsDialog } from "./dataset-detail-header/detail-records-analytics-dialog";
import { DatasetDetailHeader } from "./dataset-detail-header";
import { DatasetMainContent } from "./DatasetMainContent";
import { DatasetNotFound } from "./DatasetNotFound";
import { LucyDatasetAssistant } from "./LucyDatasetAssistant";
import { EvaluationConfigPanel } from "./evaluation-dialog/EvaluationConfigPanel";
import { FinetuneConfigPanel } from "@/components/finetune/content/FinetuneConfigPanel";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DryRunJobsProvider } from "@/contexts/DryRunJobsContext";
import { ReadmeWithPlan } from "./ReadmeWithPlan";
import { KnowledgeSourcesPanel } from "./KnowledgeSourcesPanel";
import { PlanSection } from "./plan-section";
import { useDatasetReadme } from "@/hooks/useDatasetReadme";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { SetupPlanConsumer } from "@/contexts/SetupPlanContext";
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

  // Dialog state for records analytics
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);

  // Knowledge sources from context (single source of truth)
  const {
    count: knowledgeSourcesCount,
    isProcessing: docsProcessing,
    processingCount: docsProcessingCount,
  } = KnowledgeSourcesConsumer();

  // Setup plan state from context (single source of truth)
  const { isGeneratingPlan, hasPlanProposed } = SetupPlanConsumer();

  // Auto-switch to Plan tab when plan generation starts
  useEffect(() => {
    const handlePlanGenerating = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        setActiveSection("plan");
      }
    };

    // Handle tab switch events during execution
    const handleSwitchTab = ({ datasetId: switchDatasetId, tab }: { datasetId: string; tab: string }) => {
      if (switchDatasetId === datasetId) {
        setActiveSection(tab as any);
      }
    };

    emitter.on("vllora_setup_plan_generating", handlePlanGenerating);
    emitter.on("vllora_switch_tab", handleSwitchTab);
    return () => {
      emitter.off("vllora_setup_plan_generating", handlePlanGenerating);
      emitter.off("vllora_switch_tab", handleSwitchTab);
    };
  }, [datasetId, setActiveSection]);

  // Auto-switch to Plan tab if a persisted plan is found on mount
  const hasCheckedPersistedPlan = useRef(false);
  useEffect(() => {
    if (!hasCheckedPersistedPlan.current && hasPlanProposed) {
      hasCheckedPersistedPlan.current = true;
      setActiveSection("plan");
    }
  }, [hasPlanProposed, setActiveSection]);

  // Handle autoGeneratePlan query param (from new dataset with uploaded files)
  // Uses docsProcessing from KnowledgeSourcesContext — triggers when all docs finish
  const [searchParams, setSearchParams] = useSearchParams();
  const hasTriggeredAutoGenerate = useRef(false);
  const shouldAutoGenerate = searchParams.get("autoGeneratePlan") === "true";

  // When docs finish processing (or were never processing), trigger plan generation
  useEffect(() => {
    if (!shouldAutoGenerate || !datasetId || hasTriggeredAutoGenerate.current) return;
    if (docsProcessing) return; // Still processing — wait

    hasTriggeredAutoGenerate.current = true;
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("autoGeneratePlan");
    setSearchParams(newParams, { replace: true });

    toast.info("Lucy is creating a setup plan from your documents...", { duration: 4000 });
    emitter.emit("vllora_lucy_prompt", {
      prompt: `Please analyze the uploaded documents and create a setup plan for this dataset using the propose_setup_plan tool.`,
    });
  }, [docsProcessing, shouldAutoGenerate, searchParams, setSearchParams, datasetId]);

  // Timeout fallback: if docs are still processing after 60s, generate plan anyway
  useEffect(() => {
    if (!shouldAutoGenerate || !datasetId || hasTriggeredAutoGenerate.current || !docsProcessing) return;

    const timeoutId = setTimeout(() => {
      if (hasTriggeredAutoGenerate.current) return;
      hasTriggeredAutoGenerate.current = true;
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("autoGeneratePlan");
      setSearchParams(newParams, { replace: true });

      toast.warning("Document processing is taking longer than expected. Generating plan with available content...", { duration: 5000 });
      emitter.emit("vllora_lucy_prompt", {
        prompt: `Please analyze the uploaded documents and create a setup plan for this dataset using the propose_setup_plan tool.`,
      });
    }, 60000);

    return () => clearTimeout(timeoutId);
  }, [docsProcessing, shouldAutoGenerate, searchParams, setSearchParams, datasetId]);

  // README auto-generation hook
  const { readme, readmeUpdatedAt, regenerateReadme, exportReadme } = useDatasetReadme({
    dataset,
    records: sortedRecords,
    autoUpdate: true,
  });

  // Compute insights for stats cards
  const insights = useMemo(() => computeDatasetInsights(sortedRecords), [sortedRecords]);
  const cardCoverageStats = useMemo(() => computeCoverageStats({
    records: sortedRecords,
    topic_hierarchy: dataset?.topicHierarchy
  }), [sortedRecords, dataset?.topicHierarchy]);

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

  // Check if finetune conditions are met
  const hasRecords = sortedRecords.length > 0;
  const hasEvaluator = !!dataset?.evalScript;

  if (isLoading) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="w-[340px] border-r border-border flex flex-col shrink-0">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b">
            <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div className="space-y-2">
              <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-3 w-full bg-muted animate-pulse rounded" />
              <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header skeleton */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
            <div className="h-3 w-80 bg-muted animate-pulse rounded" />
          </div>
          {/* Tabs skeleton */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
          {/* Content skeleton */}
          <div className="flex-1 p-6 space-y-4">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
            <div className="space-y-2 mt-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
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

          {/* Section tabs */}
          <DatasetUtilityBar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            recordsCount={sortedRecords.length}
            hasEvaluator={hasEvaluator}
            knowledgeSourcesCount={knowledgeSourcesCount}
            hasPlanActivity={isGeneratingPlan || hasPlanProposed}
            docsProcessing={docsProcessing}
            isGeneratingPlan={isGeneratingPlan}
          />

          {/* Main content area - Records, Evaluator, or Jobs based on active section */}
          {activeSection === "records" && (
            <DatasetMainContent
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onExport={handleExport}
              datasetId={datasetId}
              records={sortedRecords}
              topicHierarchy={dataset.topicHierarchy?.hierarchy}
              coverageStats={canvasCoverageStats}
              availableTopics={availableTopics}
              overviewStats={{
                total: insights.totalRecords,
                original: insights.originalRecords,
                generated: insights.generatedRecords,
                topicDistribution: insights.topicDistribution,
                uncategorizedCount: insights.uncategorizedCount,
                balanceRating: cardCoverageStats?.balanceRating,
                balanceScore: cardCoverageStats?.balanceScore,
              }}
              leafTopicCount={availableTopics.length}
              onOverviewClick={() => setAnalyticsDialogOpen(true)}
              onImportClick={() => setImportDialog(true)}
              onDocsClick={() => setActiveSection("docs")}
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
              docsProcessing={docsProcessing}
              docsProcessingCount={docsProcessingCount}
              docsTotal={knowledgeSourcesCount}
            />
          )}
          {activeSection === "evaluator" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <EvaluationConfigPanel
                evalScript={dataset.evalScript}
                onSave={handleSaveEvaluationConfig}
                recordCount={sortedRecords.length}
              />
            </div>
          )}
          {activeSection === "jobs" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <FinetuneConfigPanel
                datasetId={datasetId}
                canStartJob={hasRecords && hasEvaluator}
                initialConfig={dataset.trainingConfig}
              />
            </div>
          )}
          {activeSection === "plan" && (
            <PlanSection
              datasetId={datasetId}
              isGeneratingPlan={isGeneratingPlan}
              className="flex-1"
            />
          )}
          {activeSection === "readme" && (
            <div className="flex-1 overflow-hidden">
              <ReadmeWithPlan
                datasetId={datasetId}
                readme={readme}
                readmeUpdatedAt={readmeUpdatedAt}
                onExport={exportReadme}
                onRegenerate={regenerateReadme}
                className="h-full"
              />
            </div>
          )}
          {activeSection === "docs" && (
            <KnowledgeSourcesPanel
              datasetId={datasetId}
              className="flex-1"
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


        {/* Records Analytics Dialog */}
        <RecordsAnalyticsDialog
          open={analyticsDialogOpen}
          onOpenChange={setAnalyticsDialogOpen}
          records={sortedRecords}
          recordStats={{
            total: insights.totalRecords,
            original: insights.originalRecords,
            generated: insights.generatedRecords,
            topicDistribution: insights.topicDistribution,
            uncategorizedCount: insights.uncategorizedCount,
            balanceRating: cardCoverageStats?.balanceRating,
            balanceScore: cardCoverageStats?.balanceScore,
          }}
        />
      </div>
    </DryRunJobsProvider>
  );
}

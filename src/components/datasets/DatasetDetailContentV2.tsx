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
import { Loader2 } from "lucide-react";
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
import { DryRunDialog } from "./dry-run-dialog";
import { getLeafTopicsFromHierarchy, computeCoverageStats, computeDatasetInsights } from "./record-utils";
import { getTopicCounts } from "./topic-hierarchy-utils";
import { DryRunEvaluationCard } from "./dataset-detail-header/evaluation-card";
import { FinetuneJobCard } from "./dataset-detail-header/finetune-job-card";
import { RecordsAnalyticsDialog } from "./dataset-detail-header/detail-records-analytics-dialog";
import { DatasetDetailHeader } from "./dataset-detail-header";
import { DatasetMainContent } from "./DatasetMainContent";
import { DatasetNotFound } from "./DatasetNotFound";
import { LucyDatasetAssistant } from "./LucyDatasetAssistant";
import { EvaluationConfigPanel } from "./evaluation-dialog/EvaluationConfigPanel";
import { FinetuneJobsContent } from "@/components/finetune/content";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DryRunJobsProvider } from "@/contexts/DryRunJobsContext";
import { ReadmeWithPlan } from "./ReadmeWithPlan";
import { KnowledgeSourcesPanel } from "./KnowledgeSourcesPanel";
import { PlanSection } from "./plan-section";
import { useDatasetReadme } from "@/hooks/useDatasetReadme";
import * as knowledgeDB from "@/services/knowledge-sources-db";
import { getProposedPlan } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";
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

  // Dialog state for records analytics
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);

  // Knowledge sources count for Docs tab badge
  const [knowledgeSourcesCount, setKnowledgeSourcesCount] = useState(0);

  // Fetch knowledge sources count
  const fetchKnowledgeSourcesCount = useCallback(async () => {
    if (!datasetId) return;
    try {
      const sources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);
      setKnowledgeSourcesCount(sources.length);
    } catch (error) {
      console.error("[DatasetDetailContentV2] Error fetching knowledge sources:", error);
    }
  }, [datasetId]);

  // Initial fetch and listen for updates
  useEffect(() => {
    fetchKnowledgeSourcesCount();

    // Listen for knowledge source updates
    const handleKnowledgeSourceUpdate = ({ datasetId: updatedDatasetId }: { datasetId: string }) => {
      if (updatedDatasetId === datasetId) {
        fetchKnowledgeSourcesCount();
      }
    };

    emitter.on("vllora_knowledge_source_updated", handleKnowledgeSourceUpdate);
    return () => {
      emitter.off("vllora_knowledge_source_updated", handleKnowledgeSourceUpdate);
    };
  }, [datasetId, fetchKnowledgeSourcesCount]);

  // Track setup plan generation state and auto-switch to Plan tab
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [hasPlanProposed, setHasPlanProposed] = useState(false);

  useEffect(() => {
    const handlePlanGenerating = ({ datasetId: generatingDatasetId }: { datasetId: string }) => {
      if (generatingDatasetId === datasetId) {
        setIsGeneratingPlan(true);
        setActiveSection("plan");
      }
    };

    const handlePlanProposed = ({ datasetId: planDatasetId }: { datasetId: string }) => {
      if (planDatasetId === datasetId) {
        setIsGeneratingPlan(false);
        setHasPlanProposed(true);
      }
    };

    const handlePlanDismissed = ({ datasetId: dismissedDatasetId }: { datasetId: string }) => {
      if (dismissedDatasetId === datasetId) {
        setIsGeneratingPlan(false);
        setHasPlanProposed(false);
      }
    };

    const handleWorkflowUpdated = ({ datasetId: updatedDatasetId }: { datasetId: string }) => {
      if (updatedDatasetId === datasetId) {
        setIsGeneratingPlan(false);
        setHasPlanProposed(false);
      }
    };

    // Handle tab switch events during execution
    const handleSwitchTab = ({ datasetId: switchDatasetId, tab }: { datasetId: string; tab: string }) => {
      if (switchDatasetId === datasetId) {
        setActiveSection(tab as any);
      }
    };

    emitter.on("vllora_setup_plan_generating", handlePlanGenerating);
    emitter.on("vllora_setup_plan_proposed", handlePlanProposed);
    emitter.on("vllora_setup_plan_dismissed", handlePlanDismissed);
    emitter.on("vllora_workflow_updated", handleWorkflowUpdated);
    emitter.on("vllora_switch_tab", handleSwitchTab);
    return () => {
      emitter.off("vllora_setup_plan_generating", handlePlanGenerating);
      emitter.off("vllora_setup_plan_proposed", handlePlanProposed);
      emitter.off("vllora_setup_plan_dismissed", handlePlanDismissed);
      emitter.off("vllora_workflow_updated", handleWorkflowUpdated);
      emitter.off("vllora_switch_tab", handleSwitchTab);
    };
  }, [datasetId, setActiveSection]);

  // Check IndexedDB for persisted proposed plan on initial mount only (survives page refresh)
  // Use a ref to ensure we only auto-switch once, not when user navigates between tabs
  const hasCheckedPersistedPlan = useRef(false);
  useEffect(() => {
    const checkPersistedPlan = async () => {
      if (!datasetId || hasCheckedPersistedPlan.current) return;
      hasCheckedPersistedPlan.current = true;

      const persistedPlan = await getProposedPlan(datasetId);
      if (persistedPlan) {
        console.log('[DatasetDetailContentV2] Found persisted plan, switching to Plan tab');
        setHasPlanProposed(true);
        setActiveSection("plan");
      }
    };

    checkPersistedPlan();
  }, [datasetId, setActiveSection]);

  // Handle autoGeneratePlan query param (from new dataset with uploaded files)
  const [searchParams, setSearchParams] = useSearchParams();
  const hasTriggeredAutoGenerate = useRef(false);

  useEffect(() => {
    const shouldAutoGenerate = searchParams.get("autoGeneratePlan") === "true";

    if (shouldAutoGenerate && datasetId && !hasTriggeredAutoGenerate.current) {
      hasTriggeredAutoGenerate.current = true;

      // Remove only the autoGeneratePlan param to prevent re-triggering
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("autoGeneratePlan");
      setSearchParams(newParams, { replace: true });

      // Small delay to let knowledge sources finish processing
      const timer = setTimeout(() => {
        // Notify user that plan generation is starting
        toast.info("Lucy is creating a setup plan from your documents...", {
          duration: 4000,
        });

        // Trigger Lucy to generate the setup plan
        emitter.emit("vllora_lucy_prompt", {
          prompt: `Please analyze the uploaded documents and create a setup plan for this dataset using the propose_setup_plan tool.`,
        });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams, datasetId]);

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

          {/* Section tabs */}
          <DatasetUtilityBar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            recordsCount={sortedRecords.length}
            hasEvaluator={hasEvaluator}
            knowledgeSourcesCount={knowledgeSourcesCount}
            hasPlanActivity={isGeneratingPlan || hasPlanProposed}
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
            <>
              {/* Dry Run Evaluation Card */}

              <div className="flex-1 flex flex-col overflow-hidden">
                {dataset?.evalScript && <div className="px-2 py-2">
                  <DryRunEvaluationCard
                    evalScript={dataset?.evalScript}
                    onConfigureClick={() => {/* Already on evaluator tab */ }}
                    onDryRunClick={() => setDryRunDialog(true)}
                  />
                </div>}
                <EvaluationConfigPanel
                  evalScript={dataset.evalScript}
                  onSave={handleSaveEvaluationConfig}
                  onOpenDryRun={() => setDryRunDialog(true)}
                />
              </div>
            </>
          )}
          {activeSection === "jobs" && (
            <>
              {/* Finetune Job Card */}
              <div className="px-4">
                <FinetuneJobCard
                  onStartClick={() => {/* Already on jobs tab */ }}
                  onJobClick={(jobId) => {
                    // Dispatch event to expand the specific job
                    if (jobId) {
                      window.dispatchEvent(
                        new CustomEvent("finetune-expand-job", {
                          detail: { jobId },
                        })
                      );
                    }
                  }}
                  canStartJob={hasRecords && hasEvaluator}
                />
              </div>
              <FinetuneJobsContent
                datasetId={datasetId}
                canCreateJob={hasRecords && hasEvaluator}
                trainingConfig={dataset.trainingConfig}
              />
            </>
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
          {activeSection === "deploy" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground text-sm">Deploy is coming soon.</p>
                <p className="text-muted-foreground text-xs">You will be able to deploy your fine-tuned models here.</p>
              </div>
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

        {/* Dry run validation dialog */}
        <DryRunDialog
          open={dryRunDialog}
          onOpenChange={setDryRunDialog}
          recordCount={sortedRecords.length}
          hasGraderConfig={!!dataset?.evalScript}
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

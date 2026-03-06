/**
 * DatasetDetailContentV2
 *
 * Main content component for dataset detail view.
 * Workspace tabs drive content: each tab maps to a content section
 * via TabContentRouter. The Explorer opens tabs, the header buttons
 * open tabs, and events (vllora_switch_tab / vllora_open_drawer)
 * open tabs for backward compatibility.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import { DatasetMainContent } from "./DatasetMainContent";
import { DatasetNotFound } from "./DatasetNotFound";
import { ExplorerSidebar, LucySidebar, TasksViewer, LogsViewer } from "./sidebars";
import { EvaluationConfigPanel } from "./evaluation-dialog/EvaluationConfigPanel";
import { FinetuneConfigPanel } from "@/components/finetune/content/FinetuneConfigPanel";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DryRunJobsProvider } from "@/contexts/DryRunJobsContext";
import { PlanPreview } from "./PlanPreview";
import { DatasetTitleBar, DatasetBreadcrumbBar } from "./DatasetBreadcrumbBar";
import { useDatasetReadme } from "@/hooks/useDatasetReadme";
import { DatasetOverviewPanel } from "./DatasetOverviewPanel";
import { DatasetReadmeViewer } from "./readme-viewer";
import { KnowledgeSourcesPanel } from "./KnowledgeSourcesPanel";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { PlanConsumer } from "@/contexts/PlanContext";
import { DeployGuidancePanel } from "./DeployGuidancePanel";
import { WorkspaceTabsProvider, WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { WorkspaceTabManager } from "./WorkspaceTabManager";
import {
  mapTabPathToSection,
  getDryRunJobIdFromPath,
  getInsightTypeFromPath,
  getFinetuneJobIdFromPath,
  getSkillFileFromPath,
  getDocumentSourceIdFromPath,
  type ContentSection,
} from "./TabContentRouter";
import { InsightsPane } from "./InsightsPane";
import { SkillFileViewer } from "./SkillFileViewer";
import { KnowledgeSourceViewer } from "./KnowledgeSourceViewer";
import { WorkspaceWelcome } from "./WorkspaceWelcome";
import type { CoverageStats, TopicHierarchyNode } from "@/types/dataset-types";

// Side-effect: registers plan approval event listener
import "@/lib/distri-finetune-tools/steps/execute-plan";

// ============================================================================
// WorkspaceTabBridge
// ============================================================================
// Invisible component rendered inside WorkspaceTabsProvider.
// Exposes openTab() to the parent via a ref, and syncs activeTabPath
// changes back to a parent state variable so the content area can react.

interface TabBridgeProps {
  openTabRef: React.MutableRefObject<(path: string, label?: string, preview?: boolean) => void>;
  onSectionChange: (section: ContentSection) => void;
  onActivePathChange: (path: string | null) => void;
}

function WorkspaceTabBridge({ openTabRef, onSectionChange, onActivePathChange }: TabBridgeProps) {
  const { activeTabPath, openTab } = WorkspaceTabsConsumer();

  // Expose openTab to parent via ref (stable across renders)
  openTabRef.current = openTab;

  // When active workspace tab changes, derive content section and notify parent
  useEffect(() => {
    onSectionChange(activeTabPath ? mapTabPathToSection(activeTabPath) : null);
    onActivePathChange(activeTabPath);
  }, [activeTabPath, onSectionChange, onActivePathChange]);

  return null;
}

/**
 * Map legacy tab names (used in events and old URLs) to explorer node paths.
 * Keeps backward compatibility while ensuring tabs match the explorer tree.
 */
const TAB_PATH_MAP: Record<string, { path: string; label: string }> = {
  records: { path: "data", label: "data" },
  evaluator: { path: "evaluations", label: "evaluations" },
  jobs: { path: "finetune", label: "finetune" },
};

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
    sourceDocumentFilter,
    setSourceDocumentFilter,
    handleUpdatePromptTemplate,
  } = DatasetDetailConsumer();

  // Workspace tab bridge: ref exposes openTab(), state receives tab-driven content section
  const openTabRef = useRef<(path: string, label?: string, preview?: boolean) => void>(() => {});
  // Stable callback that reads from the ref at call-time (avoids stale snapshot when passed as prop)
  const handleOpenTab = useCallback((path: string, label?: string, preview?: boolean) => {
    openTabRef.current(path, label, preview);
  }, []);
  const [tabContentSection, setTabContentSection] = useState<ContentSection>(null);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const selectedDryRunJobId = useMemo(
    () => getDryRunJobIdFromPath(activeTabPath),
    [activeTabPath]
  );
  const activeInsightType = useMemo(
    () => getInsightTypeFromPath(activeTabPath),
    [activeTabPath]
  );
  const selectedFinetuneJobId = useMemo(
    () => getFinetuneJobIdFromPath(activeTabPath),
    [activeTabPath]
  );
  const selectedDocumentSourceId = useMemo(
    () => getDocumentSourceIdFromPath(activeTabPath),
    [activeTabPath]
  );

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
    sources: knowledgeSources,
    count: knowledgeSourcesCount,
    isProcessing: docsProcessing,
    processingCount: docsProcessingCount,
    hasLoaded: knowledgeSourcesLoaded,
  } = KnowledgeSourcesConsumer();

  // Resolve source document filter name for UI display
  const sourceDocumentFilterName = sourceDocumentFilter
    ? knowledgeSources.find(s => s.id === sourceDocumentFilter)?.name ?? null
    : null;

  // plan state from context
  const {
    proposedPlan,
    planStatus,
    isPlanPreviewActive,
    planEditMode,
    isGeneratingPlan,
    isLoadingPlan,
    isExecuting,
    planErrorMessage,
    setIsPlanPreviewActive,
    setPlanEditMode,
    approvePlan,
    submitEditedPlan,
    dismissPlan,
  } = PlanConsumer();

  // URL sync: ?tab=plan.md&mode=edit
  const [searchParams, setSearchParams] = useSearchParams();
  const isInitialMount = useRef(true);

  // On mount: restore plan tab from URL
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      // Open the tab from URL (e.g., ?tab=plan.md), mapping legacy names
      const mapped = TAB_PATH_MAP[tabParam];
      if (mapped) {
        openTabRef.current(mapped.path, mapped.label, false);
      } else {
        openTabRef.current(tabParam, tabParam, false);
      }
      if (searchParams.get("mode") === "edit") {
        setPlanEditMode("edit");
      }
    }
    // Legacy: support old ?view=plan URL
    if (searchParams.get("view") === "plan") {
      openTabRef.current("plan.md", "plan.md", false);
      if (searchParams.get("mode") === "edit") {
        setPlanEditMode("edit");
      }
    }
    isInitialMount.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync content section → URL (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) return;
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (tabContentSection === "plan") {
        params.set("tab", "plan.md");
        if (planEditMode === "edit") {
          params.set("mode", "edit");
        } else {
          params.delete("mode");
        }
        params.delete("view"); // Remove legacy param
      } else {
        params.delete("tab");
        params.delete("view");
        params.delete("mode");
      }
      return params;
    }, { replace: true });
  }, [tabContentSection, planEditMode, setSearchParams]);

  // Auto-open plan tab when PlanContext sets isPlanPreviewActive
  // (e.g., when a plan is proposed via Lucy)
  useEffect(() => {
    if (isPlanPreviewActive) {
      openTabRef.current("plan.md", "plan.md", false);
      // Clear the flag — tab system now drives plan visibility
      setIsPlanPreviewActive(false);
    }
  }, [isPlanPreviewActive, setIsPlanPreviewActive]);

  // Handle tab switch events (backward compatibility for 17+ emit sites)
  // Maps old section names to workspace tab paths that match the Explorer tree
  useEffect(() => {

    const handleSwitchTab = ({ datasetId: switchDatasetId, tab }: { datasetId: string; tab: string }) => {
      if (switchDatasetId === datasetId) {
        const mapped = TAB_PATH_MAP[tab];
        if (mapped) {
          openTabRef.current(mapped.path, mapped.label, false);
        } else {
          openTabRef.current(tab, tab.charAt(0).toUpperCase() + tab.slice(1), false);
        }
      }
    };

    // Map old drawer opens to workspace tabs
    const handleOpenDrawer = ({ type }: { type: 'docs' | 'readme' }) => {
      if (type === 'docs') {
        openTabRef.current("documents", "Documents", false);
      } else if (type === 'readme') {
        openTabRef.current("readme.md", "readme.md", false);
      }
    };

    emitter.on("vllora_switch_tab", handleSwitchTab);
    emitter.on("vllora_open_drawer", handleOpenDrawer);
    return () => {
      emitter.off("vllora_switch_tab", handleSwitchTab);
      emitter.off("vllora_open_drawer", handleOpenDrawer);
    };
  }, [datasetId]);

  // 8.1: Show toast when data generation completes (Lucy action attribution)
  useEffect(() => {
    const handleGenProgress = (event: {
      datasetId: string;
      status: string;
      completed?: number;
      topicName?: string;
    }) => {
      if (event.datasetId !== datasetId) return;
      if (event.status === "completed") {
        const count = event.completed ?? 0;
        const topicStr = event.topicName ? ` for "${event.topicName}"` : "";
        toast.success(`Lucy generated ${count} record${count !== 1 ? "s" : ""}${topicStr}`, {
          action: {
            label: "View Records",
            onClick: () => openTabRef.current("data", "data", false),
          },
        });
      }
    };
    emitter.on("vllora_data_generation_progress", handleGenProgress);
    return () => {
      emitter.off("vllora_data_generation_progress", handleGenProgress);
    };
  }, [datasetId]);

  // Handle autoGeneratePlan query param (from new dataset with uploaded files)
  // Uses docsProcessing from KnowledgeSourcesContext — triggers when all docs finish
  const hasTriggeredAutoGenerate = useRef(false);
  const shouldAutoGenerate = searchParams.get("autoGeneratePlan") === "true";

  // Clean up autoGeneratePlan URL param when a plan exists or gets proposed.
  useEffect(() => {
    if (!shouldAutoGenerate) return;

    // If a plan already exists, clear the URL param immediately
    if (planStatus === 'proposed' || planStatus === 'approved' || planStatus === 'executing') {
      hasTriggeredAutoGenerate.current = true;
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("autoGeneratePlan");
      setSearchParams(newParams, { replace: true });
      return;
    }

    const handlePlanProposed = ({ datasetId: id }: { datasetId: string }) => {
      if (id === datasetId) {
        hasTriggeredAutoGenerate.current = true;
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("autoGeneratePlan");
        setSearchParams(newParams, { replace: true });
      }
    };

    emitter.on("vllora_plan_proposed", handlePlanProposed);
    return () => {
      emitter.off("vllora_plan_proposed", handlePlanProposed);
    };
  }, [shouldAutoGenerate, datasetId, searchParams, setSearchParams, planStatus]);

  // When docs finish processing (or were never processing), show "Generating plan..." UI.
  // The actual prompt to Lucy is handled by LucySidebar's auto-analysis (which triggers
  // on new datasets) — this effect only controls the plan.md loading indicator.
  useEffect(() => {
    if (!shouldAutoGenerate || !datasetId || hasTriggeredAutoGenerate.current) return;
    if (!knowledgeSourcesLoaded) return; // Haven't loaded from IndexedDB yet — wait
    if (docsProcessing) return; // Still processing — wait
    // Skip if a plan is already proposed/approved — another trigger already handled it
    if (planStatus === 'proposed' || planStatus === 'approved' || planStatus === 'executing') return;

    hasTriggeredAutoGenerate.current = true;

    // Emit generating event so plan.md shows "Generating plan..." immediately.
    // LucySidebar's auto-analysis will prompt Lucy to create the actual plan.
    emitter.emit("vllora_plan_generating", { datasetId });
    toast.info("Lucy is creating a plan from your documents...", { duration: 4000 });
  }, [docsProcessing, shouldAutoGenerate, datasetId, knowledgeSourcesLoaded, planStatus]);

  // Timeout fallback: if docs are still processing after 60s, show generating UI anyway.
  useEffect(() => {
    if (!shouldAutoGenerate || !datasetId || hasTriggeredAutoGenerate.current) return;
    if (!knowledgeSourcesLoaded || !docsProcessing) return;
    if (planStatus === 'proposed' || planStatus === 'approved' || planStatus === 'executing') return;

    const timeoutId = setTimeout(() => {
      if (hasTriggeredAutoGenerate.current) return;
      hasTriggeredAutoGenerate.current = true;

      emitter.emit("vllora_plan_generating", { datasetId });
      toast.warning("Document processing is taking longer than expected. Generating plan with available content...", { duration: 5000 });
    }, 60000);

    return () => clearTimeout(timeoutId);
  }, [docsProcessing, shouldAutoGenerate, datasetId, knowledgeSourcesLoaded, planStatus]);

  // README hook — agent-authored only, no auto-generation
  const { readme, readmeUpdatedAt, exportReadme } = useDatasetReadme({
    dataset,
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

  // Build chunk → record count map for the knowledge source viewer
  // Keys are raw refs "sourceId:chunkId", values are the number of records referencing that chunk
  const chunkRecordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of sortedRecords) {
      const refs = record.metadata?.sourceChunkRefs as string[] | undefined;
      if (!refs) continue;
      for (const ref of refs) {
        counts.set(ref, (counts.get(ref) || 0) + 1);
      }
    }
    return counts;
  }, [sortedRecords]);

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
    // Fallback to stats from get_dataset_state
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

  // Compute per-topic quality scores for canvas nodes.
  // Leaf topics get scores from their records directly.
  // Parent topics aggregate scores from all descendant leaves (since records
  // are only assigned to leaf topics, parents would otherwise show "Not evaluated").
  const topicQualityScores = useMemo(() => {
    const scores: Record<string, { avg: number; count: number; evaluated: number }> = {};
    const buckets: Record<string, { total: number; evalCount: number; sum: number }> = {};

    // Step 1: Bucket scores from records (leaf topics only)
    for (const record of sortedRecords) {
      const topic = record.topic;
      if (!topic) continue;
      if (!buckets[topic]) {
        buckets[topic] = { total: 0, evalCount: 0, sum: 0 };
      }
      buckets[topic].total++;
      const score = record.evaluation?.score;
      if (score !== undefined && score !== null) {
        buckets[topic].evalCount++;
        buckets[topic].sum += score;
      }
    }

    // Convert leaf buckets to scores
    for (const [topic, bucket] of Object.entries(buckets)) {
      scores[topic] = {
        avg: bucket.evalCount > 0 ? bucket.sum / bucket.evalCount : 0,
        count: bucket.total,
        evaluated: bucket.evalCount,
      };
    }

    // Step 2: Walk hierarchy bottom-up to aggregate parent scores
    const hierarchy = dataset?.topicHierarchy?.hierarchy;
    if (hierarchy) {
      const aggregate = (node: TopicHierarchyNode): { count: number; evaluated: number; sum: number } => {
        const key = node.id || node.name;
        const leaf = buckets[key] || (node.id !== node.name ? buckets[node.name] : undefined);
        let totalCount = leaf?.total ?? 0;
        let totalEval = leaf?.evalCount ?? 0;
        let totalSum = leaf?.sum ?? 0;

        if (node.children) {
          for (const child of node.children) {
            const childAgg = aggregate(child);
            totalCount += childAgg.count;
            totalEval += childAgg.evaluated;
            totalSum += childAgg.sum;
          }
        }

        // Set aggregated score for parent nodes (overwrite if already a leaf)
        const name = node.name || node.id;
        if (name && totalCount > 0) {
          scores[name] = {
            avg: totalEval > 0 ? totalSum / totalEval : 0,
            count: totalCount,
            evaluated: totalEval,
          };
        }

        return { count: totalCount, evaluated: totalEval, sum: totalSum };
      };

      for (const node of hierarchy) {
        aggregate(node);
      }
    }

    return scores;
  }, [sortedRecords, dataset?.topicHierarchy?.hierarchy]);

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

  // 5.3: Preserve context across view switches
  const handleViewModeChange = useCallback((mode: "canvas" | "table") => {
    if (mode === "table" && selectedTopic) {
      // Switching from canvas to table — focus the selected topic after mount
      setViewMode(mode);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("vllora_focus_topic", {
          detail: { topicId: selectedTopic, topicName: selectedTopic },
        }));
      }, 150);
    } else if (mode === "canvas" && selectedTopic) {
      // Switching from table to canvas — keep the selected topic
      setViewMode(mode);
    } else {
      setViewMode(mode);
    }
  }, [selectedTopic, setViewMode]);

  // Check if finetune conditions are met
  const hasRecords = sortedRecords.length > 0;
  const hasEvaluator = !!dataset?.evalScript;

  // For empty datasets with no plan, seed the tab system with plan.md so the user
  // sees Lucy's plan creation immediately instead of an empty Overview.
  // MUST be before early returns to satisfy React's Rules of Hooks.
  const hasUrlTab = !!searchParams.get("tab") || !!searchParams.get("view");
  const emptyDatasetInitialTabs = useMemo(() => {
    if (hasUrlTab) return undefined;
    const isEmpty = sortedRecords.length === 0;
    const hasNoPlan = !proposedPlan && planStatus !== "proposed" && planStatus !== "approved";
    if (isEmpty && hasNoPlan) {
      return [{ path: "plan.md", label: "plan.md" }];
    }
    return undefined;
  }, [sortedRecords.length, proposedPlan, planStatus, hasUrlTab]);

  if (isLoading) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {/* Explorer sidebar skeleton (left) */}
        <div className="w-[240px] border-r border-border flex flex-col shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            <div className="flex gap-1">
              <div className="h-5 w-5 bg-muted animate-pulse rounded" />
              <div className="h-5 w-5 bg-muted animate-pulse rounded" />
            </div>
          </div>
          <div className="px-3 pt-3 pb-2">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded mt-1" />
          </div>
          <div className="flex-1 px-2 py-1 space-y-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-6 bg-muted animate-pulse rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
            ))}
          </div>
        </div>
        {/* Main content skeleton (center) */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
        {/* Lucy sidebar skeleton (right) */}
        <div className="w-[340px] border-l border-border flex flex-col shrink-0">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <div className="w-7 h-7 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div className="space-y-2">
              <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-3 w-full bg-muted animate-pulse rounded" />
              <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return <DatasetNotFound onBack={onBack} />;
  }

  // Derive content section from the active workspace tab.
  // When no tabs are open (null), WorkspaceWelcome is shown instead of falling back to overview.
  const contentSection: ContentSection = tabContentSection;

  return (
    <DryRunJobsProvider dataset={dataset}>
     <WorkspaceTabsProvider datasetId={datasetId} initialTabs={emptyDatasetInitialTabs}>
      {/* Bridge: syncs workspace tab state ↔ parent content section */}
      <WorkspaceTabBridge openTabRef={openTabRef} onSectionChange={setTabContentSection} onActivePathChange={setActiveTabPath} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Title bar — dataset name (editable), spans full width like VS Code */}
        <DatasetTitleBar />

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Explorer sidebar on the left */}
          <ExplorerSidebar />

          {/* Main content in the center */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Dynamic workspace tabs */}
          <WorkspaceTabManager />

          {/* Path breadcrumb — only shown for subfolder navigation */}
          <DatasetBreadcrumbBar />

          {/* Content panel — driven by the active workspace tab */}
          {contentSection === null && (
            <ErrorBoundary
              fallback={
                <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 text-xs">
                  Open a file from the explorer sidebar to get started
                </div>
              }
            >
              <WorkspaceWelcome
                datasetName={dataset.name || "Untitled Experiment"}
                onOpenTab={handleOpenTab}
                recordCount={sortedRecords.length}
                generatedCount={insights.generatedRecords}
                originalCount={insights.originalRecords}
                leafTopicCount={availableTopics.length}
                planStatus={planStatus}
                knowledgeSourcesCount={knowledgeSourcesCount}
                hasEvalScript={!!dataset.evalScript}
                hasReadme={!!readme}
              />
            </ErrorBoundary>
          )}
          {contentSection === "overview" && (
            <DatasetOverviewPanel
              readme={readme}
              readmeUpdatedAt={readmeUpdatedAt}
              onExport={exportReadme}
              datasetId={datasetId}
              onOverviewClick={() => setAnalyticsDialogOpen(true)}
            />
          )}
          {contentSection === "insights" && (
            <InsightsPane insightType={activeInsightType ?? "coverage"} />
          )}
          {contentSection === "records" && (
            <DatasetMainContent
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              onExport={handleExport}
              datasetId={datasetId}
              records={sortedRecords}
              topicHierarchy={dataset.topicHierarchy?.hierarchy}
              coverageStats={canvasCoverageStats}
              availableTopics={availableTopics}
              topicFilter={activeTabPath?.startsWith("data/") ? activeTabPath.slice(5) : undefined}
              onImportClick={() => setImportDialog(true)}
              onDocsClick={() => openTabRef.current("documents", "Documents", false)}
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
              normalizedObjective={dataset.normalizedObjective}
              docsProcessing={docsProcessing}
              docsProcessingCount={docsProcessingCount}
              docsTotal={knowledgeSourcesCount}
              sourceDocumentFilterName={sourceDocumentFilterName}
              onClearSourceDocumentFilter={() => setSourceDocumentFilter(null)}
              onUpdatePromptTemplate={handleUpdatePromptTemplate}
              topicQualityScores={topicQualityScores}
            />
          )}
          {contentSection === "evaluator-script" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <EvaluationConfigPanel
                evalScript={dataset.evalScript}
                onSave={handleSaveEvaluationConfig}
                recordCount={sortedRecords.length}
                view="script"
              />
            </div>
          )}
          {contentSection === "evaluator-jobs" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <EvaluationConfigPanel
                evalScript={dataset.evalScript}
                onSave={handleSaveEvaluationConfig}
                recordCount={sortedRecords.length}
                view="jobs"
                selectedDryRunJobId={selectedDryRunJobId}
              />
            </div>
          )}
          {contentSection === "evaluator" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <EvaluationConfigPanel
                evalScript={dataset.evalScript}
                onSave={handleSaveEvaluationConfig}
                recordCount={sortedRecords.length}
              />
            </div>
          )}
          {contentSection === "jobs" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <FinetuneConfigPanel
                datasetId={datasetId}
                canStartJob={hasRecords && hasEvaluator}
                initialConfig={dataset.trainingConfig}
                selectedFinetuneJobId={selectedFinetuneJobId}
              />
            </div>
          )}
          {contentSection === "deploy" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <DeployGuidancePanel />
            </div>
          )}
          {contentSection === "plan" && (
            <PlanPreview
              plan={proposedPlan}
              planStatus={planStatus}
              mode={planEditMode}
              onModeChange={setPlanEditMode}
              onApprove={approvePlan}
              onSubmitEdited={submitEditedPlan}
              onDismiss={dismissPlan}
              onOpenDocs={() => openTabRef.current("documents", "Documents", false)}
              isGenerating={isGeneratingPlan}
              isLoadingPlan={isLoadingPlan}
              isExecuting={isExecuting}
              hasKnowledgeSources={knowledgeSourcesCount > 0}
              planErrorMessage={planErrorMessage}
              docsProcessing={docsProcessing && shouldAutoGenerate}
              datasetId={datasetId}
            />
          )}
          {contentSection === "readme" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <DatasetReadmeViewer
                readme={readme}
                readmeUpdatedAt={readmeUpdatedAt}
                onExport={exportReadme}
                className="h-full"
              />
            </div>
          )}
          {contentSection === "documents" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedDocumentSourceId ? (
                <KnowledgeSourceViewer sourceId={selectedDocumentSourceId} chunkRecordCounts={chunkRecordCounts} />
              ) : (
                <KnowledgeSourcesPanel
                  datasetId={datasetId}
                  className="h-full"
                />
              )}
            </div>
          )}
          {contentSection === "tasks" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <TasksViewer />
            </div>
          )}
          {contentSection === "logs" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <LogsViewer />
            </div>
          )}
          {contentSection === "skill" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <SkillFileViewer filePath={getSkillFileFromPath(activeTabPath) ?? "SKILL.md"} />
            </div>
          )}
        </div>

          {/* Lucy AI assistant on the right */}
          <LucySidebar />
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
     </WorkspaceTabsProvider>
    </DryRunJobsProvider>
  );
}

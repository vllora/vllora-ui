/**
 * DatasetDetailContentV2
 *
 * Refactored version of DatasetDetailContent with new layout:
 * - Topbar with stepper showing dataset preparation checklist
 * - Canvas view showing topic hierarchy visualization
 */

import { useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, LayoutGrid, Table2 } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { emitter } from "@/utils/eventEmitter";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { AssignTopicDialog } from "./AssignTopicDialog";
import { IngestDataDialog } from "./IngestDataDialog";
import { CreateDatasetDialog } from "./CreateDatasetDialog";
import { TopicHierarchyDialog } from "./topics-dialog";
import { GenerateSyntheticDataDialog } from "./GenerateSyntheticDataDialog";
import { SanitizeDataDialog } from "./SanitizeDataDialog";
import { DryRunDialog } from "./DryRunDialog";
import { getLeafTopicsFromHierarchy } from "./record-utils";
import { getTopicCounts } from "./topic-hierarchy-utils";
import { TopicHierarchyCanvas } from "./dataset-canvas/TopicHierarchyCanvas";
import { RecordsTable } from "./records-table/RecordsTable";
import { RecordDetailSidebar } from "./records-table/RecordDetailSidebar";
import { DatasetDetailHeader } from "./dataset-detail-header";
import { LucyDatasetAssistant } from "./LucyDatasetAssistant";
import { EvaluationConfigDialog } from "./evaluation-dialog/EvaluationConfigDialog";
import { updateDatasetEvaluationConfig } from "@/services/datasets-db";
import type { CoverageStats, EvaluationConfig, TopicHierarchyNode } from "@/types/dataset-types";

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

    // Evaluation config dialog
    evaluationConfigDialog,
    setEvaluationConfigDialog,

    // Handlers
    handleUpdateRecordTopic,
    handleDeleteConfirm,
    handleBulkAssignTopic,
    handleGenerateTraces,
    handleSaveRecordData,
    handleGenerateHierarchy,
    handleApplyTopicHierarchy,
    handleAutoTagRecords,
    handleMigrateRecordsToChildren,
    handleClearRecordTopics,
    handleClearSelectedRecordTopics,
    handleRenameTopicInRecords,
    handleDeleteTopicFromRecords,
    handleDeleteTopic,
    handleImportRecords,
    recordsWithTopicsCount,
  } = DatasetDetailConsumer();

  // State for canvas view
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // View mode: "canvas" for visual hierarchy, "table" for full data table with hierarchy grouping
  const [viewMode, setViewMode] = useState<"canvas" | "table">("canvas");

  // Selected record for sidebar detail view (table mode only)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const selectedRecord = useMemo(
    () => sortedRecords.find((r) => r.id === selectedRecordId) ?? null,
    [sortedRecords, selectedRecordId]
  );

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

  // Handle rename topic from canvas (inline rename)
  const handleRenameTopic = (oldName: string, newName: string) => {
    if (!dataset) return;

    // Helper to rename a node in the hierarchy
    const renameNodeInHierarchy = (
      nodes: TopicHierarchyNode[],
      targetName: string,
      newNodeName: string
    ): TopicHierarchyNode[] => {
      return nodes.map((node) => {
        if (node.name === targetName) {
          return { ...node, name: newNodeName };
        }
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: renameNodeInHierarchy(node.children, targetName, newNodeName),
          };
        }
        return node;
      });
    };

    // Update records with new topic name
    handleRenameTopicInRecords(oldName, newName);

    // Update hierarchy if it exists
    if (dataset.topicHierarchy?.hierarchy) {
      const updatedHierarchy = renameNodeInHierarchy(
        JSON.parse(JSON.stringify(dataset.topicHierarchy.hierarchy)) as TopicHierarchyNode[],
        oldName,
        newName
      );

      handleApplyTopicHierarchy({
        ...dataset.topicHierarchy,
        hierarchy: updatedHierarchy,
      });
    }
  };

  // Handle create child topic from canvas inline input
  const handleCreateChildTopic = async (parentTopicName: string | null, childTopicName: string) => {
    if (!dataset) return;

    // Helper to find a node by name and return its ID and whether it was a leaf
    const findNodeInfo = (
      nodes: TopicHierarchyNode[],
      targetName: string
    ): { id: string; wasLeaf: boolean } | null => {
      for (const node of nodes) {
        if (node.name === targetName) {
          return {
            id: node.id || node.name,
            wasLeaf: !node.children || node.children.length === 0,
          };
        }
        if (node.children && node.children.length > 0) {
          const found = findNodeInfo(node.children, targetName);
          if (found) return found;
        }
      }
      return null;
    };

    // Helper to find and add child to a node by name
    const addChildToNode = (
      nodes: TopicHierarchyNode[],
      parentName: string,
      newChild: TopicHierarchyNode
    ): TopicHierarchyNode[] => {
      return nodes.map((node) => {
        if (node.name === parentName) {
          return {
            ...node,
            children: [...(node.children || []), newChild],
          };
        }
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: addChildToNode(node.children, parentName, newChild),
          };
        }
        return node;
      });
    };

    // Check if parent was a leaf with records (needs migration)
    let parentInfo: { id: string; wasLeaf: boolean } | null = null;
    let recordsNeedMigration = false;
    if (parentTopicName !== null && dataset.topicHierarchy?.hierarchy) {
      parentInfo = findNodeInfo(dataset.topicHierarchy.hierarchy, parentTopicName);
      if (parentInfo?.wasLeaf) {
        // Check if any records are assigned to this topic
        recordsNeedMigration = sortedRecords.some(r => r.topic === parentInfo!.id);
      }
    }

    // Create new node with unique ID
    const newNode: TopicHierarchyNode = {
      id: `topic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: childTopicName,
    };

    // Clone current hierarchy or create empty array
    const currentHierarchy = dataset.topicHierarchy?.hierarchy
      ? JSON.parse(JSON.stringify(dataset.topicHierarchy.hierarchy)) as TopicHierarchyNode[]
      : [];

    // Add to root level or find parent and add as child
    const updatedHierarchy = parentTopicName === null
      ? [...currentHierarchy, newNode]
      : addChildToNode(currentHierarchy, parentTopicName, newNode);

    // Apply the updated hierarchy
    await handleApplyTopicHierarchy({
      ...dataset.topicHierarchy,
      depth: dataset.topicHierarchy?.depth ?? 3,
      hierarchy: updatedHierarchy,
    });

    // Auto-migrate records if parent was a leaf with records
    if (recordsNeedMigration && parentInfo) {
      // Small delay to ensure hierarchy is saved before migration
      setTimeout(() => {
        handleMigrateRecordsToChildren(parentInfo!.id, updatedHierarchy);
      }, 100);
    }
  };

  // Handle save evaluation config
  const handleSaveEvaluationConfig = async (config: EvaluationConfig) => {
    if (!dataset) return;
    await updateDatasetEvaluationConfig(dataset.id, config);
  };

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
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Dataset not found</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Datasets
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Lucy Assistant on the left */}
      <LucyDatasetAssistant />

      {/* Main content on the right */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with dataset objective and insights */}
        <div className="px-4 py-2 border-b border-border">
          <DatasetDetailHeader />
        </div>

        {/* View mode toolbar */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-end">
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
            <Button
              variant={viewMode === "canvas" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 gap-1.5"
              onClick={() => setViewMode("canvas")}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="text-xs">Canvas</span>
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 gap-1.5"
              onClick={() => setViewMode("table")}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span className="text-xs">Table</span>
            </Button>
          </div>
        </div>

        {/* Main content area - Canvas or Table based on view mode */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === "canvas" ? (
            <TopicHierarchyCanvas
              hierarchy={dataset.topicHierarchy?.hierarchy}
              records={sortedRecords}
              datasetId={datasetId}
              coverageStats={canvasCoverageStats}
              onSelectTopic={setSelectedTopic}
              selectedTopic={selectedTopic}
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
            />
          ) : (
            <>
              {/* Records Table */}
              <RecordsTable
                records={sortedRecords}
                datasetId={datasetId}
                showHeader={true}
                showFooter={true}
                height="auto"
                groupByTopic={true}
                topicHierarchy={dataset.topicHierarchy?.hierarchy}
                availableTopics={availableTopics}
                onUpdateTopic={handleUpdateRecordTopic}
                onDelete={(recordId) =>
                  setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
                }
                onSave={handleSaveRecordData}
                onExpand={(record) => setSelectedRecordId(record.id)}
                viewingRecordId={selectedRecordId}
              />

              {/* Record Detail Sidebar (Sheet - renders via portal) */}
              <RecordDetailSidebar
                record={selectedRecord}
                onClose={() => setSelectedRecordId(null)}
                availableTopics={availableTopics}
                onUpdateTopic={handleUpdateRecordTopic}
                onDelete={(recordId) => {
                  setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id });
                  setSelectedRecordId(null);
                }}
                onSave={handleSaveRecordData}
              />
            </>
          )}
        </div>
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
        hasGraderConfig={!!dataset?.evaluationConfig}
        onRunDryRun={async (sampleSize) => {
          // TODO: Implement actual dry run logic
          // For now, return mock data
          const mockScores = Array.from({ length: sampleSize }, () =>
            Math.random() * 0.6 + 0.2 // Random scores between 0.2 and 0.8
          );
          const mean = mockScores.reduce((a, b) => a + b, 0) / mockScores.length;
          const variance = mockScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / mockScores.length;
          const std = Math.sqrt(variance);

          return {
            samples: mockScores.map((score, i) => ({
              prompt: `Sample prompt ${i + 1}...`,
              response: `Sample response ${i + 1}...`,
              score,
              topic: availableTopics[i % availableTopics.length]?.name || "uncategorized",
            })),
            statistics: {
              mean,
              std,
              min: Math.min(...mockScores),
              max: Math.max(...mockScores),
              median: mockScores.sort((a, b) => a - b)[Math.floor(mockScores.length / 2)],
            },
            byTopic: availableTopics.reduce((acc, topic) => {
              acc[topic.name] = { mean: Math.random() * 0.5 + 0.3, count: Math.floor(sampleSize / availableTopics.length) };
              return acc;
            }, {} as Record<string, { mean: number; count: number }>),
            verdict: mean > 0.2 && mean < 0.8 && std > 0.1 ? "GO" : mean < 0.1 ? "NO-GO" : "WARNING",
            recommendations: mean < 0.3 ? ["Consider using SFT first to bootstrap capability"] : [],
          };
        }}
      />

      {/* Evaluation config dialog */}
      <EvaluationConfigDialog
        open={evaluationConfigDialog}
        onOpenChange={setEvaluationConfigDialog}
        config={dataset?.evaluationConfig}
        onSave={handleSaveEvaluationConfig}
      />
    </div>
  );
}

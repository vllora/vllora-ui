/**
 * DatasetDetailView
 *
 * Displays all records for a selected dataset with full functionality.
 * Uses DatasetDetailContext to manage state and reduce prop drilling.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  DatasetDetailProvider,
  DatasetDetailConsumer,
} from "@/contexts/DatasetDetailContext";
import { FinetuneJobsProvider } from "@/contexts/FinetuneJobsContext";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { AssignTopicDialog } from "./AssignTopicDialog";
import { IngestDataDialog } from "./IngestDataDialog";
import { DatasetDetailHeader } from "./DatasetDetailHeader";
import { RecordsToolbar } from "./RecordsToolbar";
import { RecordsTable } from "./records-table";
import { CreateDatasetDialog } from "./CreateDatasetDialog";
import { FinetuneJobsPanel } from "@/components/finetune/FinetuneJobsPanel";
import { TopicHierarchyDialog } from "./topics-dialog";
import { GenerateSyntheticDataDialog } from "./GenerateSyntheticDataDialog";
import { SanitizeDataDialog } from "./SanitizeDataDialog";
import { DryRunDialog } from "./DryRunDialog";
import { getLeafTopicsFromHierarchy } from "./record-utils";
import { getTopicCounts } from "./topic-hierarchy-utils";

interface DatasetDetailViewProps {
  datasetId: string;
  onBack: () => void;
  /** Called when user selects a different dataset from the dropdown */
  onSelectDataset?: (datasetId: string) => void;
}

export function DatasetDetailView({ datasetId, onBack, onSelectDataset }: DatasetDetailViewProps) {
  return (
    <DatasetDetailProvider
      datasetId={datasetId}
      onBack={onBack}
      onSelectDataset={onSelectDataset}
    >
      <FinetuneJobsProvider>
        <DatasetDetailContent />
      </FinetuneJobsProvider>
    </DatasetDetailProvider>
  );
}

/** Inner component that consumes the context */
function DatasetDetailContent() {
  const {
    // Core data
    dataset,
    sortedRecords,
    isLoading,
    datasetId,

    // Navigation
    onBack,

    // Filtering & sorting
    searchQuery,
    setSearchQuery,
    sortConfig,
    setSortConfig,
    groupByTopic,
    setGroupByTopic,
    generatedFilter,
    setGeneratedFilter,

    // Column visibility
    columnVisibility,
    setColumnVisibility,

    // Selection
    selectedRecordIds,
    setSelectedRecordIds,

    // Dialog states
    deleteConfirm,
    setDeleteConfirm,
    assignTopicDialog,
    setAssignTopicDialog,
    importDialog,
    setImportDialog,

    // Loading states
    isGeneratingTraces,
    generationProgress,
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
    handleBulkRunEvaluation,
    handleBulkDelete,
    handleImportRecords,
    handleSaveRecordData,
    handleGenerateHierarchy,
    handleApplyTopicHierarchy,
    handleAutoTagRecords,
    handleClearRecordTopics,
    handleClearSelectedRecordTopics,
    handleRenameTopicInRecords,
    handleDeleteTopicFromRecords,
    recordsWithTopicsCount,
  } = DatasetDetailConsumer();

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

  // Wrapper for auto-tagging that closes the dialog when done
  const handleAutoTagSelected = async () => {
    await handleAutoTagRecords();
    setAssignTopicDialog(false);
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
    <>
      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 shrink-0 pt-2">
            {/* Header - consumes context directly */}
            <DatasetDetailHeader />

            {/* Toolbar */}
            <RecordsToolbar
              selectedCount={selectedRecordIds.size}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortConfig={sortConfig}
              onSortChange={setSortConfig}
              groupByTopic={groupByTopic}
              onGroupByTopicChange={setGroupByTopic}
              onAssignTopic={() => setAssignTopicDialog(true)}
              generatedFilter={generatedFilter}
              onGeneratedFilterChange={setGeneratedFilter}
              onGenerateTraces={() => setGenerateDataDialog(true)}
              isGeneratingTraces={isGeneratingTraces}
              generationProgress={generationProgress}
              hasTopicHierarchy={availableTopics.length > 0}
              onRunEvaluation={handleBulkRunEvaluation}
              onDeleteSelected={handleBulkDelete}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
            />
          </div>

          {/* Records table - fills remaining space */}
          <div className="flex-1 mx-6 mb-2 border border-border  overflow-hidden bg-card">
            <RecordsTable
              records={sortedRecords}
              datasetId={datasetId}
              showHeader
              showFooter
              selectable
              selectedIds={selectedRecordIds}
              onSelectionChange={setSelectedRecordIds}
              groupByTopic={groupByTopic}
              emptyMessage={searchQuery ? `No records match "${searchQuery}"` : "No records in this dataset"}
              onUpdateTopic={handleUpdateRecordTopic}
              onDelete={(recordId: string) =>
                setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
              }
              onSave={handleSaveRecordData}
              availableTopics={availableTopics}
              topicHierarchy={dataset?.topicHierarchy?.hierarchy}
            />
          </div>
        </div>

        {/* Finetune jobs sidebar */}
        <FinetuneJobsPanel />
      </div>

      {/* Delete confirmation dialog */}
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
    </>
  );
}

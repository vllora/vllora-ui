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
import { ExpandTraceDialog } from "./ExpandTraceDialog";
import { IngestDataDialog } from "./IngestDataDialog";
import { DatasetDetailHeader } from "./DatasetDetailHeader";
import { RecordsToolbar } from "./RecordsToolbar";
import { RecordsTable } from "./RecordsTable";
import { CreateDatasetDialog } from "./CreateDatasetDialog";
import { FinetuneJobsPanel } from "@/components/finetune/FinetuneJobsPanel";
import { TopicHierarchyDialog } from "./TopicHierarchyDialog";
import { getLeafTopicsFromHierarchy } from "./record-utils";

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
    expandedRecord,
    setExpandedRecord,

    // Loading states
    isGeneratingTopics,
    isGeneratingTraces,
    isGeneratingHierarchy,
    isAutoTagging,

    // Topic hierarchy dialog
    topicHierarchyDialog,
    setTopicHierarchyDialog,

    // Handlers
    handleUpdateRecordTopic,
    handleUpdateRecordEvaluation,
    handleDeleteConfirm,
    handleBulkAssignTopic,
    handleGenerateTopics,
    handleGenerateTraces,
    handleBulkRunEvaluation,
    handleBulkDelete,
    handleImportRecords,
    handleSaveRecordData,
    handleGenerateHierarchy,
    handleApplyTopicHierarchy,
    handleAutoTagRecords,
  } = DatasetDetailConsumer();

  // Compute available topics from hierarchy for topic selection
  const availableTopics = useMemo(
    () => getLeafTopicsFromHierarchy(dataset?.topicHierarchy?.hierarchy),
    [dataset?.topicHierarchy?.hierarchy]
  );

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
        <div className="flex-1 overflow-auto">
          <div className="w-full max-w-6xl mx-auto px-6 py-6">
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
              onGenerateTopics={handleGenerateTopics}
              isGeneratingTopics={isGeneratingTopics}
              onGenerateTraces={handleGenerateTraces}
              isGeneratingTraces={isGeneratingTraces}
              onRunEvaluation={handleBulkRunEvaluation}
              onDeleteSelected={handleBulkDelete}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              onConfigureTopicHierarchy={() => setTopicHierarchyDialog(true)}
            />

            {/* Records table */}
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <RecordsTable
                records={sortedRecords}
                datasetId={datasetId}
                showHeader
                showFooter
                selectable
                selectedIds={selectedRecordIds}
                onSelectionChange={setSelectedRecordIds}
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
                groupByTopic={groupByTopic}
                columnVisibility={columnVisibility}
                emptyMessage={searchQuery ? `No records match "${searchQuery}"` : "No records in this dataset"}
                onUpdateTopic={handleUpdateRecordTopic}
                onDelete={(recordId: string) =>
                  setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
                }
                onExpand={setExpandedRecord}
                height={500}
                availableTopics={availableTopics}
              />
            </div>
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
      />

      {/* Expand trace dialog */}
      <ExpandTraceDialog
        record={expandedRecord}
        onOpenChange={(open) => !open && setExpandedRecord(null)}
        onSave={handleSaveRecordData}
        onUpdateTopic={handleUpdateRecordTopic}
        onUpdateEvaluation={handleUpdateRecordEvaluation}
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
        recordCount={sortedRecords.length}
      />
    </>
  );
}

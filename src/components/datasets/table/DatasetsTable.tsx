/**
 * DatasetsTable
 *
 * Displays the list of all datasets in a table view.
 */

import { useState, useMemo, useEffect } from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DeleteConfirmationDialog,
  type DeleteConfirmation,
} from "../DeleteConfirmationDialog";
import { DatasetTableRow } from "./DatasetTableRow";
import { DatasetsEmptyState } from "./DatasetsEmptyState";
import { DatasetsListHeader } from "./DatasetsListHeader";
import { DatasetsNoResultsState } from "./DatasetsNoResultsState";
import { IngestDataDialog, type ImportResult } from "../IngestDataDialog";

interface DatasetsTableProps {
  onSelectDataset: (datasetId: string) => void;
}

export function DatasetsTable({ onSelectDataset }: DatasetsTableProps) {
  const {
    datasets,
    isLoading,
    error,
    getDatasetWithRecords,
    getRecordCount,
    getTopicCoverageStats,
    createDataset,
    deleteDataset,
    renameDataset,
    importRecords,
    clearDatasetRecords,
  } = DatasetsConsumer();

  // State
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [topicCoverageStats, setTopicCoverageStats] = useState<
    Record<string, { total: number; withTopic: number }>
  >({});
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [editingDatasetName, setEditingDatasetName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTargetDatasetId, setImportTargetDatasetId] = useState<string | null>(null);

  // Filter datasets by search query
  const filteredDatasets = useMemo(() => {
    if (!searchQuery.trim()) return datasets;
    const query = searchQuery.toLowerCase();
    return datasets.filter((ds) => ds.name.toLowerCase().includes(query));
  }, [datasets, searchQuery]);

  // Load record counts and topic coverage stats for all datasets
  useEffect(() => {
    const loadStats = async () => {
      const counts: Record<string, number> = {};
      const coverage: Record<string, { total: number; withTopic: number }> = {};
      await Promise.all(
        datasets.map(async (ds) => {
          counts[ds.id] = await getRecordCount(ds.id);
          coverage[ds.id] = await getTopicCoverageStats(ds.id);
        })
      );
      setRecordCounts(counts);
      setTopicCoverageStats(coverage);
    };
    if (datasets.length > 0) {
      loadStats();
    }
  }, [datasets, getRecordCount, getTopicCoverageStats]);

  // Handlers
  const handleRenameDataset = async (datasetId: string) => {
    if (!editingDatasetName.trim()) {
      toast.error("Dataset name cannot be empty");
      return;
    }
    try {
      await renameDataset(datasetId, editingDatasetName);
      toast.success("Dataset renamed");
      setEditingDatasetId(null);
    } catch {
      toast.error("Failed to rename dataset");
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    try {
      await deleteDataset(datasetId);
      toast.success("Dataset deleted");
    } catch {
      toast.error("Failed to delete dataset");
    }
    setDeleteConfirm(null);
  };

  const handleCreateDataset = async (name: string) => {
    try {
      await createDataset(name);
      toast.success("Dataset created");
    } catch {
      toast.error("Failed to create dataset");
    }
  };

  const handleImportToDataset = async (result: ImportResult) => {
    try {
      let targetDatasetId: string;
      let datasetName: string;

      if (result.target === "new" && result.newDatasetName) {
        // Create new dataset first
        const newDataset = await createDataset(result.newDatasetName);
        targetDatasetId = newDataset.id;
        datasetName = newDataset.name;
      } else if (result.target === "existing" && result.existingDatasetId) {
        // Use existing dataset
        targetDatasetId = result.existingDatasetId;
        const existingDataset = datasets.find((d) => d.id === targetDatasetId);
        datasetName = existingDataset?.name || "dataset";

        // If replace mode, clear existing records first
        if (result.mode === "replace") {
          await clearDatasetRecords(targetDatasetId);
        }
      } else {
        throw new Error("Invalid import configuration");
      }

      // Import the records
      const count = await importRecords(
        targetDatasetId,
        result.records,
        result.defaultTopic
      );

      toast.success(
        result.target === "new"
          ? `Created "${datasetName}" with ${count} record${count !== 1 ? "s" : ""}`
          : `Imported ${count} record${count !== 1 ? "s" : ""} to "${datasetName}"`
      );
    } catch (err) {
      console.error("Failed to import data:", err);
      toast.error("Failed to import data");
      throw err;
    }
  };

  const handleDownloadDataset = async (datasetId: string) => {
    try {
      const datasetWithRecords = await getDatasetWithRecords(datasetId);
      if (!datasetWithRecords) {
        toast.error("Dataset not found");
        return;
      }

      // Export as JSONL format with messages and tools columns
      const jsonlContent = datasetWithRecords.records
        .map((record) => {
          const data = record.data as Record<string, unknown> | undefined;
          const input = data?.input as Record<string, unknown> | undefined;
          const output = data?.output as Record<string, unknown> | undefined;

          // Combine input.messages with output (output is a single message)
          const inputMessages = (input?.messages as unknown[]) || [];
          const outputMessage = output?.messages
            ? Array.isArray(output.messages)
              ? output.messages[0]
              : output.messages
            : output;
          const messages = outputMessage
            ? [...inputMessages, outputMessage]
            : inputMessages;

          // Get tools from input.tools
          const tools = (input?.tools as unknown[]) || [];

          return JSON.stringify({ messages, tools });
        })
        .join("\n");

      const blob = new Blob([jsonlContent], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${datasetWithRecords.name.toLowerCase().replace(/\s+/g, "-")}-export.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${datasetWithRecords.records.length} records as JSONL`);
    } catch (err) {
      console.error("Failed to export dataset:", err);
      toast.error("Failed to export dataset");
    }
  };

  return (
    <>
      <div className="flex-1 overflow-auto">
        <div className="w-full mx-auto px-6 py-6">
          <DatasetsListHeader
            searchQuery={searchQuery}
            datasetCount={datasets.length}
            onSearchChange={setSearchQuery}
            onImportClick={() => setShowImportDialog(true)}
            onCreateDataset={handleCreateDataset}
          />

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-muted-foreground">Loading datasets...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-500">Error: {error.message}</div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && datasets.length === 0 && <DatasetsEmptyState />}

          {/* No results state */}
          {!isLoading && !error && datasets.length > 0 && filteredDatasets.length === 0 && (
            <DatasetsNoResultsState searchQuery={searchQuery} />
          )}

          {/* Dataset table */}
          {!isLoading && !error && filteredDatasets.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_120px_200px_160px_48px] items-center px-6 py-3 border-b border-border bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Dataset Name
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Records
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Topic Coverage
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Last Modified
                </span>
                <span />
              </div>

              {/* Table rows */}
              {filteredDatasets.map((dataset) => {
                const isEditing = editingDatasetId === dataset.id;

                return (
                  <DatasetTableRow
                    key={dataset.id}
                    datasetId={dataset.id}
                    name={dataset.name}
                    recordCount={recordCounts[dataset.id] ?? "..."}
                    topicCoverage={topicCoverageStats[dataset.id] ?? null}
                    hasTopicHierarchy={!!dataset.topicHierarchy?.hierarchy}
                    updatedAt={dataset.updatedAt}
                    isEditing={isEditing}
                    editingName={editingDatasetName}
                    onSelect={() => onSelectDataset(dataset.id)}
                    onEditNameChange={setEditingDatasetName}
                    onSaveRename={() => handleRenameDataset(dataset.id)}
                    onCancelRename={() => setEditingDatasetId(null)}
                    onStartRename={() => {
                      setEditingDatasetId(dataset.id);
                      setEditingDatasetName(dataset.name);
                    }}
                    onImport={() => {
                      setImportTargetDatasetId(dataset.id);
                      setShowImportDialog(true);
                    }}
                    onDownload={() => handleDownloadDataset(dataset.id)}
                    onDelete={() => setDeleteConfirm({ type: "dataset", id: dataset.id })}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        confirmation={deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        onConfirm={(confirmation) => {
          if (confirmation.type === "dataset") {
            handleDeleteDataset(confirmation.id);
          }
        }}
      />

      {/* Import data dialog */}
      <IngestDataDialog
        open={showImportDialog}
        onOpenChange={(open) => {
          setShowImportDialog(open);
          if (!open) setImportTargetDatasetId(null);
        }}
        datasets={datasets}
        onImportToDataset={handleImportToDataset}
        preselectedDatasetId={importTargetDatasetId ?? undefined}
      />
    </>
  );
}

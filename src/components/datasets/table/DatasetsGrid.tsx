/**
 * DatasetsGrid
 *
 * Displays the list of all datasets in a grid card view.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { toast } from "sonner";
import { getKnowledgeSourceCount } from "@/services/knowledge-sources-db";
import { getWorkflowByDataset } from "@/services/finetune-workflow-db";
import type { FinetuneWorkflowState } from "@/services/finetune-workflow-db";
import { getDryRunJobsByDataset } from "@/services/dry-run-jobs-db";
import { getJobCompletedRows, getJobTotalRows, getJobAverageScore } from "@/types/dry-run-job";
import { emitter } from "@/utils/eventEmitter";
import { computeFilterGroup } from "@/types/dataset-types";
import type { DatasetFilterGroup } from "@/types/dataset-types";
import {
  DeleteConfirmationDialog,
  type DeleteConfirmation,
} from "../DeleteConfirmationDialog";
import { DatasetCard } from "./DatasetCard";
import { AddDatasetCard } from "./AddDatasetCard";
import { DatasetsEmptyState } from "./DatasetsEmptyState";
import { DatasetsListHeader, type DatasetFilter, type DatasetSort } from "./DatasetsListHeader";
import { DatasetsNoResultsState } from "./DatasetsNoResultsState";
import { IngestDataDialog, type ImportResult } from "../IngestDataDialog";

interface DatasetsGridProps {
  onSelectDataset: (datasetId: string) => void;
}

export function DatasetsGrid({ onSelectDataset }: DatasetsGridProps) {
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
  const [docsCounts, setDocsCounts] = useState<Record<string, number>>({});
  const [topicStats, setTopicStats] = useState<
    Record<string, { total: number; withTopic: number; topicCount: number }>
  >({});
  const [workflows, setWorkflows] = useState<Record<string, FinetuneWorkflowState>>({});
  const [activeDryRunCounts, setActiveDryRunCounts] = useState<Record<string, number>>({});
  const [completedDryRunCounts, setCompletedDryRunCounts] = useState<Record<string, number>>({});
  const [activeEvalData, setActiveEvalData] = useState<Record<string, {
    completedRows: number;
    totalRows: number;
    avgScore?: number;
  }>>({});
  const [lastCompletedEval, setLastCompletedEval] = useState<Record<string, {
    avgScore?: number;
    sampleSize: number;
    rolloutModel?: string;
    completedAt?: number;
  }>>({});
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [editingDatasetName, setEditingDatasetName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<DatasetFilter>("all");
  const [activeSort, setActiveSort] = useState<DatasetSort>({ key: "updated", dir: "desc" });
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTargetDatasetId, setImportTargetDatasetId] = useState<string | null>(null);

  // Compute filter group for a dataset (used for badge + filtering)
  const getFilterGroup = (dataset: typeof datasets[number]): DatasetFilterGroup => {
    return computeFilterGroup(
      dataset,
      workflows[dataset.id] ?? null,
      activeDryRunCounts[dataset.id] ?? 0,
    );
  };

  // Filter and sort datasets
  const filteredDatasets = useMemo(() => {
    let result = datasets;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (ds) =>
          ds.name.toLowerCase().includes(query) ||
          ds.id.toLowerCase().includes(query)
      );
    }

    // State filter — match against filter group
    if (activeFilter !== "all") {
      result = result.filter((ds) => {
        return computeFilterGroup(
          ds,
          workflows[ds.id] ?? null,
          activeDryRunCounts[ds.id] ?? 0,
        ) === activeFilter;
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      const dir = activeSort.dir === "asc" ? 1 : -1;
      switch (activeSort.key) {
        case "updated":
          return (a.updatedAt - b.updatedAt) * dir;
        case "created":
          return (a.createdAt - b.createdAt) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "records": {
          const aCount = recordCounts[a.id] ?? 0;
          const bCount = recordCounts[b.id] ?? 0;
          return (aCount - bCount) * dir;
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [datasets, searchQuery, activeFilter, activeSort, recordCounts, workflows, activeDryRunCounts]);

  // Count topics in hierarchy
  function countTopics(nodes: { children?: unknown[] }[]): number {
    let count = 0;
    for (const node of nodes) {
      count += 1;
      if (node.children && Array.isArray(node.children)) {
        count += countTopics(node.children as { children?: unknown[] }[]);
      }
    }
    return count;
  }

  // Load record counts, docs counts, topic stats, and workflow/job states for all datasets.
  const loadStats = useCallback(async () => {
    if (datasets.length === 0) return;
    const counts: Record<string, number> = {};
    const docs: Record<string, number> = {};
    const stats: Record<string, { total: number; withTopic: number; topicCount: number }> = {};
    const wfs: Record<string, FinetuneWorkflowState> = {};
    const dryRuns: Record<string, number> = {};
    const completedRuns: Record<string, number> = {};
    const activeEvalProgressData: Record<string, { completedRows: number; totalRows: number; avgScore?: number }> = {};
    const lastCompletedEvalData: Record<string, { avgScore?: number; sampleSize: number; rolloutModel?: string; completedAt?: number }> = {};
    await Promise.all(
      datasets.map(async (ds) => {
        counts[ds.id] = await getRecordCount(ds.id);
        docs[ds.id] = await getKnowledgeSourceCount(ds.id);
        const coverage = await getTopicCoverageStats(ds.id);
        const topicCount = ds.topicHierarchy?.hierarchy
          ? countTopics(ds.topicHierarchy.hierarchy)
          : 0;
        stats[ds.id] = { ...coverage, topicCount };
        const wf = await getWorkflowByDataset(ds.id);
        if (wf) wfs[ds.id] = wf;
        const jobs = await getDryRunJobsByDataset(ds.id);
        dryRuns[ds.id] = jobs.filter(j => j.status === 'running' || j.status === 'pending').length;
        completedRuns[ds.id] = jobs.filter(j => j.status === 'completed').length;

        // Active job progress
        const activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending');
        if (activeJob) {
          activeEvalProgressData[ds.id] = {
            completedRows: getJobCompletedRows(activeJob),
            totalRows: getJobTotalRows(activeJob),
            avgScore: getJobAverageScore(activeJob),
          };
        }

        // Most recent completed job
        const completedJobs = jobs
          .filter(j => j.status === 'completed')
          .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
        if (completedJobs.length > 0) {
          const last = completedJobs[0];
          lastCompletedEvalData[ds.id] = {
            avgScore: last.result?.statistics?.mean ?? getJobAverageScore(last),
            sampleSize: last.sampleSize,
            rolloutModel: last.rolloutModel,
            completedAt: last.completedAt,
          };
        }
      })
    );
    setRecordCounts(counts);
    setDocsCounts(docs);
    setTopicStats(stats);
    setWorkflows(wfs);
    setActiveDryRunCounts(dryRuns);
    setCompletedDryRunCounts(completedRuns);
    setActiveEvalData(activeEvalProgressData);
    setLastCompletedEval(lastCompletedEvalData);
  }, [datasets, getRecordCount, getTopicCoverageStats]);

  // Re-runs when `datasets` changes — DatasetsContext already listens for
  // vllora_dataset_refresh events and reloads datasets, which triggers this effect.
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Re-run loadStats whenever a dry-run job updates (so progress bar refreshes during polling)
  useEffect(() => {
    emitter.on('vllora_dry_run_job_update', loadStats);
    return () => emitter.off('vllora_dry_run_job_update', loadStats);
  }, [loadStats]);

  // Handlers
  const handleRenameDataset = async (datasetId: string) => {
    if (!editingDatasetName.trim()) {
      toast.error("Experiment name cannot be empty");
      return;
    }
    try {
      await renameDataset(datasetId, editingDatasetName);
      toast.success("Experiment renamed");
      setEditingDatasetId(null);
    } catch {
      toast.error("Failed to rename experiment");
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    try {
      await deleteDataset(datasetId);
      toast.success("Experiment deleted");
    } catch (err) {
      console.error("Failed to delete dataset:", err);
      toast.error("Failed to delete experiment", { description: err as string });
    }
    setDeleteConfirm(null);
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
        toast.error("Experiment not found");
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
      toast.error("Failed to export experiment");
    }
  };

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Scrollable content area */}
        <div className="flex-1 overflow-auto">
          <div className="w-full mx-auto px-6 py-6">
            <DatasetsListHeader
              searchQuery={searchQuery}
              activeFilter={activeFilter}
              activeSort={activeSort}
              onSearchChange={setSearchQuery}
              onFilterChange={setActiveFilter}
              onSortChange={setActiveSort}
              totalCount={filteredDatasets.length}
            />

            {/* Loading state */}
            {isLoading && (
              <div className="py-12">
                <LoadingIndicator variant="section" message="Loading datasets..." />
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

            {/* Dataset grid */}
            {!isLoading && !error && filteredDatasets.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredDatasets.map((dataset) => {
                  const isEditing = editingDatasetId === dataset.id;
                  const stats = topicStats[dataset.id];

                  return (
                    <DatasetCard
                      key={dataset.id}
                      name={dataset.name}
                      filterGroup={getFilterGroup(dataset)}
                      activeEvalJobs={activeDryRunCounts[dataset.id] ?? 0}
                      completedEvalJobs={completedDryRunCounts[dataset.id] ?? 0}
                      activeEvalData={activeEvalData[dataset.id]}
                      lastCompletedEval={lastCompletedEval[dataset.id]}
                      activeFinetuneJob={
                        !!workflows[dataset.id]?.training &&
                        ['pending', 'queued', 'running'].includes(workflows[dataset.id].training!.status)
                      }
                      recordCount={recordCounts[dataset.id] ?? "..."}
                      topicCount={stats?.topicCount ?? 0}
                      docsCount={docsCounts[dataset.id] ?? 0}
                      hasTopicHierarchy={!!dataset.topicHierarchy?.hierarchy}
                      updatedAt={dataset.updatedAt}
                      objective={dataset.datasetObjective}
                      hasEvalScript={!!dataset.evalScript}
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

                {/* Add new dataset card */}
                <AddDatasetCard />
              </div>
            )}
          </div>
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

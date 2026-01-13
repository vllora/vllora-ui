/**
 * DatasetsListView
 *
 * Displays the list of all datasets with expandable records preview.
 */

import { useState, useMemo, useEffect } from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { DatasetRecord } from "@/types/dataset-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Trash2,
  Pencil,
  Check,
  X,
  Plus,
  MoreHorizontal,
  Loader2,
  Search,
  Cloud,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DeleteConfirmationDialog,
  type DeleteConfirmation,
} from "./DeleteConfirmationDialog";
import { RecordsTable } from "./RecordsTable";
import { IngestDataDialog, type ImportResult } from "./IngestDataDialog";

interface DatasetsListViewProps {
  onSelectDataset: (datasetId: string) => void;
}

export function DatasetsListView({ onSelectDataset }: DatasetsListViewProps) {
  const {
    datasets,
    isLoading,
    error,
    getDatasetWithRecords,
    createDataset,
    deleteDataset,
    deleteRecord,
    updateRecordTopic,
    renameDataset,
    importRecords,
    clearDatasetRecords,
  } = DatasetsConsumer();

  // State
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [datasetRecords, setDatasetRecords] = useState<Record<string, DatasetRecord[]>>({});
  const [loadingRecords, setLoadingRecords] = useState<Set<string>>(new Set());
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [editingDatasetName, setEditingDatasetName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmation | null>(null);
  const [showNewDatasetInput, setShowNewDatasetInput] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Max records to show before "See all" link
  const MAX_VISIBLE_RECORDS = 5;

  // Filter datasets by search query
  const filteredDatasets = useMemo(() => {
    if (!searchQuery.trim()) return datasets;
    const query = searchQuery.toLowerCase();
    return datasets.filter(ds => ds.name.toLowerCase().includes(query));
  }, [datasets, searchQuery]);

  // Calculate total records across all datasets
  const [totalRecords, setTotalRecords] = useState(0);
  useEffect(() => {
    const total = Object.values(datasetRecords).reduce((sum, records) => sum + records.length, 0);
    setTotalRecords(total);
  }, [datasetRecords]);

  // Handlers
  const toggleDataset = async (datasetId: string) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(datasetId)) {
      newExpanded.delete(datasetId);
    } else {
      newExpanded.add(datasetId);
      if (!datasetRecords[datasetId] && !loadingRecords.has(datasetId)) {
        setLoadingRecords(prev => new Set(prev).add(datasetId));
        const datasetWithRecords = await getDatasetWithRecords(datasetId);
        if (datasetWithRecords) {
          setDatasetRecords(prev => ({ ...prev, [datasetId]: datasetWithRecords.records }));
        }
        setLoadingRecords(prev => {
          const newSet = new Set(prev);
          newSet.delete(datasetId);
          return newSet;
        });
      }
    }
    setExpandedDatasets(newExpanded);
  };

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
      setDatasetRecords(prev => {
        const newRecords = { ...prev };
        delete newRecords[datasetId];
        return newRecords;
      });
      setExpandedDatasets(prev => {
        const newSet = new Set(prev);
        newSet.delete(datasetId);
        return newSet;
      });
      toast.success("Dataset deleted");
    } catch {
      toast.error("Failed to delete dataset");
    }
    setDeleteConfirm(null);
  };

  const handleDeleteRecord = async (datasetId: string, recordId: string) => {
    try {
      await deleteRecord(datasetId, recordId);
      setDatasetRecords(prev => ({
        ...prev,
        [datasetId]: prev[datasetId]?.filter(r => r.id !== recordId) || [],
      }));
      toast.success("Record deleted");
    } catch {
      toast.error("Failed to delete record");
    }
    setDeleteConfirm(null);
  };

  const handleUpdateRecordTopic = async (datasetId: string, recordId: string, topic: string) => {
    try {
      await updateRecordTopic(datasetId, recordId, topic);
      setDatasetRecords(prev => ({
        ...prev,
        [datasetId]: prev[datasetId]?.map(r =>
          r.id === recordId ? { ...r, topic: topic.trim() || undefined } : r
        ) || [],
      }));
      toast.success("Topic updated");
    } catch {
      toast.error("Failed to update topic");
    }
  };

  const handleCreateDataset = async () => {
    if (!newDatasetName.trim()) {
      toast.error("Dataset name cannot be empty");
      return;
    }
    try {
      await createDataset(newDatasetName);
      toast.success("Dataset created");
      setNewDatasetName("");
      setShowNewDatasetInput(false);
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
        const existingDataset = datasets.find(d => d.id === targetDatasetId);
        datasetName = existingDataset?.name || "dataset";

        // If replace mode, clear existing records first
        if (result.mode === "replace") {
          await clearDatasetRecords(targetDatasetId);
          // Clear local cache for this dataset
          setDatasetRecords(prev => ({ ...prev, [targetDatasetId]: [] }));
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

      // Refresh records cache if the dataset is expanded
      if (expandedDatasets.has(targetDatasetId)) {
        const datasetWithRecords = await getDatasetWithRecords(targetDatasetId);
        if (datasetWithRecords) {
          setDatasetRecords(prev => ({ ...prev, [targetDatasetId]: datasetWithRecords.records }));
        }
      }

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

  return (
    <>
      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-5xl mx-auto px-6 py-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[rgb(var(--theme-500))]/10">
                <Database className="w-6 h-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Datasets</h1>
                <p className="text-sm text-muted-foreground">Manage and monitor your LLM data collections</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search datasets..."
                  className="pl-9 w-56 bg-muted/50 border-border/50"
                />
              </div>
              {showNewDatasetInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newDatasetName}
                    onChange={(e) => setNewDatasetName(e.target.value)}
                    placeholder="Dataset name"
                    className="w-48"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateDataset();
                      if (e.key === "Escape") {
                        setShowNewDatasetInput(false);
                        setNewDatasetName("");
                      }
                    }}
                  />
                  <Button size="sm" onClick={handleCreateDataset}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowNewDatasetInput(false);
                      setNewDatasetName("");
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowImportDialog(true)}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import Data
                  </Button>
                  <Button
                    onClick={() => setShowNewDatasetInput(true)}
                    className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                  >
                    <Plus className="w-4 h-4" />
                    New Dataset
                  </Button>
                </>
              )}
            </div>
          </div>

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
          {!isLoading && !error && datasets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No datasets yet</p>
              <p className="text-sm mt-1">Select spans from traces and add them to a dataset</p>
              <p className="text-sm mt-2 text-[rgb(var(--theme-500))]">
                Ask Lucy to help you get started!
              </p>
            </div>
          )}

          {/* No results state */}
          {!isLoading && !error && datasets.length > 0 && filteredDatasets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No datasets match "{searchQuery}"</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          )}

          {/* Dataset list */}
          {!isLoading && !error && filteredDatasets.length > 0 && (
            <div className="space-y-3">
              {filteredDatasets.map((dataset) => {
                const isExpanded = expandedDatasets.has(dataset.id);
                const records = datasetRecords[dataset.id] || [];
                const isLoadingRecords = loadingRecords.has(dataset.id);
                const isEditing = editingDatasetId === dataset.id;

                return (
                  <div
                    key={dataset.id}
                    className="border border-border rounded-lg overflow-hidden bg-card"
                  >
                    {/* Dataset header */}
                    <div
                      className={cn(
                        "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
                        isExpanded && "border-b border-border"
                      )}
                      onClick={() => !isEditing && toggleDataset(dataset.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        {isEditing ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={editingDatasetName}
                              onChange={(e) => setEditingDatasetName(e.target.value)}
                              className="h-7 w-48"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameDataset(dataset.id);
                                if (e.key === "Escape") setEditingDatasetId(null);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => handleRenameDataset(dataset.id)}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setEditingDatasetId(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="font-medium hover:text-[rgb(var(--theme-500))] transition-colors text-left"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDataset(dataset.id);
                            }}
                          >
                            {dataset.name}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {records.length || "..."} records
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDatasetId(dataset.id);
                                setEditingDatasetName(dataset.name);
                              }}
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500 focus:text-red-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm({ type: "dataset", id: dataset.id });
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Records table */}
                    {isExpanded && (
                      <RecordsTable
                        records={records}
                        isLoading={isLoadingRecords}
                        maxRecords={MAX_VISIBLE_RECORDS}
                        onSeeAll={() => onSelectDataset(dataset.id)}
                        onUpdateTopic={(recordId: string, topic: string) =>
                          handleUpdateRecordTopic(dataset.id, recordId, topic)
                        }
                        onDelete={(recordId: string) =>
                          setDeleteConfirm({ type: "record", id: recordId, datasetId: dataset.id })
                        }
                        showTopicLabel
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="border-t border-border px-6 py-2.5 flex items-center justify-center gap-6 text-xs text-muted-foreground bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Active Datasets: <span className="text-foreground font-medium">{datasets.length}</span></span>
        </div>
        <span className="text-border">•</span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
          <span>Total Records Indexed: <span className="text-foreground font-medium">{totalRecords > 1000 ? `${(totalRecords / 1000).toFixed(1)}k` : totalRecords}</span></span>
        </div>
        <span className="text-border">•</span>
        <div className="flex items-center gap-2">
          <Cloud className="w-3.5 h-3.5" />
          <span>Sync Status</span>
        </div>
        <span className="text-border">•</span>
        <div>
          <span>Workspace: <span className="text-foreground font-medium">Default Project</span></span>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        confirmation={deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        onConfirm={(confirmation) => {
          if (confirmation.type === "dataset") {
            handleDeleteDataset(confirmation.id);
          } else if (confirmation.type === "record" && confirmation.datasetId) {
            handleDeleteRecord(confirmation.datasetId, confirmation.id);
          }
        }}
      />

      {/* Import data dialog */}
      <IngestDataDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        datasets={datasets}
        onImportToDataset={handleImportToDataset}
      />
    </>
  );
}

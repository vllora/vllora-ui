import { useState } from "react";
import { useDatasets } from "@/hooks/useDatasets";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DatasetsPage() {
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
  } = useDatasets();

  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const [datasetRecords, setDatasetRecords] = useState<Record<string, DatasetRecord[]>>({});
  const [loadingRecords, setLoadingRecords] = useState<Set<string>>(new Set());
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [editingDatasetName, setEditingDatasetName] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingRecordTopic, setEditingRecordTopic] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'dataset' | 'record'; id: string; datasetId?: string } | null>(null);
  const [showNewDatasetInput, setShowNewDatasetInput] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState("");

  const toggleDataset = async (datasetId: string) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(datasetId)) {
      newExpanded.delete(datasetId);
    } else {
      newExpanded.add(datasetId);
      // Load records if not already loaded
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

  const handleUpdateRecordTopic = async (datasetId: string, recordId: string) => {
    try {
      await updateRecordTopic(datasetId, recordId, editingRecordTopic);
      setDatasetRecords(prev => ({
        ...prev,
        [datasetId]: prev[datasetId]?.map(r =>
          r.id === recordId ? { ...r, topic: editingRecordTopic.trim() || undefined } : r
        ) || [],
      }));
      toast.success("Topic updated");
      setEditingRecordId(null);
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

  const getOperationType = (record: DatasetRecord): string => {
    const opName = record.data.operation_name;
    if (opName.includes("ModelCall") || opName.includes("model_call")) return "ModelCall";
    if (opName.includes("ToolCall") || opName.includes("tool_call")) return "ToolCall";
    if (opName.includes("ApiCall") || opName.includes("api_call")) return "ApiCall";
    return opName;
  };

  const getLabel = (record: DatasetRecord): string | undefined => {
    const attr = record.data.attribute as Record<string, unknown> | undefined;
    return attr?.label as string | undefined;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading datasets...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    );
  }

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-[rgb(var(--theme-500))]" />
            <h1 className="text-xl font-semibold">Datasets</h1>
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
            <Button onClick={() => setShowNewDatasetInput(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Dataset
            </Button>
          )}
        </div>

        {/* Empty state */}
        {datasets.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No datasets yet</p>
            <p className="text-sm mt-1">Select spans from traces and add them to a dataset</p>
          </div>
        )}

        {/* Dataset list */}
        <div className="space-y-3">
          {datasets.map((dataset) => {
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
                      <span className="font-medium">{dataset.name}</span>
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
                            setDeleteConfirm({ type: 'dataset', id: dataset.id });
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Records list */}
                {isExpanded && (
                  <div className="divide-y divide-border">
                    {isLoadingRecords ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Loading records...
                      </div>
                    ) : records.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        No records in this dataset
                      </div>
                    ) : (
                      records.map((record) => {
                        const isEditingTopic = editingRecordId === record.id;
                        return (
                          <div
                            key={record.id}
                            className="px-4 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <span className="text-xs font-mono px-2 py-0.5 bg-muted rounded">
                                {getOperationType(record)}
                              </span>
                              {getLabel(record) && (
                                <span className="text-xs text-muted-foreground">
                                  {getLabel(record)}
                                </span>
                              )}
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Topic:</span>
                                {isEditingTopic ? (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      value={editingRecordTopic}
                                      onChange={(e) => setEditingRecordTopic(e.target.value)}
                                      className="h-6 w-32 text-xs"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleUpdateRecordTopic(dataset.id, record.id);
                                        if (e.key === "Escape") setEditingRecordId(null);
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => handleUpdateRecordTopic(dataset.id, record.id)}
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => setEditingRecordId(null)}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    className="text-xs text-foreground hover:text-[rgb(var(--theme-500))] transition-colors"
                                    onClick={() => {
                                      setEditingRecordId(record.id);
                                      setEditingRecordTopic(record.topic || "");
                                    }}
                                  >
                                    {record.topic || <span className="text-muted-foreground italic">none</span>}
                                  </button>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                              onClick={() => setDeleteConfirm({ type: 'record', id: record.id, datasetId: dataset.id })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteConfirm?.type === 'dataset' ? 'Dataset' : 'Record'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'dataset'
                ? "This will permanently delete the dataset and all its records. This action cannot be undone."
                : "This will permanently delete this record. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => {
                if (deleteConfirm?.type === 'dataset') {
                  handleDeleteDataset(deleteConfirm.id);
                } else if (deleteConfirm?.type === 'record' && deleteConfirm.datasetId) {
                  handleDeleteRecord(deleteConfirm.datasetId, deleteConfirm.id);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * DatasetDetailHeader
 *
 * Header for the dataset detail view with breadcrumb, title, stats, and actions.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Pencil, Check, X, Database } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { DatasetSelector } from "./DatasetSelector";
import { DatasetActions } from "./DatasetActions";

export function DatasetDetailHeader() {
  const {
    dataset,
    datasetId,
    records,
    datasets,
    datasetRecordCounts,
    onBack,
    onSelectDataset,
    setCreateDatasetDialog,
    handleRenameDataset,
  } = DatasetDetailConsumer();

  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState("");

  const name = dataset?.name ?? "";
  const recordCount = records.length;
  const updatedAt = dataset?.updatedAt;

  const handleStartEdit = () => {
    setEditingName(name);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editingName.trim()) {
      await handleRenameDataset(editingName.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingName("");
  };

  // Format the last updated time
  const formatLastUpdated = (timestamp?: number) => {
    if (!timestamp) return null;
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    return "Just now";
  };

  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Datasets</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        {datasets && datasets.length > 1 && onSelectDataset ? (
          <DatasetSelector
            currentName={name}
            currentId={datasetId}
            datasets={datasets}
            recordCounts={datasetRecordCounts}
            onSelect={onSelectDataset}
            onCreateNew={() => setCreateDatasetDialog(true)}
          />
        ) : (
          <span className="px-2.5 py-1 rounded-md bg-muted/50 text-foreground font-medium">{name}</span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="px-2.5 py-1 text-muted-foreground">Records</span>
      </nav>

      {/* Title and actions */}
      <div className="flex items-start justify-between">
        <div>
          {isEditing ? (
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="h-10 w-80 text-2xl font-bold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
              />
              <Button size="sm" variant="ghost" onClick={handleSave}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold">{name}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleStartEdit}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <p className="text-xs italic text-muted-foreground">
            {recordCount.toLocaleString()} total records
            {updatedAt && (
              <>
                <span className="mx-2">•</span>
                <span className="">
                  Last updated: {formatLastUpdated(updatedAt)}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Actions - consumes context directly */}
        <DatasetActions />
      </div>
    </div>
  );
}

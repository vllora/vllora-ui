/**
 * DatasetDetailHeader
 *
 * Simplified header showing dataset objective and key statistics in cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Pencil, Check, X, Database } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { DatasetSelector } from "./DatasetSelector";
import { DatasetStatsCards } from "./DatasetStatsCards";

export function DatasetDetailHeader() {
  const {
    dataset,
    datasetId,
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

  return (
    <div className="mb-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-4">
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
          <span className="px-2.5 py-1 rounded-md bg-muted/50 text-foreground font-medium">
            {name}
          </span>
        )}
      </nav>

      {/* Title and Objective */}
      <div className="mb-4">
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
            <h1 className="text-2xl font-bold truncate">{name}</h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleStartEdit}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Training Objective */}
        {dataset?.datasetObjective && (
          <p className="text-sm text-muted-foreground max-w-3xl">
            <span className="font-medium text-foreground">Objective:</span>{" "}
            {dataset.datasetObjective}
          </p>
        )}
      </div>

      {/* Stats Cards */}
      <DatasetStatsCards />
    </div>
  );
}

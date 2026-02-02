/**
 * DatasetDetailHeader
 *
 * Simplified header showing dataset objective and key statistics in cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { DatasetStatsCards } from "./DatasetStatsCards";
// import { DatasetBreadcrumb } from "./DatasetBreadcrumb";
import { WorkflowStepIndicator } from "./WorkflowStepIndicator";

export function DatasetDetailHeader() {
  const {
    dataset,
    datasetId,
    // datasets,
    // datasetRecordCounts,
    // onBack,
    // onSelectDataset,
    // setCreateDatasetDialog,
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
    <div className="w-full flex flex-col">
      {/* Breadcrumb */}
      {/* <DatasetBreadcrumb
        name={name}
        datasetId={datasetId}
        datasets={datasets}
        datasetRecordCounts={datasetRecordCounts}
        onBack={onBack}
        onSelectDataset={onSelectDataset}
        onCreateNew={() => setCreateDatasetDialog(true)}
      /> */}

      {/* Title Row with Workflow Indicator */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Title and edit controls */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-row justify-between">
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
              {/* Right: Workflow State Indicator */}
              {datasetId && (
                <WorkflowStepIndicator datasetId={datasetId} className="shrink-0 pt-1" />
              )}
            </div>

            {/* Training Objective */}
            {dataset?.datasetObjective && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Objective:</span>{" "}
                {dataset.datasetObjective}
              </p>
            )}
          </div>


        </div>
      </div>

      {/* Stats Cards */}
      <DatasetStatsCards />
    </div>
  );
}

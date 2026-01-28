/**
 * DatasetDetailHeader
 *
 * Header for the dataset detail view with breadcrumb, title, stats, and actions.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  Pencil,
  Check,
  X,
  Database,
  PanelRightOpen,
  PanelRightClose,
  Circle,
} from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { useFinetuneJobs } from "@/contexts/FinetuneJobsContext";
import { DatasetSelector } from "./DatasetSelector";
import { DatasetActions } from "./DatasetActions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DatasetStep } from "./dataset-canvas/DatasetStepper";
import { computeCompletedSteps } from "./dataset-canvas/DatasetStepper";

// Checklist items configuration
const CHECKLIST_ITEMS: {
  id: DatasetStep;
  label: string;
  tooltip: string;
}[] = [
  { id: "extract_data", label: "Data", tooltip: "Add data records" },
  { id: "topics_categorize", label: "Topics", tooltip: "Define topic hierarchy" },
  { id: "evaluation_config", label: "Evaluator", tooltip: "Configure evaluation" },
  { id: "finetune", label: "Finetune", tooltip: "Run finetuning" },
  { id: "deployed", label: "Deploy", tooltip: "Deploy model" },
];

interface DatasetDetailHeaderProps {
  onStepClick?: (step: DatasetStep) => void;
}

export function DatasetDetailHeader({ onStepClick }: DatasetDetailHeaderProps) {
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

  const { isSidebarOpen, setIsSidebarOpen, filteredJobs, setCurrentBackendDatasetId } = useFinetuneJobs();
  const hasActiveJobs = filteredJobs.some(j => j.status === 'pending' || j.status === 'running');

  // Compute completed steps
  const completedSteps = useMemo(() => {
    if (!dataset) return new Set<DatasetStep>();
    return computeCompletedSteps({
      recordCount: records.length,
      hasTopicHierarchy: !!dataset.topicHierarchy?.hierarchy,
      hasEvaluationConfig: !!dataset.evaluationConfig,
      hasFinetuneJob: false, // TODO: Check actual finetune job status
      isDeployed: false, // TODO: Check actual deployment status
    });
  }, [dataset, records.length]);

  // Set the backend dataset ID for filtering finetune jobs
  // Uses the backend dataset ID stored in the local dataset after upload
  useEffect(() => {
    setCurrentBackendDatasetId(dataset?.backendDatasetId ?? null);
    return () => setCurrentBackendDatasetId(null);
  }, [dataset?.backendDatasetId, setCurrentBackendDatasetId]);

  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState("");

  const name = dataset?.name ?? "";
  const recordCount = records.length;
  const updatedAt = dataset?.updatedAt;
  const stats = dataset?.stats;

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
    <div className="mb-2">
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
            {stats && stats.generatedRecords > 0 && (
              <>
                <span className="mx-2">•</span>
                <span>{stats.generatedRecords.toLocaleString()} generated</span>
              </>
            )}
            {stats && stats.topicCount > 0 && (
              <>
                <span className="mx-2">•</span>
                <span>{stats.topicCount} topics</span>
              </>
            )}
            {stats && stats.uncategorizedCount > 0 && (
              <>
                <span className="mx-2">•</span>
                <span className="text-amber-500">{stats.uncategorizedCount} uncategorized</span>
              </>
            )}
            {stats?.sanitization && (
              <>
                <span className="mx-2">•</span>
                <span className={stats.sanitization.validationRate >= 0.9 ? "text-emerald-500" : stats.sanitization.validationRate >= 0.7 ? "text-amber-500" : "text-red-500"}>
                  {Math.round(stats.sanitization.validationRate * 100)}% valid
                </span>
              </>
            )}
            {updatedAt && (
              <>
                <span className="mx-2">•</span>
                <span className="">
                  Last updated: {formatLastUpdated(updatedAt)}
                </span>
              </>
            )}
          </p>

          {/* Training Objective + Checklist row */}
          <div className="flex items-start gap-6 mt-3">
            {/* Training Objective */}
            {dataset?.datasetObjective && (
              <p className="text-sm text-muted-foreground max-w-xl flex-1">
                <span className="font-medium text-foreground">Training Objective:</span>{" "}
                {dataset.datasetObjective}
              </p>
            )}

            {/* Compact Checklist */}
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1 shrink-0">
                {CHECKLIST_ITEMS.map((item, index) => {
                  const isCompleted = completedSteps.has(item.id);

                  return (
                    <div key={item.id} className="flex items-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => onStepClick?.(item.id)}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
                              isCompleted
                                ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4 h-4 rounded-full flex items-center justify-center",
                                isCompleted
                                  ? "bg-emerald-500 text-white"
                                  : "border border-muted-foreground/30"
                              )}
                            >
                              {isCompleted ? (
                                <Check className="w-2.5 h-2.5" strokeWidth={3} />
                              ) : (
                                <Circle className="w-2 h-2 text-muted-foreground/30" />
                              )}
                            </div>
                            <span className="hidden lg:inline">{item.label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>{isCompleted ? `${item.label} complete` : item.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                      {index < CHECKLIST_ITEMS.length - 1 && (
                        <div
                          className={cn(
                            "w-3 h-px mx-0.5",
                            isCompleted && completedSteps.has(CHECKLIST_ITEMS[index + 1].id)
                              ? "bg-emerald-500/60"
                              : "bg-border"
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Dataset actions - consumes context directly */}
          <DatasetActions />

          {/* Finetune jobs sidebar toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="relative"
                >
                  {isSidebarOpen ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                  {hasActiveJobs && !isSidebarOpen && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isSidebarOpen ? "Hide finetune jobs" : "Show finetune jobs"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

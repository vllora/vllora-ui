/**
 * DatasetDetailHeader
 *
 * Header for the dataset detail view with breadcrumb, title, stats, and actions.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  Check,
  X,
  Download,
  Upload,
  Sparkles,
  Loader2,
  Database,
} from "lucide-react";
import { Dataset } from "@/types/dataset-types";
import { cn } from "@/lib/utils";

interface DatasetDetailHeaderProps {
  name: string;
  datasetId: string;
  recordCount: number;
  createdAt?: number;
  updatedAt?: number;
  /** All available datasets for the dropdown selector */
  datasets?: Dataset[];
  /** Called when user selects a different dataset */
  onSelectDataset?: (datasetId: string) => void;
  onBack: () => void;
  onRename: (newName: string) => Promise<void>;
  onExport?: () => void;
  onIngest?: () => void;
  onFinetune?: () => void;
  isFinetuning?: boolean;
}

export function DatasetDetailHeader({
  name,
  datasetId,
  recordCount,
  updatedAt,
  datasets,
  onSelectDataset,
  onBack,
  onRename,
  onExport,
  onIngest,
  onFinetune,
  isFinetuning,
}: DatasetDetailHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState("");

  const handleStartEdit = () => {
    setEditingName(name);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editingName.trim()) {
      await onRename(editingName.trim());
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-foreground font-medium hover:bg-muted transition-all">
                {name}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48 max-h-72 overflow-auto">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Switch dataset
              </div>
              {datasets.map((dataset) => (
                <DropdownMenuItem
                  key={dataset.id}
                  onClick={() => onSelectDataset(dataset.id)}
                  className={cn(
                    "gap-2 cursor-pointer",
                    dataset.id === datasetId && "bg-[rgb(var(--theme-500))]/10"
                  )}
                >
                  <Database className={cn(
                    "w-4 h-4",
                    dataset.id === datasetId ? "text-[rgb(var(--theme-500))]" : "text-muted-foreground"
                  )} />
                  <span className="flex-1 truncate">{dataset.name}</span>
                  {dataset.id === datasetId && (
                    <Check className="w-4 h-4 text-[rgb(var(--theme-500))]" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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

        <div className="flex items-center gap-2">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={onExport}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export dataset</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={onIngest}
                >
                  <Upload className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import data</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 px-4 rounded-full bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white shadow-sm disabled:opacity-50"
                  onClick={onFinetune}
                  disabled={isFinetuning}
                >
                  {isFinetuning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Finetune
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Start fine-tuning job</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

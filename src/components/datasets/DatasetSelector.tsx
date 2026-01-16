/**
 * DatasetSelector
 *
 * Dropdown component for switching between datasets.
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Database, Check, Plus } from "lucide-react";
import { Dataset } from "@/types/dataset-types";
import { cn } from "@/lib/utils";

interface DatasetSelectorProps {
  /** Current dataset name to display */
  currentName: string;
  /** Current dataset ID for highlighting */
  currentId: string;
  /** List of all available datasets */
  datasets: Dataset[];
  /** Optional record counts for each dataset (keyed by dataset ID) */
  recordCounts?: Record<string, number>;
  /** Called when user selects a dataset */
  onSelect: (datasetId: string) => void;
  /** Called when user clicks "Create new dataset" */
  onCreateNew?: () => void;
  /** Optional className for the trigger button */
  className?: string;
}

export function DatasetSelector({
  currentName,
  currentId,
  datasets,
  recordCounts,
  onSelect,
  onCreateNew,
  className,
}: DatasetSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-foreground font-medium hover:bg-muted transition-all",
            className
          )}
        >
          {currentName}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48 max-h-72 overflow-auto">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Switch dataset
        </div>
        {datasets.map((dataset) => {
          const count = recordCounts?.[dataset.id];
          const isSelected = dataset.id === currentId;
          return (
            <DropdownMenuItem
              key={dataset.id}
              onClick={() => onSelect(dataset.id)}
              className={cn(
                "gap-2 cursor-pointer",
                isSelected && "bg-[rgb(var(--theme-500))]/10"
              )}
            >
              <Database
                className={cn(
                  "w-4 h-4 flex-shrink-0",
                  isSelected
                    ? "text-[rgb(var(--theme-500))]"
                    : "text-muted-foreground"
                )}
              />
              <span className="flex-1 truncate">{dataset.name}</span>
              {isSelected ? (
                <Check className="w-4 h-4 flex-shrink-0 text-[rgb(var(--theme-500))]" />
              ) : (
                count !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {count.toLocaleString()}
                  </span>
                )
              )}
            </DropdownMenuItem>
          );
        })}
        {onCreateNew && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onCreateNew}
              className="gap-2 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              <span>Create new dataset</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

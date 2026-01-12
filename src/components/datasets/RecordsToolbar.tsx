/**
 * RecordsToolbar
 *
 * Toolbar for filtering, sorting, and bulk actions on records.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Filter,
  SortAsc,
  LayoutGrid,
  Tag,
  Play,
  Trash2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordsToolbarProps {
  /** Number of selected records */
  selectedCount: number;
  /** Search query */
  searchQuery: string;
  /** Search change handler */
  onSearchChange: (query: string) => void;
  /** Assign topic to selected records */
  onAssignTopic?: () => void;
  /** Run evaluation on selected records */
  onRunEvaluation?: () => void;
  /** Delete selected records */
  onDeleteSelected?: () => void;
}

export function RecordsToolbar({
  selectedCount,
  searchQuery,
  onSearchChange,
  onAssignTopic,
  onRunEvaluation,
  onDeleteSelected,
}: RecordsToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex items-center justify-between px-4 py-3 border border-border rounded-lg bg-card mb-4">
      {/* Left side - Filter/Sort icons and search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 border-r border-border pr-3">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Filter className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <SortAsc className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search records..."
            className="pl-9 w-64 h-8 bg-muted/50 border-border/50"
          />
        </div>

        {!hasSelection && (
          <span className="text-sm text-muted-foreground">
            Select records to enable bulk actions
          </span>
        )}

        {hasSelection && (
          <span className="text-sm text-[rgb(var(--theme-500))] font-medium">
            {selectedCount} record{selectedCount !== 1 ? "s" : ""} selected
          </span>
        )}
      </div>

      {/* Right side - Bulk action buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className={cn(
            "gap-2",
            hasSelection
              ? "text-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]/30 hover:bg-[rgb(var(--theme-500))]/10"
              : "text-muted-foreground"
          )}
          disabled={!hasSelection}
          onClick={onAssignTopic}
        >
          <Tag className="w-4 h-4" />
          Assign Topic
        </Button>
        <Button
          variant="outline"
          className={cn(
            "gap-2",
            hasSelection
              ? "text-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]/30 hover:bg-[rgb(var(--theme-500))]/10"
              : "text-muted-foreground"
          )}
          disabled={!hasSelection}
          onClick={onRunEvaluation}
        >
          <Play className="w-4 h-4" />
          Run Evaluation
        </Button>
        <Button
          variant="outline"
          className={cn(
            "gap-2",
            hasSelection
              ? "text-red-500 border-red-500/30 hover:bg-red-500/10"
              : "text-muted-foreground"
          )}
          disabled={!hasSelection}
          onClick={onDeleteSelected}
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

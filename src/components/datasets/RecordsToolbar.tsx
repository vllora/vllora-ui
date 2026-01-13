/**
 * RecordsToolbar
 *
 * Toolbar for filtering, sorting, and bulk actions on records.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Filter,
  SortAsc,
  SortDesc,
  Tag,
  Play,
  Trash2,
  Search,
  Check,
  Calendar,
  MessageSquare,
  Star,
  Layers,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SortField = "timestamp" | "topic" | "evaluation";
export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface RecordsToolbarProps {
  /** Number of selected records */
  selectedCount: number;
  /** Search query */
  searchQuery: string;
  /** Search change handler */
  onSearchChange: (query: string) => void;
  /** Current sort configuration */
  sortConfig?: SortConfig;
  /** Sort change handler */
  onSortChange?: (config: SortConfig) => void;
  /** Whether records are grouped by topic */
  groupByTopic?: boolean;
  /** Group by topic change handler */
  onGroupByTopicChange?: (grouped: boolean) => void;
  /** Assign topic to selected records */
  onAssignTopic?: () => void;
  /** Generate topics using topic tool */
  onGenerateTopics?: () => void;
  /** Flag when topics are being generated */
  isGeneratingTopics?: boolean;
  /** Run evaluation on selected records */
  onRunEvaluation?: () => void;
  /** Delete selected records */
  onDeleteSelected?: () => void;
}



const sortFieldLabels: Record<SortField, string> = {
  timestamp: "Timestamp",
  topic: "Topic",
  evaluation: "Evaluation",
};

const sortFieldIcons: Record<SortField, React.ReactNode> = {
  timestamp: <Calendar className="w-4 h-4" />,
  topic: <MessageSquare className="w-4 h-4" />,
  evaluation: <Star className="w-4 h-4" />,
};

export function RecordsToolbar({
  selectedCount,
  searchQuery,
  onSearchChange,
  sortConfig,
  onSortChange,
  groupByTopic = false,
  onGroupByTopicChange,
  onAssignTopic,
  onGenerateTopics,
  isGeneratingTopics,
  onRunEvaluation,
  onDeleteSelected,
}: RecordsToolbarProps) {
  const hasSelection = selectedCount > 0;
  const currentSort = sortConfig || { field: "timestamp", direction: "desc" };

  const handleSortFieldChange = (field: SortField) => {
    if (currentSort.field === field) {
      // Toggle direction if same field
      onSortChange?.({
        field,
        direction: currentSort.direction === "asc" ? "desc" : "asc",
      });
    } else {
      // Default to descending for new field
      onSortChange?.({ field, direction: "desc" });
    }
  };

  const handleSortDirectionToggle = () => {
    onSortChange?.({
      field: currentSort.field,
      direction: currentSort.direction === "asc" ? "desc" : "asc",
    });
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border border-border rounded-lg bg-card mb-4">
      {/* Left side - Filter/Sort icons and search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 border-r border-border pr-3">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Filter className="w-4 h-4" />
          </Button>

          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {currentSort.direction === "asc" ? (
                  <SortAsc className="w-4 h-4" />
                ) : (
                  <SortDesc className="w-4 h-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Sort by
              </div>
              {(Object.keys(sortFieldLabels) as SortField[]).map((field) => (
                <DropdownMenuItem
                  key={field}
                  onClick={() => handleSortFieldChange(field)}
                  className="gap-2"
                >
                  {sortFieldIcons[field]}
                  <span className="flex-1">{sortFieldLabels[field]}</span>
                  {currentSort.field === field && (
                    <Check className="w-4 h-4 text-[rgb(var(--theme-500))]" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Direction
              </div>
              <DropdownMenuItem
                onClick={handleSortDirectionToggle}
                className="gap-2"
              >
                {currentSort.direction === "asc" ? (
                  <>
                    <SortAsc className="w-4 h-4" />
                    <span>Ascending (oldest first)</span>
                  </>
                ) : (
                  <>
                    <SortDesc className="w-4 h-4" />
                    <span>Descending (newest first)</span>
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    groupByTopic && "bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]"
                  )}
                  onClick={() => onGroupByTopicChange?.(!groupByTopic)}
                >
                  <Layers className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{groupByTopic ? "Ungroup records" : "Group by topic"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 h-8 px-3",
            hasSelection
              ? "text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500))]/10"
              : "text-muted-foreground/50"
          )}
          disabled={!hasSelection}
          onClick={onAssignTopic}
        >
          <Tag className="w-3.5 h-3.5" />
          Topic
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 h-8 px-3",
            hasSelection
              ? "text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500))]/10"
              : "text-muted-foreground/50"
          )}
          disabled={!hasSelection || isGeneratingTopics}
          onClick={onGenerateTopics}
        >
          <Wand2 className="w-4 h-4" />
          {isGeneratingTopics ? "Generating..." : "Generate Topics"}
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
          <Play className="w-3.5 h-3.5" />
          Evaluate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 h-8 px-3",
            hasSelection
              ? "text-red-500 hover:bg-red-500/10"
              : "text-muted-foreground/50"
          )}
          disabled={!hasSelection}
          onClick={onDeleteSelected}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

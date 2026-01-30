/**
 * TopicNodeToolbar
 *
 * Floating toolbar that appears above a selected topic node.
 * Provides actions: Generate (dropdown), Delete.
 */

import { Trash2, FilePlus, GitBranch, Grid2X2Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TopicNodeToolbarProps {
  /** Topic name (used for delete) */
  name: string;
  /** Full hierarchical path (e.g., "Openings/Principles") for prompts */
  fullPath?: string;
  /** Node ID for expansion tracking */
  nodeId: string;
  /** Whether this is the root node */
  isRoot: boolean;
  /** Whether the node is currently expanded */
  isExpanded: boolean;
  /** Handler for deleting the topic */
  onDeleteTopic?: (topicName: string) => void;
  /** Handler for toggling node expansion */
  onViewRecords: (nodeId: string) => void;
  /** Handler for generating more data for this topic */
  onGenerateForTopic?: (topicPath: string) => void;
  /** Handler for generating subtopics for this topic (null = root level) */
  onGenerateSubtopics?: (topicPath: string | null) => void;
}

export function TopicNodeToolbar({
  name,
  fullPath,
  // nodeId,
  isRoot,
  // isExpanded,
  onDeleteTopic,
  // onViewRecords,
  onGenerateForTopic,
  onGenerateSubtopics,
}: TopicNodeToolbarProps) {
  // Use fullPath for generate prompts, fallback to name
  const topicPath = fullPath || name;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="absolute left-1/2 -translate-x-1/2 -top-11 z-10 nodrag nopan"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-popover border border-border shadow-lg">
        {/* Generate Records button (not for root) */}
        {!isRoot && onGenerateForTopic && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onGenerateForTopic(topicPath)}
                className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Grid2X2Plus className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              Generate records
            </TooltipContent>
          </Tooltip>
        )}

        {/* Generate Sub-topics button */}
        {onGenerateSubtopics && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onGenerateSubtopics(isRoot ? null : topicPath)}
                className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <GitBranch className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              Generate sub-topics
            </TooltipContent>
          </Tooltip>
        )}

        {/* Separator */}
        {((!isRoot && onGenerateForTopic) || onGenerateSubtopics) && !isRoot && onDeleteTopic && (
          <div className="w-px h-5 bg-border" />
        )}

        {/* Delete button (not for root) */}
        {!isRoot && onDeleteTopic && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onDeleteTopic(name)}
                className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              Delete topic
            </TooltipContent>
          </Tooltip>
        )}

        {/* Future: More options dropdown */}
        {/* <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => onViewRecords(nodeId)}>
              {isExpanded ? "Collapse" : "Expand"} node
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              Export records...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> */}
        </div>
      </div>
    </TooltipProvider>
  );
}

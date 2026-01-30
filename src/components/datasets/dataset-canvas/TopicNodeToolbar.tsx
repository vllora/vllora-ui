/**
 * TopicNodeToolbar
 *
 * Floating toolbar that appears above a selected topic node.
 * Provides actions: Generate (dropdown), Delete.
 */

import { Trash2, Sparkles, ChevronDown, Database, Table2Icon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const hasGenerateOptions = (!isRoot && onGenerateForTopic) || onGenerateSubtopics;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -top-11 z-10 nodrag nopan"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-popover border border-border shadow-lg">
        {/* Generate dropdown */}
        {hasGenerateOptions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[120px] p-1">
              {!isRoot && onGenerateForTopic && (
                <DropdownMenuItem
                  onClick={() => onGenerateForTopic(topicPath)}
                  className="text-xs py-1.5 px-2"
                >
                  <Database className="w-3.5 h-3.5 mr-1.5" />
                  Records
                </DropdownMenuItem>
              )}
              {onGenerateSubtopics && (
                <DropdownMenuItem
                  onClick={() => onGenerateSubtopics(isRoot ? null : topicPath)}
                  className="text-xs py-1.5 px-2"
                >
                  <Table2Icon className="w-3.5 h-3.5 mr-1.5" />
                  Sub-topics
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Separator */}
        {hasGenerateOptions && !isRoot && onDeleteTopic && (
          <div className="w-px h-5 bg-border" />
        )}

        {/* Delete button (not for root) */}
        {!isRoot && onDeleteTopic && (
          <button
            type="button"
            onClick={() => onDeleteTopic(name)}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
            title="Delete topic"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
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
  );
}

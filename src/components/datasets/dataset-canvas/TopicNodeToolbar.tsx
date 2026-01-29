/**
 * TopicNodeToolbar
 *
 * Floating toolbar that appears above a selected topic node.
 * Provides actions: Rename, Delete, and More options.
 */

import { Trash2 } from "lucide-react";

interface TopicNodeToolbarProps {
  /** Topic name (used for delete) */
  name: string;
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
}

export function TopicNodeToolbar({
  name,
  // nodeId,
  isRoot,
  // isExpanded,
  onDeleteTopic,
  // onViewRecords,
}: TopicNodeToolbarProps) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -top-12 z-10 nodrag nopan"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-popover border border-border shadow-lg">
        {/* Delete button (not for root) */}
        {!isRoot && onDeleteTopic && (
          <button
            type="button"
            onClick={() => onDeleteTopic(name)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
            title="Delete topic"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* More options dropdown */}
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

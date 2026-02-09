/**
 * RecordActions
 *
 * Icon buttons for record actions (edit, generate variants, delete).
 * Shown on hover via parent component's CSS.
 */

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Pencil, Trash2, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordActionsProps {
  onEdit?: () => void;
  onDelete: () => void;
  onGenerateVariants?: () => void;
  className?: string;
}

export function RecordActions({ onEdit, onDelete, onGenerateVariants, className }: RecordActionsProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex items-center gap-1", className)}>
        {onEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Edit record
            </TooltipContent>
          </Tooltip>
        )}

        {onGenerateVariants && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateVariants();
                }}
              >
                <GitBranch className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Generate variants
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Delete record
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

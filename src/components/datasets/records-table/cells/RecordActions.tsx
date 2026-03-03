/**
 * RecordActions
 *
 * Single three-dot menu button that opens a dropdown with record actions.
 * Replaces inline icon buttons to avoid content overlap on hover.
 */

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Pencil, Trash2, GitBranch, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordActionsProps {
  onEdit?: () => void;
  onDelete: () => void;
  onGenerateVariants?: () => void;
  onCopyId?: () => void;
  className?: string;
}

export function RecordActions({ onEdit, onDelete, onGenerateVariants, onCopyId, className }: RecordActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors",
              className
            )}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5 mr-2" />
              Edit record
            </DropdownMenuItem>
          )}
          {onGenerateVariants && (
            <DropdownMenuItem onClick={onGenerateVariants}>
              <GitBranch className="w-3.5 h-3.5 mr-2 text-violet-400" />
              Generate variants
            </DropdownMenuItem>
          )}
          {onCopyId && (
            <DropdownMenuItem onClick={onCopyId}>
              <Copy className="w-3.5 h-3.5 mr-2" />
              Copy record ID
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-red-500 focus:text-red-500 focus:bg-red-500/10"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete record
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

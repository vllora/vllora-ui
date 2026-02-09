/**
 * RecordActions
 *
 * Dropdown menu with actions for a dataset record (edit, delete, generate variants, etc.)
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2, GitBranch } from "lucide-react";

interface RecordActionsProps {
  onEdit?: () => void;
  onDelete: () => void;
  onGenerateVariants?: () => void;
}

export function RecordActions({ onEdit, onDelete, onGenerateVariants }: RecordActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 border-border/50 bg-transparent hover:bg-muted/50"
        >
          <MoreVertical className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </DropdownMenuItem>
        )}
        {onGenerateVariants && (
          <DropdownMenuItem onClick={onGenerateVariants}>
            <GitBranch className="w-4 h-4 mr-2" />
            Generate variants
          </DropdownMenuItem>
        )}
        {(onEdit || onGenerateVariants) && <DropdownMenuSeparator />}
        <DropdownMenuItem
          onClick={onDelete}
          className="text-red-500 focus:text-red-500"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

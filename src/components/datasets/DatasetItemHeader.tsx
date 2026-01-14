/**
 * DatasetItemHeader
 *
 * Header for a dataset item in the list view with expand/collapse, rename, and actions.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Pencil,
  Check,
  X,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DatasetItemHeaderProps {
  name: string;
  recordCount: number | string;
  isExpanded: boolean;
  isEditing: boolean;
  editingName: string;
  onToggle: () => void;
  onSelect: () => void;
  onEditNameChange: (name: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onDelete: () => void;
}

export function DatasetItemHeader({
  name,
  recordCount,
  isExpanded,
  isEditing,
  editingName,
  onToggle,
  onSelect,
  onEditNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onDelete,
}: DatasetItemHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
        isExpanded && "border-b border-border"
      )}
      onClick={() => !isEditing && onToggle()}
    >
      <div className="flex items-center gap-3">
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        {isEditing ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editingName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="h-7 w-48"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveRename();
                if (e.key === "Escape") onCancelRename();
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onSaveRename}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onCancelRename}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <button
            className="font-medium hover:text-[rgb(var(--theme-500))] transition-colors text-left"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            {name}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {recordCount} records
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

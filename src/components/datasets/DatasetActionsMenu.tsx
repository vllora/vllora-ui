/**
 * DatasetActionsMenu
 *
 * Dropdown menu for dataset actions (rename, import, download, delete).
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Upload, Download } from "lucide-react";

interface DatasetActionsMenuProps {
  onRename: () => void;
  onImport?: () => void;
  onDownload?: () => void;
  onDelete: () => void;
}

export function DatasetActionsMenu({
  onRename,
  onImport,
  onDownload,
  onDelete,
}: DatasetActionsMenuProps) {
  return (
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
            onRename();
          }}
        >
          <Pencil className="w-4 h-4 mr-2" />
          Rename
        </DropdownMenuItem>
        {onImport && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onImport();
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import Data
          </DropdownMenuItem>
        )}
        {onDownload && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
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
  );
}

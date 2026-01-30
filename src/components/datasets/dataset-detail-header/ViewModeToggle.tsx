/**
 * ViewModeToggle
 *
 * Toggle between Canvas and Table view modes for the dataset detail view.
 */

import { LayoutGrid, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ViewMode = "canvas" | "table";

export interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="px-4 py-2 border-b border-border flex items-center justify-end">
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
        <Button
          variant={viewMode === "canvas" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => onViewModeChange("canvas")}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant={viewMode === "table" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 gap-1.5"
          onClick={() => onViewModeChange("table")}
        >
          <Table2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

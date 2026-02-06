/**
 * RecordsSectionHeader
 *
 * View controls bar below the overview card.
 * Shows Export button and ViewModeToggle for Canvas/Table views.
 */

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";

export interface RecordsSectionHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport: () => void;
}

export function RecordsSectionHeader({
  viewMode,
  onViewModeChange,
  onExport,
}: RecordsSectionHeaderProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 gap-1.5 text-xs"
        onClick={onExport}
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </Button>
      <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
    </div>
  );
}

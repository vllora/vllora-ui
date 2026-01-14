/**
 * DatasetsStatusBar
 *
 * Footer status bar showing dataset statistics and sync status.
 */

import { Cloud } from "lucide-react";

interface DatasetsStatusBarProps {
  datasetCount: number;
  totalRecords: number;
}

export function DatasetsStatusBar({ datasetCount, totalRecords }: DatasetsStatusBarProps) {
  const formatRecordCount = (count: number) => {
    if (count > 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div className="border-t border-border px-6 py-2.5 flex items-center justify-center gap-6 text-xs text-muted-foreground bg-background/50 shrink-0">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span>
          Active Datasets:{" "}
          <span className="text-foreground font-medium">{datasetCount}</span>
        </span>
      </div>
      <span className="text-border">•</span>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
        <span>
          Total Records Indexed:{" "}
          <span className="text-foreground font-medium">
            {formatRecordCount(totalRecords)}
          </span>
        </span>
      </div>
      <span className="text-border">•</span>
      <div className="flex items-center gap-2">
        <Cloud className="w-3.5 h-3.5" />
        <span>Sync Status</span>
      </div>
      <span className="text-border">•</span>
      <div>
        <span>
          Workspace:{" "}
          <span className="text-foreground font-medium">Default Project</span>
        </span>
      </div>
    </div>
  );
}

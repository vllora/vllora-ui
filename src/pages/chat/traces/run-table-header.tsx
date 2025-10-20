import { Clock, DollarSign, Download, Upload, AlertTriangle } from 'lucide-react';
import { RUN_TABLE_GRID_COLUMNS } from './table-layout';

export function RunTableHeader() {
  return (
    <div
      className="grid gap-0 bg-[#0a0a0a] text-xs font-semibold text-muted-foreground uppercase tracking-wider overflow-hidden divide-x divide-border"
      style={{ gridTemplateColumns: RUN_TABLE_GRID_COLUMNS }}
    >
      <div className="flex items-center justify-center py-3 px-2 w-full">
        {/* Empty column for expand/collapse button */}
      </div>
      <div className="py-3 px-3 w-full">Run ID</div>
      <div className="py-3 px-3 w-full">Provider</div>
      <div className="flex items-center gap-1 py-3 px-2 justify-center w-full">
        <DollarSign className="w-3.5 h-3.5" />
        Cost
      </div>
      <div className="flex items-center gap-1 py-3 px-2 justify-center">
        <Upload className="w-3.5 h-3.5" />
        Input
      </div>
      <div className="flex items-center gap-1 py-3 px-2 justify-center">
        <Download className="w-3.5 h-3.5" />
        Output
      </div>
      <div className="flex items-center gap-1 py-3 px-3 border-r border-border">
        <Clock className="w-3.5 h-3.5" />
        Time
      </div>
      <div className="flex items-center gap-1 py-3 px-2 justify-center">
        <Clock className="w-3.5 h-3.5" />
        Duration
      </div>
      <div className="flex items-center gap-1 py-3 px-2 justify-center">
        <AlertTriangle className="w-3.5 h-3.5" />
        Errors
      </div>
    </div>
  );
}

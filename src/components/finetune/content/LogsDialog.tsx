/**
 * LogsDialog
 *
 * Sheet (sidebar) for displaying epoch evaluation logs.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogEntry } from "./LogEntry";

interface LogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  epoch: number;
  logs: string[];
}

export function LogsDialog({
  open,
  onOpenChange,
  epoch,
  logs,
}: LogsDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border shrink-0">
          <SheetTitle className="text-sm">Epoch {epoch} - Logs</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="space-y-1">
            {logs.map((log, idx) => (
              <LogEntry key={idx} log={log} />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

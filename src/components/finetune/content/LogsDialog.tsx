/**
 * LogsDialog
 *
 * Dialog for displaying epoch evaluation logs.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Epoch {epoch} - Logs</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-1">
          {logs.map((log, idx) => (
            <LogEntry key={idx} log={log} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

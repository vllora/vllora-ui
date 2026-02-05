/**
 * LogsPopover
 *
 * Sheet component for displaying evaluation logs with terminal-style formatting.
 * Uses Sheet (slide-in panel) to work properly inside dialogs.
 */

import { useState } from "react";
import { ScrollText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogEntry } from "@/components/finetune/content/LogEntry";

interface LogsPopoverProps {
  logs: string[];
  rowIndex: number;
}

export function LogsPopover({ logs, rowIndex }: LogsPopoverProps) {
  const [open, setOpen] = useState(false);

  if (!logs || logs.length === 0) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="p-0.5 hover:bg-muted rounded"
          title="View logs"
        >
          <ScrollText className="h-3 w-3 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border shrink-0">
          <SheetTitle className="text-sm">
            Evaluation Logs - Row #{rowIndex + 1}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="space-y-1">
            {logs.map((log, i) => (
              <LogEntry key={i} log={log} />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

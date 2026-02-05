/**
 * ConversationDialog
 *
 * Dialog showing the full conversation (input messages and model output) for a training row.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";
import { type Message } from "./utils";
import { cn } from "@/lib/utils";
import { getRoleStyle } from "@/components/datasets/records-table/cells/ConversationThreadCell.utilities";

interface ConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowIndex: number;
  inputMessages: Message[];
  outputMessage: Message | null;
}

export function ConversationDialog({
  open,
  onOpenChange,
  rowIndex,
  inputMessages,
  outputMessage,
}: ConversationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Row #{rowIndex} - Conversation
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Input Messages */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Input
            </span>
            <div className="space-y-3">
              {inputMessages.map((msg, idx) => (
                <div key={idx} className="text-xs">
                  <span className={cn("font-medium px-1.5 py-0.5 rounded text-[10px] uppercase", getRoleStyle(msg.role).badgeClass)}>
                    {msg.role}
                  </span>
                  <div className="mt-2 text-foreground/90 text-sm prose prose-sm dark:prose-invert max-w-none pl-1">
                    <MarkdownViewer message={msg.content} />
                  </div>
                </div>
              ))}
              {inputMessages.length === 0 && (
                <div className="text-xs text-muted-foreground italic">
                  No input messages
                </div>
              )}
            </div>
          </div>

          {/* Output Message */}
          {outputMessage && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Model Output
              </span>
              <div className="text-xs">
                <span className={cn("font-medium px-1.5 py-0.5 rounded text-[10px] uppercase", getRoleStyle("assistant").badgeClass)}>
                  assistant
                </span>
                <div className="mt-2 text-foreground/90 text-sm prose prose-sm dark:prose-invert max-w-none pl-1">
                  <MarkdownViewer message={outputMessage.content} />
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

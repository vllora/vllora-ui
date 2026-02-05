/**
 * ConversationDialog
 *
 * Sheet (sidebar) showing the full conversation (input messages and model output) for a training row.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border shrink-0">
          <SheetTitle className="text-sm">
            Row #{rowIndex} - Conversation
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
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
      </SheetContent>
    </Sheet>
  );
}

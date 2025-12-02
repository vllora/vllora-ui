import type { ToolCall } from "@/types/experiment";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ToolCallEditorDialogProps {
  toolCall: ToolCall | null;
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onReset: () => void;
}

export function ToolCallEditorDialog({
  toolCall,
  value,
  open,
  onOpenChange,
  onChange,
  onReset,
}: ToolCallEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {toolCall && (
              <>
                <span className="text-xs text-muted-foreground font-mono">
                  {toolCall.id}
                </span>
                <span className="text-sm font-medium text-[rgb(var(--theme-500))]">
                  {toolCall.function?.name || "unknown"}
                </span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 border border-border rounded-lg overflow-hidden">
          <JsonEditor
            value={value}
            onChange={onChange}
            hideValidation
            transparentBackground
            disableStickyScroll
          />
        </div>
        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onReset}>
            Reset
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

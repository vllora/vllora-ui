import { useState, useCallback } from "react";
import { Trash2, Maximize2 } from "lucide-react";
import type { ToolCall } from "@/types/experiment";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolCallEditorDialog } from "./ToolCallEditorDialog";

interface ToolCallsEditorProps {
  toolCalls: ToolCall[];
  onChange: (toolCalls: ToolCall[]) => void;
}

export function ToolCallsEditor({
  toolCalls,
  onChange,
}: ToolCallsEditorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [originalValue, setOriginalValue] = useState("");

  const handleToolCallChange = useCallback((index: number, value: string) => {
    try {
      const parsed = JSON.parse(value);
      const newToolCalls = [...toolCalls];
      newToolCalls[index] = parsed;
      onChange(newToolCalls);
    } catch {
      // Invalid JSON, ignore
    }
  }, [toolCalls, onChange]);

  const handleDeleteToolCall = useCallback((index: number) => {
    const newToolCalls = toolCalls.filter((_, i) => i !== index);
    onChange(newToolCalls);
  }, [toolCalls, onChange]);

  const handleOpenDialog = useCallback((index: number) => {
    const value = JSON.stringify(toolCalls[index], null, 2);
    setEditingIndex(index);
    setDialogValue(value);
    setOriginalValue(value);
    setDialogOpen(true);
  }, [toolCalls]);

  const handleReset = useCallback(() => {
    setDialogValue(originalValue);
    // Also reset the actual tool call
    if (editingIndex !== null) {
      try {
        const parsed = JSON.parse(originalValue);
        const newToolCalls = [...toolCalls];
        newToolCalls[editingIndex] = parsed;
        onChange(newToolCalls);
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, [originalValue, editingIndex, toolCalls, onChange]);

  const handleDialogChange = useCallback((value: string) => {
    setDialogValue(value);
    // Try to apply changes in real-time
    if (editingIndex !== null) {
      try {
        const parsed = JSON.parse(value);
        const newToolCalls = [...toolCalls];
        newToolCalls[editingIndex] = parsed;
        onChange(newToolCalls);
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, [editingIndex, toolCalls, onChange]);

  const currentToolCall = editingIndex !== null ? toolCalls[editingIndex] : null;

  return (
    <>
      <div className="mt-2 border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-muted/50">
          <span className="text-sm font-medium">
            Tool Calls ({toolCalls.length})
          </span>
        </div>

        <div className="divide-y divide-border">
          {toolCalls.map((toolCall, index) => (
            <div key={toolCall.id || index} className="bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {toolCall.function?.name || "unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {toolCall.id}
                  </span>
                </div>
                <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleOpenDialog(index)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Expand editor</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleDeleteToolCall(index)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete tool call</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
              <div className="h-[20vh]">
                <JsonEditor
                  value={JSON.stringify(toolCall, null, 2)}
                  onChange={(value) => handleToolCallChange(index, value)}
                  hideValidation
                  transparentBackground
                  disableStickyScroll
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <ToolCallEditorDialog
        toolCall={currentToolCall}
        value={dialogValue}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onChange={handleDialogChange}
        onReset={handleReset}
      />
    </>
  );
}

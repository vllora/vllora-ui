import { useState, type RefObject } from "react";
import { ChevronDown, ChevronRight, Maximize2, X, Copy, Check, Code2 } from "lucide-react";
import type { Tool } from "@/hooks/useExperiment";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import { ToolEditorDialog } from "./ToolEditorDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToolsSectionProps {
  tools: Tool[];
  onToolsChange: (tools: Tool[]) => void;
  highlightedIndex?: number | null;
  lastToolRef?: RefObject<HTMLDivElement | null>;
}

export function ToolsSection({ tools, onToolsChange, highlightedIndex, lastToolRef }: ToolsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  // Track draft content for each tool (allows invalid JSON during editing)
  const [draftContents, setDraftContents] = useState<Record<number, string>>({});
  // Track which tool's dialog is open
  const [dialogOpenIndex, setDialogOpenIndex] = useState<number | null>(null);
  // Track which tool was copied (for showing checkmark)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (index: number, tool: Tool) => {
    await navigator.clipboard.writeText(JSON.stringify(tool, null, 2));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getToolContent = (index: number, tool: Tool): string => {
    return draftContents[index] ?? JSON.stringify(tool, null, 2);
  };

  const handleToolChange = (index: number, content: string) => {
    // Always update draft
    setDraftContents(prev => ({ ...prev, [index]: content }));

    // Try to update actual tool if valid JSON
    try {
      const parsedTool = JSON.parse(content);
      const newTools = [...tools];
      newTools[index] = parsedTool;
      onToolsChange(newTools);
    } catch {
      // Invalid JSON, keep in draft state only
    }
  };

  const deleteTool = (index: number) => {
    const newTools = tools.filter((_, i) => i !== index);
    onToolsChange(newTools);
  };

  // Don't render if no tools
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border pt-4">
      <div
        className="flex items-center gap-2 cursor-pointer mb-3 px-3 py-2 -mx-3 rounded-md hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">Tools / Functions</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {tools.length}
        </span>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {tools.map((tool, index) => {
            const isLast = index === tools.length - 1;
            return (
              <div
                key={index}
                ref={isLast ? lastToolRef : undefined}
                className={`border border-border rounded-lg p-3 transition-all ${
                  highlightedIndex === index ? "animate-highlight-flash" : ""
                }`}
              >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded border border-border/50">
                  <Code2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-medium font-mono text-foreground">
                    {tool.function?.name || `Tool ${index + 1}`}
                  </span>
                </div>
                <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-1">
                    {/* Copy button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleCopy(index, tool)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          {copiedIndex === index ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{copiedIndex === index ? "Copied!" : "Copy JSON"}</TooltipContent>
                    </Tooltip>

                    {/* Expand to dialog */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setDialogOpenIndex(index)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Expand editor</TooltipContent>
                    </Tooltip>

                    {/* Delete button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => deleteTool(index)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete tool</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
              <div className="h-[20vh]">
                <JsonEditor
                  value={getToolContent(index, tool)}
                  hideValidation
                  onChange={(content) => handleToolChange(index, content)}
                  transparentBackground
                  disableStickyScroll
                />
              </div>

              {/* Tool Editor Dialog */}
              <ToolEditorDialog
                tool={tool}
                toolName={tool.function?.name || `Tool ${index + 1}`}
                isOpen={dialogOpenIndex === index}
                onOpenChange={(open) => setDialogOpenIndex(open ? index : null)}
                onApply={(content) => handleToolChange(index, content)}
              />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

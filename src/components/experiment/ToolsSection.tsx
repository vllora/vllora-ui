import { useState, type RefObject } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Tool } from "@/hooks/useExperiment";

interface ToolsSectionProps {
  tools: Tool[];
  onToolsChange: (tools: Tool[]) => void;
  highlightedIndex?: number | null;
  lastToolRef?: RefObject<HTMLDivElement | null>;
}

export function ToolsSection({ tools, onToolsChange, highlightedIndex, lastToolRef }: ToolsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const updateTool = (index: number, toolJson: string) => {
    try {
      const parsedTool = JSON.parse(toolJson);
      const newTools = [...tools];
      newTools[index] = parsedTool;
      onToolsChange(newTools);
    } catch (e) {
      // Invalid JSON, don't update
      console.error("Invalid tool JSON:", e);
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
        className="flex items-center gap-2 cursor-pointer mb-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">
          Tools / Functions ({tools.length})
        </h3>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {tools.map((tool, index) => {
            const isLast = index === tools.length - 1;
            return (
              <div
                key={index}
                ref={isLast ? lastToolRef : undefined}
                className={`border border-border rounded-lg p-3 bg-muted/30 transition-all ${
                  highlightedIndex === index ? "animate-highlight-flash" : ""
                }`}
              >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {tool.function.name || `Tool ${index + 1}`}
                </span>
                <button
                  onClick={() => deleteTool(index)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={JSON.stringify(tool, null, 2)}
                onChange={(e) => updateTool(index, e.target.value)}
                className="w-full min-h-[120px] bg-background border border-border rounded px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder='{\n  "type": "function",\n  "function": {\n    "name": "get_weather",\n    "description": "Get weather",\n    "parameters": {...}\n  }\n}'
              />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

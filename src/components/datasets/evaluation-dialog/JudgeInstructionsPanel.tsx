/**
 * JudgeInstructionsPanel
 *
 * Left panel for editing the judge prompt template with mustache-style variables.
 */

import { Sparkles } from "lucide-react";
import { MustacheEditor } from "@/components/ui/mustache-editor";

// Available template variables that can be used in the prompt template
export const AVAILABLE_VARIABLES = [
  { name: "messages", description: "The conversation messages (input)" },
  { name: "response", description: "The assistant's response (output)" },
];

interface JudgeInstructionsPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export function JudgeInstructionsPanel({
  value,
  onChange,
}: JudgeInstructionsPanelProps) {
  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Judge Instructions</span>
        </div>
        <span className="text-xs text-muted-foreground">Prompt Template</span>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <MustacheEditor
          value={value}
          onChange={onChange}
          variables={AVAILABLE_VARIABLES}
          transparentBackground
        />
      </div>

      {/* Footer with variables info */}
      <div className="flex items-center justify-between h-10 px-5 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Variables:{" "}
          {AVAILABLE_VARIABLES.map((v, i) => (
            <span key={v.name}>
              <code className="text-[rgb(var(--theme-400))]">{`{{${v.name}}}`}</code>
              {i < AVAILABLE_VARIABLES.length - 1 && ", "}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

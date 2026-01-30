/**
 * OutputSchemaPanel
 *
 * Right panel for editing the JSON schema that defines the structured output format.
 */

import { Button } from "@/components/ui/button";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Zap,
} from "lucide-react";

interface OutputSchemaPanelProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  onPrettify: () => void;
}

export function OutputSchemaPanel({
  value,
  onChange,
  error,
  onPrettify,
}: OutputSchemaPanelProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Structured Output Schema</span>
        </div>
        <span className="text-xs text-muted-foreground">JSON Schema</span>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden relative">
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>

        <JsonEditor
          value={value}
          onChange={onChange}
          hideValidation
          transparentBackground
        />
      </div>

      {/* Footer with validation status */}
      <div className="flex items-center justify-between h-10 px-5 border-t border-border bg-muted/30">
        <div className="flex items-center gap-2">
          {error ? (
            <>
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-500">Invalid JSON Schema</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-[rgb(var(--theme-500))]" />
              <span className="text-xs text-[rgb(var(--theme-500))]">VALID JSON SCHEMA</span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={onPrettify}
        >
          <Zap className="w-3.5 h-3.5" />
          Prettify
        </Button>
      </div>
    </div>
  );
}

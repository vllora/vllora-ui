/**
 * EvaluationConfigPanel
 *
 * Inline panel for configuring JavaScript evaluation settings.
 * Displayed as a tab in the dataset main content area.
 */

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  Code2,
  Copy,
  RotateCcw,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import type { EvaluationConfig } from "@/types/dataset-types";

/** Methods exposed via ref for external control */
export interface EvaluationConfigPanelRef {
  reset: () => void;
  copy: () => void;
}

// Default script for the JavaScript evaluator (same as JavaScriptPanel)
const DEFAULT_SCRIPT = `// Simple example: Call LLM-as-judge evaluator from JavaScript
// This is a minimal working example

function evaluate(input) {
  // Define the LLM-as-judge configuration
  const config = {
    prompt_template: [
      {
        role: "system",
        content: "You are an expert evaluator. Evaluate the quality of the response."
      },
      {
        role: "user",
        content: "Response to evaluate: {{response}}\\n\\nProvide a score from 0 to 1 and reasoning."
      }
    ],
    output_schema: {
      type: "object",
      properties: {
        score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Quality score from 0 to 1"
        },
        reasoning: {
          type: "string",
          description: "Explanation of the score"
        }
      },
      required: ["score", "reasoning"],
      additionalProperties: false
    },
    completion_params: {
      model_name: "gpt-4o-mini",
      temperature: 0.0,
      max_tokens: 300
    }
  };

  // Call LLM-as-judge with the config and input row
  try {
    console.log("Calling LLM-as-judge with config: ", config);
    const result = __langdb_call_llm_as_judge_obj(config, input);

    // Check for errors
    if (result.error) {
      return {
        score: 0,
        reason: \`LLM-as-judge error: \${result.error}\`
      };
    }

    // Return the evaluation result
    return {
      score: result.score || 0,
      reason: result.reason || result.reasoning || "Evaluation completed"
    };
  } catch (error) {
    return {
      score: 0,
      reason: \`Error: \${error.message}\`
    };
  }
}
`;

interface EvaluationConfigPanelProps {
  config?: EvaluationConfig;
  onSave: (config: EvaluationConfig) => Promise<void>;
  /** Hide header action buttons (Reset/Copy) when they're shown externally */
  hideHeaderActions?: boolean;
}

export const EvaluationConfigPanel = forwardRef<EvaluationConfigPanelRef, EvaluationConfigPanelProps>(
  function EvaluationConfigPanel({ config, onSave, hideHeaderActions = false }, ref) {
  // JavaScript evaluator state
  const [script, setScript] = useState(DEFAULT_SCRIPT);

  // UI state
  const [isSaving, setIsSaving] = useState(false);

  // Initialize from config
  useEffect(() => {
    if (config?.type === "js" && config.script) {
      setScript(config.script);
    }
  }, [config]);

  // Track if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!config) return script !== DEFAULT_SCRIPT;
    const configScript = config.type === "js" ? config.script : DEFAULT_SCRIPT;
    return script !== configScript;
  }, [config, script]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        type: "js",
        script,
        completionParams: {
          model: "gpt-4o", // Default model for LLM-as-judge calls within script
        },
      });
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(script);
  };

  const handleReset = () => {
    setScript(DEFAULT_SCRIPT);
  };

  // Expose reset and copy methods to parent via ref
  useImperativeHandle(ref, () => ({
    reset: handleReset,
    copy: handleCopy,
  }), [script]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">JavaScript Evaluator</span>
          <span className="text-xs text-muted-foreground ml-2">
            Define how training samples are scored using JavaScript
          </span>
        </div>
        {!hideHeaderActions && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleCopy}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </Button>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language="javascript"
          value={script}
          onChange={(v) => setScript(v || "")}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 16, bottom: 16 },
            scrollbar: {
              vertical: "auto",
              horizontal: "hidden",
              verticalScrollbarSize: 8,
            },
          }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end px-5 py-3 border-t border-border bg-muted/20 shrink-0">
        {/* Save button */}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white h-7"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          {hasChanges ? "Save Changes" : "Saved"}
        </Button>
      </div>
    </div>
  );
});

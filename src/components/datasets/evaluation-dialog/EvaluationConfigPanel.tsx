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
const DEFAULT_SCRIPT = `/**
 * Evaluate the quality of an AI response using LLM-as-a-Judge.
 *
 * Available globals:
 * - __langdb_call_llm_as_judge_obj(prompt): Calls the configured LLM model
 *   and returns a parsed object with { score, reasoning }
 *
 * @param {Object} input - The input object containing messages
 * @param {Array} input.messages - The conversation messages
 * @param {Object} output - The output object containing the response
 * @param {Object|Array} output.messages - The assistant's response
 * @returns {Object} - Evaluation result with score and reasoning
 */
function evaluate(input, output) {
  // Extract the user query from input messages
  const userMessages = input.messages?.filter(m => m.role === 'user') || [];
  const query = userMessages[userMessages.length - 1]?.content || '';

  // Extract the assistant's response
  const response = Array.isArray(output.messages)
    ? output.messages.map(m => m.content).join('\\n')
    : output.messages?.content || '';

  // Build the evaluation prompt for the LLM judge
  const prompt = \`You are an expert evaluator assessing the quality of an AI assistant's response.

User Query:
\${query}

Assistant Response:
\${response}

Evaluate the response on the following criteria:
1. Relevance: Does it directly address the user's question?
2. Accuracy: Is the information correct and reliable?
3. Completeness: Does it fully answer the question?
4. Clarity: Is it well-structured and easy to understand?

Provide your evaluation as JSON with:
- score: A number from 1-5 (1=poor, 5=excellent)
- reasoning: A brief explanation of your score\`;

  // Call the LLM judge and get structured result
  const result = __langdb_call_llm_as_judge_obj(prompt);

  return {
    score: result.score,
    reasoning: result.reasoning,
  };
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

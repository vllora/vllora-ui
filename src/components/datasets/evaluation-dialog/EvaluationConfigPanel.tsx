/**
 * EvaluationConfigPanel
 *
 * IDE-style evaluator panel: code editor + inline dry run results.
 * No header — parent tab provides context. Smart status bar footer.
 */

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  Copy,
  RotateCcw,
  FlaskConical,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { DryRunInlinePanel } from "./DryRunInlinePanel";
import { cn } from "@/lib/utils";

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

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  automaticLayout: true,
  tabSize: 2,
  padding: { top: 16, bottom: 16 },
  scrollbar: {
    vertical: "auto" as const,
    horizontal: "hidden" as const,
    verticalScrollbarSize: 8,
  },
};

interface EvaluationConfigPanelProps {
  evalScript?: string;
  onSave: (script: string) => Promise<void>;
  /** Hide editor action buttons (Reset/Copy) when they're shown externally */
  hideHeaderActions?: boolean;
  /** Number of records in the dataset (for dry run config) */
  recordCount: number;
}

export const EvaluationConfigPanel = forwardRef<EvaluationConfigPanelRef, EvaluationConfigPanelProps>(
  function EvaluationConfigPanel({ evalScript, onSave, hideHeaderActions = false, recordCount }, ref) {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [isSaving, setIsSaving] = useState(false);
  const [showDryRunPanel, setShowDryRunPanel] = useState(false);

  const { runningJob, lastCompletedJob } = DryRunJobsConsumer();

  // Auto-show panel when there's a running job or completed results
  useEffect(() => {
    if (runningJob || lastCompletedJob) {
      setShowDryRunPanel(true);
    }
  }, [runningJob, lastCompletedJob]);

  useEffect(() => {
    if (evalScript) {
      setScript(evalScript);
    }
  }, [evalScript]);

  const hasChanges = useMemo(() => {
    if (!evalScript) return script !== DEFAULT_SCRIPT;
    return script !== evalScript;
  }, [evalScript, script]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(script);
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

  useImperativeHandle(ref, () => ({
    reset: handleReset,
    copy: handleCopy,
  }), [script]);

  const hasGraderConfig = !!evalScript;

  // Contextual label for the dry run toggle button
  const dryRunButtonLabel = useMemo(() => {
    if (runningJob) return "View Progress";
    if (lastCompletedJob?.result) return "Results";
    return "Test Grader";
  }, [runningJob, lastCompletedJob]);

  // Last result data for the status indicator
  const lastResult = lastCompletedJob?.result;
  const verdict = lastResult?.diagnosis?.verdict;
  const meanScore = lastResult?.statistics?.mean;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Editor + Dry Run split view — takes all available space */}
      <div className="flex-1 overflow-hidden">
        {showDryRunPanel ? (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={60} minSize={30}>
              <Editor
                height="100%"
                language="javascript"
                value={script}
                onChange={(v) => setScript(v || "")}
                theme="vs-dark"
                options={EDITOR_OPTIONS}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={25}>
              <DryRunInlinePanel
                recordCount={recordCount}
                hasGraderConfig={hasGraderConfig}
                onClose={() => setShowDryRunPanel(false)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <Editor
            height="100%"
            language="javascript"
            value={script}
            onChange={(v) => setScript(v || "")}
            theme="vs-dark"
            options={EDITOR_OPTIONS}
          />
        )}
      </div>

      {/* Status bar — compact, IDE-style */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-800/80 shrink-0">
        {/* Left: editor actions */}
        {!hideHeaderActions && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleReset}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Reset to default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Copy script"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Center: contextual status — clickable to open panel */}
        <div className="flex-1 flex items-center justify-center">
          {!showDryRunPanel && runningJob && (
            <button
              onClick={() => setShowDryRunPanel(true)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs hover:bg-zinc-800/80 transition-colors text-blue-400"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="font-medium">Evaluating...</span>
            </button>
          )}
          {!showDryRunPanel && !runningJob && verdict && meanScore !== undefined && (
            <button
              onClick={() => setShowDryRunPanel(true)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs hover:bg-zinc-800/80 transition-colors"
            >
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                verdict === "GO" ? "bg-emerald-500" :
                verdict === "NO-GO" ? "bg-red-500" : "bg-amber-500"
              )} />
              <span className="font-mono font-medium text-zinc-300">{meanScore.toFixed(2)}</span>
              <span className="text-zinc-500">avg</span>
              <span className={cn(
                "text-[10px] font-semibold uppercase tracking-wide",
                verdict === "GO" ? "text-emerald-400" :
                verdict === "NO-GO" ? "text-red-400" : "text-amber-400"
              )}>
                {verdict}
              </span>
            </button>
          )}
        </div>

        {/* Right: dry run toggle + save */}
        <div className="flex items-center gap-1.5">
          {evalScript && !showDryRunPanel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDryRunPanel(true)}
              className="h-7 text-xs gap-1.5 text-zinc-400 hover:text-zinc-200"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {dryRunButtonLabel}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className={cn(
              "h-7 text-xs gap-1.5",
              hasChanges
                ? "bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
                : "bg-transparent text-zinc-500 border-none shadow-none hover:bg-transparent cursor-default"
            )}
          >
            {isSaving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : !hasChanges ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500/60" />
            ) : null}
            {hasChanges ? "Save" : "Saved"}
          </Button>
        </div>
      </div>
    </div>
  );
});

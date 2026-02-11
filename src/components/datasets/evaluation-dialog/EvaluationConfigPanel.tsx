/**
 * EvaluationConfigPanel
 *
 * VS Code-style evaluator panel: code editor on top, tabbed bottom panel below.
 * Editor header bar has: label, template/copy icons, config popover, run button, save.
 * Bottom panel shows: Results, History, Running (no Config tab).
 */

import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle, useCallback } from "react";
import {
  Loader2,
  CheckCircle2,
  Copy,
  FileCode2,
  Play,
  Settings,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EvaluationBottomPanel } from "./EvaluationBottomPanel";
import { cn } from "@/lib/utils";
import type { ImperativePanelHandle } from "react-resizable-panels";

/** Methods exposed via ref for external control */
export interface EvaluationConfigPanelRef {
  reset: () => void;
  copy: () => void;
}

// Placeholder shown when no grader is configured yet
const PLACEHOLDER_SCRIPT = `// Grader Script — Evaluate the quality of each training record
//
// Write a function called \`evaluate(input)\` that returns:
//   { score: number (0-1), reason: string }
//
// \`input\` contains the fields from your training data record.
//
// Tip: Use the file icon in the toolbar above to load a working example.

function evaluate(input) {
  return { score: 0, reason: "Not implemented yet" };
}
`;

// Full example template loaded via "Load template" button
const DEFAULT_SCRIPT = `// Example: Call LLM-as-judge evaluator from JavaScript
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

function getDefaultSampleSize(recordCount: number): number {
  if (recordCount <= 10) return recordCount;
  if (recordCount <= 50) return Math.min(25, recordCount);
  if (recordCount <= 200) return 50;
  return 100;
}

function getSampleSizeOptions(recordCount: number): Array<{ value: number; label: string }> {
  if (recordCount <= 10) return [{ value: recordCount, label: "All" }];
  if (recordCount <= 50) {
    const opts: Array<{ value: number; label: string }> = [];
    if (recordCount >= 10) opts.push({ value: 10, label: "10" });
    if (recordCount >= 25) opts.push({ value: 25, label: "25" });
    opts.push({ value: recordCount, label: "All" });
    return opts;
  }
  if (recordCount <= 200) {
    const opts: Array<{ value: number; label: string }> = [];
    opts.push({ value: 25, label: "25" });
    opts.push({ value: 50, label: "50" });
    if (recordCount >= 100) opts.push({ value: 100, label: "100" });
    opts.push({ value: recordCount, label: "All" });
    return opts;
  }
  const opts: Array<{ value: number; label: string }> = [];
  opts.push({ value: 100, label: "100" });
  opts.push({ value: 200, label: "200" });
  if (recordCount >= 300) opts.push({ value: 300, label: "300" });
  if (recordCount >= 500) opts.push({ value: 500, label: "500" });
  return opts;
}

const ROLLOUT_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
];

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
  const [script, setScript] = useState(evalScript || PLACEHOLDER_SCRIPT);
  const [isSaving, setIsSaving] = useState(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false);
  const [sampleSize, setSampleSize] = useState(() => getDefaultSampleSize(recordCount));
  const [rolloutModel, setRolloutModel] = useState("gpt-4o-mini");

  const bottomPanelRef = useRef<ImperativePanelHandle>(null);
  const { runningJob, lastCompletedJob, startDryRun } = DryRunJobsConsumer();

  useEffect(() => {
    setSampleSize(getDefaultSampleSize(recordCount));
  }, [recordCount]);

  // Auto-expand bottom panel when a job starts or completes
  useEffect(() => {
    if (runningJob || lastCompletedJob) {
      if (bottomPanelRef.current?.isCollapsed()) {
        bottomPanelRef.current.expand();
      }
    }
  }, [runningJob, lastCompletedJob]);

  useEffect(() => {
    if (evalScript) {
      setScript(evalScript);
    }
  }, [evalScript]);

  const hasChanges = useMemo(() => {
    if (!evalScript) return script !== PLACEHOLDER_SCRIPT && script.trim() !== "";
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

  const handleLoadTemplate = () => {
    setScript(DEFAULT_SCRIPT);
  };

  useImperativeHandle(ref, () => ({
    reset: handleLoadTemplate,
    copy: handleCopy,
  }), [script]);

  const hasGraderConfig = !!evalScript;

  const handleToggleBottomPanel = useCallback(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  const handleRunDryRun = useCallback(async () => {
    if (!hasGraderConfig) return;
    try {
      await startDryRun(sampleSize, rolloutModel);
      // Bottom panel auto-expands via the useEffect above
    } catch (error) {
      console.error("Failed to start dry run:", error);
    }
  }, [hasGraderConfig, sampleSize, rolloutModel, startDryRun]);

  const sampleOptions = getSampleSizeOptions(recordCount);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="eval-panel-layout"
      >
        {/* Top: editor header + Monaco editor */}
        <ResizablePanel defaultSize={65} minSize={20}>
          <div className="flex flex-col h-full">
            {/* Editor header bar */}
            <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800/60 bg-zinc-900/40 shrink-0">
              <span className="text-xs font-medium text-zinc-400 px-1">Grader Script</span>
              {!hideHeaderActions && (
                <>
                  <div className="w-px h-3.5 bg-zinc-700/50 mx-1" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleLoadTemplate}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Load example template
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Copy script
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              <div className="flex-1" />

              {/* Dry run config popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-64 p-3">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                        Sample Size
                      </label>
                      <div className="flex gap-1">
                        {sampleOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSampleSize(option.value)}
                            className={cn(
                              "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                              sampleSize === option.value
                                ? "bg-zinc-700 text-zinc-100"
                                : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-zinc-600">
                        {recordCount.toLocaleString()} records available
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                        Rollout Model
                      </label>
                      <Select value={rolloutModel} onValueChange={setRolloutModel}>
                        <SelectTrigger className="h-8 bg-zinc-800/50 border-zinc-700/50 text-xs text-zinc-300 focus:ring-zinc-600 focus:ring-offset-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLLOUT_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Run dry run button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleRunDryRun}
                    disabled={!hasGraderConfig || !!runningJob}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                      hasGraderConfig && !runningJob
                        ? "text-[rgb(var(--theme-400))] hover:text-[rgb(var(--theme-300))] hover:bg-zinc-800"
                        : "text-zinc-600 cursor-not-allowed"
                    )}
                  >
                    {runningJob ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    {runningJob ? "Running..." : "Run"}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {!hasGraderConfig ? "Save grader script first" : runningJob ? "Dry run in progress" : `Run dry run (${sampleSize} samples)`}
                </TooltipContent>
              </Tooltip>

              <div className="w-px h-3.5 bg-zinc-700/50 mx-0.5" />

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
                  hasChanges
                    ? "text-[rgb(var(--theme-400))] hover:text-[rgb(var(--theme-300))] hover:bg-zinc-800"
                    : "text-zinc-600 cursor-default"
                )}
              >
                {isSaving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : !hasChanges ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500/60" />
                ) : null}
                {hasChanges ? "Save" : "Saved"}
              </button>
            </div>
            </TooltipProvider>

            {/* Code editor */}
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language="javascript"
                value={script}
                onChange={(v) => setScript(v || "")}
                theme="vs-dark"
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Bottom: tabbed panel (Results, History, Running) */}
        <ResizablePanel
          ref={bottomPanelRef}
          defaultSize={35}
          minSize={8}
          collapsible
          collapsedSize={4}
          onCollapse={() => setIsBottomCollapsed(true)}
          onExpand={() => setIsBottomCollapsed(false)}
        >
          <EvaluationBottomPanel
            isCollapsed={isBottomCollapsed}
            onToggleCollapse={handleToggleBottomPanel}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
});

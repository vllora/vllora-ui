/**
 * EvaluationConfigPanel
 *
 * Inline panel for configuring JavaScript evaluation settings.
 * Displayed as a tab in the dataset main content area.
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  Zap,
  Code2,
  Copy,
  RotateCcw,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import type { EvaluationConfig } from "@/types/dataset-types";

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
}

const AVAILABLE_MODELS = [
  { value: "gpt-4o", label: "GPT-4o", cost: "$0.04" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", cost: "$0.01" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", cost: "$0.05" },
  { value: "claude-3-haiku", label: "Claude 3 Haiku", cost: "$0.01" },
];

export function EvaluationConfigPanel({
  config,
  onSave,
}: EvaluationConfigPanelProps) {
  // JavaScript evaluator state
  const [script, setScript] = useState(DEFAULT_SCRIPT);

  // Completion params
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.0);
  const [maxTokens, setMaxTokens] = useState(2048);

  // UI state
  const [isSaving, setIsSaving] = useState(false);

  // Initialize from config
  useEffect(() => {
    if (config) {
      setSelectedModel(config.completionParams.model || "gpt-4o");
      setTemperature(config.completionParams.temperature ?? 0.0);
      setMaxTokens(config.completionParams.maxTokens ?? 2048);

      if (config.type === "js" && config.script) {
        setScript(config.script);
      }
    }
  }, [config]);

  // Track if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!config) return script !== DEFAULT_SCRIPT;

    const configScript = config.type === "js" ? config.script : DEFAULT_SCRIPT;
    return (
      script !== configScript ||
      selectedModel !== (config.completionParams.model || "gpt-4o") ||
      temperature !== (config.completionParams.temperature ?? 0.0) ||
      maxTokens !== (config.completionParams.maxTokens ?? 2048)
    );
  }, [config, script, selectedModel, temperature, maxTokens]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        type: "js",
        script,
        completionParams: {
          model: selectedModel,
          temperature,
          maxTokens,
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

  const selectedModelInfo = AVAILABLE_MODELS.find((m) => m.value === selectedModel);

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
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20 shrink-0">
        {/* Model and parameters */}
        <div className="flex items-center gap-6">
          {/* Hint */}
          <p className="text-xs text-muted-foreground">
            Use <code className="text-[rgb(var(--theme-400))]">__langdb_call_llm_as_judge_obj(prompt)</code> to call the LLM judge
          </p>

          <div className="h-4 w-px bg-border" />

          {/* Model selector */}
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-amber-500/10">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Model:</span>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-6 w-[140px] text-xs border-0 bg-transparent p-0 text-[rgb(var(--theme-500))] font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">
              ~{selectedModelInfo?.cost}/100 evals
            </span>
          </div>

          {/* Temperature */}
          <div className="flex items-center gap-1.5">
            <Label htmlFor="temperature" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Temp:
            </Label>
            <Input
              id="temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
              className="h-6 w-14 text-xs"
            />
          </div>

          {/* Max Tokens */}
          <div className="flex items-center gap-1.5">
            <Label htmlFor="maxTokens" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Max:
            </Label>
            <Input
              id="maxTokens"
              type="number"
              min={1}
              max={8192}
              step={256}
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
              className="h-6 w-16 text-xs"
            />
          </div>
        </div>

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
}

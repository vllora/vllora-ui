/**
 * EvaluationConfigDialog
 *
 * Dialog for configuring evaluation settings.
 * Supports both LLM-as-a-Judge and JavaScript evaluator types.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Scale,
  CheckCircle2,
  Zap,
  Code2,
} from "lucide-react";
import { JudgeInstructionsPanel } from "./JudgeInstructionsPanel";
import { OutputSchemaPanel } from "./OutputSchemaPanel";
import { JavaScriptPanel, DEFAULT_SCRIPT } from "./JavaScriptPanel";
import type { EvaluationConfig, EvaluatorType } from "@/types/dataset-types";

interface EvaluationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: EvaluationConfig;
  onSave: (config: EvaluationConfig) => Promise<void>;
}

const DEFAULT_PROMPT_TEMPLATE = `You are an expert evaluator assessing the quality of AI assistant responses.

Instructions:
1. Carefully read the conversation below between the user and the assistant.
2. Evaluate the response on the following criteria:
   - Accuracy: Are all claims factually correct?
   - Helpfulness: Does the response address the user's question?
   - Clarity: Is the response well-structured and easy to understand?
   - Tone: Is the tone professional and appropriate?
3. Provide a score from 1-5 and detailed reasoning.

<conversation>
{{messages}}
</conversation>

<assistant_response>
{{response}}
</assistant_response>

Based on your evaluation criteria, provide your assessment with a score and reasoning.`;

const DEFAULT_OUTPUT_SCHEMA = JSON.stringify(
  {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      score: {
        type: "integer",
        minimum: 1,
        maximum: 5,
      },
      reasoning: {
        type: "string",
        description: "Explanation of the assigned score",
      },
      flags: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["score", "reasoning"],
  },
  null,
  2
);

const AVAILABLE_MODELS = [
  { value: "gpt-4o", label: "GPT-4o (structured)", cost: "$0.04" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", cost: "$0.01" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", cost: "$0.05" },
  { value: "claude-3-haiku", label: "Claude 3 Haiku", cost: "$0.01" },
];

export function EvaluationConfigDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: EvaluationConfigDialogProps) {
  // Evaluator type tab
  const [evaluatorType, setEvaluatorType] = useState<EvaluatorType>("llm_as_judge");

  // LLM Judge specific state
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [outputSchema, setOutputSchema] = useState(DEFAULT_OUTPUT_SCHEMA);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // JavaScript evaluator specific state
  const [script, setScript] = useState(DEFAULT_SCRIPT);

  // Shared completion params
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.0);
  const [maxTokens, setMaxTokens] = useState(2048);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Initialize from config when dialog opens
  useEffect(() => {
    if (open && config) {
      setEvaluatorType(config.type);
      setSelectedModel(config.completionParams.model || "gpt-4o");
      setTemperature(config.completionParams.temperature ?? 0.0);
      setMaxTokens(config.completionParams.maxTokens ?? 2048);

      if (config.type === "llm_as_judge") {
        setPromptTemplate(config.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
        setOutputSchema(config.outputSchema || DEFAULT_OUTPUT_SCHEMA);
      } else {
        setScript(config.script || DEFAULT_SCRIPT);
      }
    }
  }, [open, config]);

  // Validate JSON schema (only for LLM Judge)
  useEffect(() => {
    if (evaluatorType === "llm_as_judge") {
      try {
        JSON.parse(outputSchema);
        setSchemaError(null);
      } catch (e) {
        setSchemaError((e as Error).message);
      }
    } else {
      setSchemaError(null);
    }
  }, [outputSchema, evaluatorType]);

  const handleSave = async () => {
    if (evaluatorType === "llm_as_judge" && schemaError) return;

    setIsSaving(true);
    try {
      if (evaluatorType === "llm_as_judge") {
        await onSave({
          type: "llm_as_judge",
          promptTemplate,
          outputSchema,
          completionParams: {
            model: selectedModel,
            temperature,
            maxTokens,
          },
        });
      } else {
        await onSave({
          type: "js",
          script,
          completionParams: {
            model: selectedModel,
            temperature,
            maxTokens,
          },
        });
      }
      onOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    // Simulate test - in real implementation, this would call the evaluator
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsTesting(false);
  };

  const handlePrettify = () => {
    try {
      const parsed = JSON.parse(outputSchema);
      setOutputSchema(JSON.stringify(parsed, null, 2));
    } catch {
      // Keep as is if invalid
    }
  };

  const selectedModelInfo = AVAILABLE_MODELS.find((m) => m.value === selectedModel);
  const hasError = evaluatorType === "llm_as_judge" && !!schemaError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[rgb(var(--theme-500))]/10">
                <Scale className="w-5 h-5 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">
                  Evaluator Configuration
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Configure the evaluation function for scoring training samples.
                </p>
              </div>
            </div>

            {/* Evaluator Type Tabs */}
            <Tabs
              value={evaluatorType}
              onValueChange={(v) => setEvaluatorType(v as EvaluatorType)}
            >
              <TabsList className="bg-muted/50">
                <TabsTrigger value="llm_as_judge" className="gap-2">
                  <Scale className="w-4 h-4" />
                  LLM Judge
                </TabsTrigger>
                <TabsTrigger value="js" className="gap-2">
                  <Code2 className="w-4 h-4" />
                  JavaScript
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {evaluatorType === "llm_as_judge" ? (
            <div className="h-full grid grid-cols-2 divide-x divide-border">
              <JudgeInstructionsPanel
                value={promptTemplate}
                onChange={setPromptTemplate}
              />
              <OutputSchemaPanel
                value={outputSchema}
                onChange={setOutputSchema}
                error={schemaError}
                onPrettify={handlePrettify}
              />
            </div>
          ) : (
            <JavaScriptPanel
              value={script}
              onChange={setScript}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          {/* Model and parameters */}
          <div className="flex items-center gap-6">
            {/* Model selector */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-amber-500/10">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Model:</span>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="h-7 w-[180px] text-xs border-0 bg-transparent p-0 text-[rgb(var(--theme-500))] font-medium">
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
                <p className="text-xs text-muted-foreground">
                  Est. cost per 100 evals:{" "}
                  <span className="text-foreground font-medium">
                    {selectedModelInfo?.cost || "$0.00"}
                  </span>
                </p>
              </div>
            </div>

            {/* Temperature */}
            <div className="flex items-center gap-2">
              <Label htmlFor="temperature" className="text-sm font-medium whitespace-nowrap">
                Temperature:
              </Label>
              <Input
                id="temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                className="h-7 w-16 text-xs"
              />
            </div>

            {/* Max Tokens */}
            <div className="flex items-center gap-2">
              <Label htmlFor="maxTokens" className="text-sm font-medium whitespace-nowrap">
                Max Tokens:
              </Label>
              <Input
                id="maxTokens"
                type="number"
                min={1}
                max={8192}
                step={256}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
                className="h-7 w-20 text-xs"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isTesting || hasError}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Scale className="w-4 h-4" />
              )}
              Test Evaluator
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || hasError}
              className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Save Config
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

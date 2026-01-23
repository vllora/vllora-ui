/**
 * EvaluationConfigDialog
 *
 * Dialog for configuring LLM-as-a-Judge evaluation settings.
 * Allows users to define system instructions and structured output schema.
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Scale,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { JudgeInstructionsPanel } from "./JudgeInstructionsPanel";
import { OutputSchemaPanel } from "./OutputSchemaPanel";
import type { EvaluationConfig } from "@/types/dataset-types";

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
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [outputSchema, setOutputSchema] = useState(DEFAULT_OUTPUT_SCHEMA);
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Initialize from config when dialog opens
  useEffect(() => {
    if (open && config) {
      setPromptTemplate(config.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
      setOutputSchema(config.outputSchema || DEFAULT_OUTPUT_SCHEMA);
      setSelectedModel(config.model || "gpt-4o");
      setTemperature(config.temperature ?? 0.0);
      setMaxTokens(config.maxTokens ?? 2048);
    }
  }, [open, config]);

  // Validate JSON schema
  useEffect(() => {
    try {
      JSON.parse(outputSchema);
      setSchemaError(null);
    } catch (e) {
      setSchemaError((e as Error).message);
    }
  }, [outputSchema]);

  const handleSave = async () => {
    if (schemaError) return;

    setIsSaving(true);
    try {
      await onSave({
        promptTemplate,
        outputSchema,
        model: selectedModel,
        temperature,
        maxTokens,
      });
      onOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    // Simulate test - in real implementation, this would call the LLM
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
                  LLM-as-a-Judge Configuration
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Define the system instructions and the structured output format for automated evaluation.
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Main Content - Two Panel Layout */}
        <div className="flex-1 grid grid-cols-2 divide-x divide-border overflow-hidden">
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
              disabled={isTesting || !!schemaError}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Scale className="w-4 h-4" />
              )}
              Test Judge
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !!schemaError}
              className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Save Judge Config
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

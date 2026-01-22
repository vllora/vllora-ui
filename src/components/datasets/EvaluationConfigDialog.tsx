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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import {
  Loader2,
  Sparkles,
  Scale,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Copy,
  Zap,
} from "lucide-react";

interface EvaluationConfig {
  promptTemplate: string;
  outputSchema: string;
  model: string;
}

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

// Available template variables that can be used in the prompt template
const AVAILABLE_VARIABLES = [
  { name: "messages", description: "The conversation messages (input)" },
  { name: "response", description: "The assistant's response (output)" },
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
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Initialize from config when dialog opens
  useEffect(() => {
    if (open && config) {
      setPromptTemplate(config.promptTemplate || DEFAULT_PROMPT_TEMPLATE);
      setOutputSchema(config.outputSchema || DEFAULT_OUTPUT_SCHEMA);
      setSelectedModel(config.model || "gpt-4o");
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
            <Button variant="outline" size="sm" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Best Practices
            </Button>
          </div>
        </DialogHeader>

        {/* Main Content - Two Panel Layout */}
        <div className="flex-1 grid grid-cols-2 divide-x divide-border overflow-hidden">
          {/* Left Panel - Judge Instructions */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Judge Instructions</span>
              </div>
              <span className="text-xs text-muted-foreground">Prompt Template</span>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <Textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                placeholder="Enter the evaluation prompt template..."
                className="flex-1 resize-none bg-transparent border-0 focus-visible:ring-0 text-sm font-mono p-5"
              />

              <div className="flex items-center px-5 py-2.5 border-t border-border bg-muted/30">
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
          </div>

          {/* Right Panel - Structured Output Schema */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Structured Output Schema</span>
              </div>
              <span className="text-xs text-muted-foreground">JSON Schema</span>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative">
              {/* Copy button */}
              <button
                onClick={() => navigator.clipboard.writeText(outputSchema)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>

              <div className="flex-1 overflow-hidden">
                <JsonEditor
                  value={outputSchema}
                  onChange={setOutputSchema}
                  hideValidation
                />
              </div>

              {/* Footer with validation status */}
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  {schemaError ? (
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
                  onClick={handlePrettify}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Prettify
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          {/* Model selector */}
          <div className="flex items-center gap-3">
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

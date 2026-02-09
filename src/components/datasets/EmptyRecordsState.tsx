/**
 * EmptyRecordsState
 *
 * Empty state component shown when a dataset has no records.
 * Minimal design - Lucy handles guidance via context injection.
 */

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitter } from "@/utils/eventEmitter";

interface EmptyRecordsStateProps {
  datasetObjective?: string;
  hasTopicHierarchy?: boolean;
}

export function EmptyRecordsState({ datasetObjective }: EmptyRecordsStateProps) {
  const handleGetStarted = () => {
    // Simple prompt - Lucy already has full context via workflowToContext
    const prompt = datasetObjective
      ? "Help me generate training data for this dataset."
      : "Help me get started with this dataset.";
    emitter.emit("vllora_lucy_prompt", { prompt });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        {/* Subtle decorative element */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgb(var(--theme-500))]/10 to-[rgb(var(--theme-500))]/5 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[rgb(var(--theme-500))]" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            {datasetObjective ? "Ready to generate data" : "Get started"}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {datasetObjective
              ? "Chat with Lucy to create training examples, upload reference docs, or import existing data."
              : "Define your training objective and Lucy will help you build your dataset."}
          </p>
        </div>

        {/* CTA */}
        <Button
          onClick={handleGetStarted}
          size="sm"
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {datasetObjective ? "Generate with Lucy" : "Get Started"}
        </Button>
      </div>
    </div>
  );
}

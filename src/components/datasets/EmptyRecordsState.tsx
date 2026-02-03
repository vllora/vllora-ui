/**
 * EmptyRecordsState
 *
 * Empty state component shown when a dataset has no records.
 * Provides guidance and actions to help users add records.
 * Generate Data triggers Lucy assistant to help create initial data.
 */

import { Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitter } from "@/utils/eventEmitter";

interface EmptyRecordsStateProps {
  datasetObjective?: string;
}

export function EmptyRecordsState({ datasetObjective }: EmptyRecordsStateProps) {
  const handleGenerateData = () => {
    // Build a prompt for Lucy based on whether we have an objective
    const prompt = datasetObjective
      ? `This dataset has no records yet. The training objective is: "${datasetObjective}". Please help me generate initial training data for this objective. You can either generate data directly based on the objective, or suggest creating a topic hierarchy first to organize the data generation.`
      : `This dataset has no records yet. Please help me generate initial training data. You can either help me define a training objective first, or suggest creating a topic hierarchy to organize the data generation.`;

    emitter.emit("vllora_lucy_prompt", { prompt });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
        <Database className="w-8 h-8 text-muted-foreground" />
      </div>

      {/* Message */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-foreground">No records yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Ask Lucy to generate initial training data based on your dataset objective.
        </p>
      </div>

      {/* Actions */}
      <Button onClick={handleGenerateData} className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white">
        <Sparkles className="w-4 h-4" />
        Generate Data
      </Button>
    </div>
  );
}

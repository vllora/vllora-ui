import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import type { ExperimentData } from "@/hooks/useExperiment";
import { ModelSelectorComponent } from "@/components/chat/traces/model-selector";
import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { CurrentAppConsumer } from "@/contexts/CurrentAppContext";
import { ModelParametersSection } from "@/components/chat/conversation/model-config/model-parameters-section";
import { getModelInfoFromString } from "@/components/chat/conversation/model-config/utils";

interface ExperimentFooterControlsProps {
  experimentData: ExperimentData;
  running: boolean;
  updateExperimentData: (updates: Partial<ExperimentData>) => void;
  runExperiment: () => void;
}

export function ExperimentFooterControls({
  experimentData,
  running,
  updateExperimentData,
  runExperiment,
}: ExperimentFooterControlsProps) {
  const { models } = ProjectModelsConsumer();
  const { app_mode } = CurrentAppConsumer();

  // Get model info for the selected model
  const selectedModelInfo = useMemo(() => {
    return getModelInfoFromString({
      modelStr: experimentData.model,
      availableModels: models,
      availableVirtualModels: []
    });
  }, [experimentData.model, models]);

  return (
    <div className="border-t border-border p-4 bg-background flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Model:</label>
          <div className="w-[240px]">
            <ModelSelectorComponent
              selectedModel={experimentData.model}
              onModelChange={(modelId) => updateExperimentData({ model: modelId })}
              models={models.filter((model) => model.type === 'completions')}
              app_mode={app_mode}
            />
          </div>
        </div>

        <div className="ml-auto">
          <Button onClick={runExperiment} disabled={running} className="gap-2">
            <Play className="w-4 h-4" />
            {running ? "Running..." : "Run"}
          </Button>
        </div>
      </div>

      {/* Model Parameters Section */}
      {selectedModelInfo && (
        <ModelParametersSection
          modelInfo={selectedModelInfo}
          config={experimentData}
          onConfigChange={updateExperimentData}
        />
      )}
    </div>
  );
}

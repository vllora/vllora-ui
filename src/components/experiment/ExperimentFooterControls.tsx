import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Settings } from "lucide-react";
import type { ExperimentData } from "@/hooks/useExperiment";
import { ModelSelectorComponent } from "@/components/chat/traces/model-selector";
import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { CurrentAppConsumer } from "@/contexts/CurrentAppContext";
import { getModelInfoFromString } from "@/components/chat/conversation/model-config/utils";
import { ExperimentParametersDialog } from "./ExperimentParametersDialog";

interface ExperimentFooterControlsProps {
  experimentData: ExperimentData;
  running: boolean;
  updateExperimentData: (updates: Partial<ExperimentData>) => void;
  runExperiment: () => void;
  activeTab: "visual" | "json";
}

export function ExperimentFooterControls({
  experimentData,
  running,
  updateExperimentData,
  runExperiment,
  activeTab,
}: ExperimentFooterControlsProps) {
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);
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
    <>
      <div className="border-t border-border p-4 bg-background flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Only show model selector and parameters button in visual mode */}
          {activeTab === "visual" && (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setParametersDialogOpen(true)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Parameters
              </Button>
            </div>
          )}

          <div className={activeTab === "json" ? "" : "ml-auto"}>
            <Button onClick={runExperiment} disabled={running} className="gap-2">
              <Play className="w-4 h-4" />
              {running ? "Running..." : "Run"}
            </Button>
          </div>
        </div>
      </div>

      <ExperimentParametersDialog
        open={parametersDialogOpen}
        onOpenChange={setParametersDialogOpen}
        experimentData={experimentData}
        updateExperimentData={updateExperimentData}
        selectedModelInfo={selectedModelInfo}
      />
    </>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Play } from "lucide-react";
import type { ExperimentData } from "@/hooks/useExperiment";
import { ModelSelectorComponent } from "@/components/chat/traces/model-selector";
import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { CurrentAppConsumer } from "@/contexts/CurrentAppContext";
import { useUserProviderOfSelectedModelConfig } from "@/hooks/userProviderOfSelectedModelConfig";
import { ProviderConfigDialog } from "@/components/chat/traces/model-selector/ProviderConfigDialog";
import { MultiProviderConfigDialog } from "@/components/chat/traces/model-selector/MultiProviderConfigDialog";
import { ModelInfo } from "@/types/models";
import { ExperimentParametersDialog } from "./ExperimentParametersDialog";
import { SettingsButton } from "./SettingsButton";

interface ExperimentFooterControlsProps {
  experimentData: ExperimentData;
  originalExperimentData: ExperimentData | null;
  running: boolean;
  updateExperimentData: (updates: Partial<ExperimentData>) => void;
  runExperiment: () => void;
  activeTab: "visual" | "json";
}

export function ExperimentFooterControls({
  experimentData,
  originalExperimentData,
  running,
  updateExperimentData,
  runExperiment,
  activeTab,
}: ExperimentFooterControlsProps) {
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);
  const { models } = ProjectModelsConsumer();
  const { app_mode } = CurrentAppConsumer();

  // Use the provider config hook for model selector warnings and dialogs
  const {
    selectedModelInfo,
    selectedProvider,
    isSelectedProviderConfigured,
    selectedProviderForConfig,
    setSelectedProviderForConfig,
    configDialogOpen,
    setConfigDialogOpen,
    providerListDialogOpen,
    setProviderListDialogOpen,
    handleWarningClick,
  } = useUserProviderOfSelectedModelConfig({ selectedModel: experimentData.model });

  return (
    <>
      <div className="border-t border-border p-4 bg-background flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Only show model selector and parameters button in visual mode */}
          {activeTab === "visual" && (
            <div className="flex items-center gap-2">
              <div className="">
                <ModelSelectorComponent
                  selectedModel={experimentData.model}
                  onModelChange={(modelId) => updateExperimentData({ model: modelId })}
                  models={models.filter((model) => model.type === 'completions')}
                  app_mode={app_mode}
                  selectedProvider={selectedProvider}
                  isSelectedProviderConfigured={app_mode === 'langdb' || isSelectedProviderConfigured}
                  setSelectedProviderForConfig={setSelectedProviderForConfig}
                  setConfigDialogOpen={setConfigDialogOpen}
                  handleWarningClick={handleWarningClick}
                />
              </div>
              <SettingsButton
                experimentData={experimentData}
                originalExperimentData={originalExperimentData}
                selectedModelInfo={selectedModelInfo}
                onClick={() => setParametersDialogOpen(true)}
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="streaming"
                checked={experimentData.stream ?? true}
                onCheckedChange={(checked) =>
                  updateExperimentData({ stream: checked === true })
                }
              />
              <Label htmlFor="streaming" className="text-sm cursor-pointer">
                Streaming
              </Label>
            </div>
            <Button
              onClick={runExperiment}
              disabled={running}
              className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white px-6"
            >
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

      {/* Provider Configuration Dialog */}
      {selectedProviderForConfig && (
        <ProviderConfigDialog
          open={configDialogOpen}
          providerName={selectedProviderForConfig}
          onOpenChange={setConfigDialogOpen}
          onSaveSuccess={() => {}}
        />
      )}

      {/* Multiple Providers List Dialog */}
      <MultiProviderConfigDialog
        open={providerListDialogOpen}
        providers={(selectedModelInfo as ModelInfo)?.endpoints?.filter(ep => !ep.available) || []}
        onOpenChange={setProviderListDialogOpen}
        onProviderSelect={(providerName) => {
          setProviderListDialogOpen(false);
          setSelectedProviderForConfig(providerName);
          setConfigDialogOpen(true);
        }}
      />
    </>
  );
}

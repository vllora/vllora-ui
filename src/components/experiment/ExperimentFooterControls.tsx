import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Settings } from "lucide-react";
import type { ExperimentData } from "@/hooks/useExperiment";
import { ModelSelectorComponent } from "@/components/chat/traces/model-selector";
import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { CurrentAppConsumer } from "@/contexts/CurrentAppContext";
import { useUserProviderOfSelectedModelConfig } from "@/hooks/userProviderOfSelectedModelConfig";
import { ProviderConfigDialog } from "@/components/chat/traces/model-selector/ProviderConfigDialog";
import { MultiProviderConfigDialog } from "@/components/chat/traces/model-selector/MultiProviderConfigDialog";
import { ModelInfo } from "@/types/models";
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setParametersDialogOpen(true)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className={activeTab === "json" ? "" : "ml-auto"}>
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

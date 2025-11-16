import { Label } from "@/components/ui/label";
import { ModelInfo } from "@/types/models";
import { ResponseCacheConfig } from "./response-cache";
import { FallbackModelsConfig } from "./fallback-models/fallback-models";
import { MaxRetriesConfig } from "./max-retries";
import { ModelSelectorComponent } from "../../traces/model-selector";
import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { ModelParametersSection } from "./model-parameters-section";
import { MessagesSection } from "./messages-section";
import { Message } from "./types";
import { useCallback } from "react";
import { VirtualModelSelector } from "./virtual-model-selector";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { CurrentAppConsumer } from "@/lib";
import { ModelConfigDialogConsumer } from "./useModelConfigDialog";
import { Input } from "@/components/ui/input";



// interface ModelConfigDialogContentProps {
//   config: Record<string, any>;
//   onConfigChange: (config: Record<string, any>) => void;
//   onApplyVirtualModel?: (virtualModel: VirtualModel, mode: 'base' | 'copy') => void;
//   onClearVirtualModel?: () => void;
// }

export function ModelConfigDialogContent(props: {
  isCreateMode: boolean;
}) {

  const { isCreateMode } = props;
  const { models } = ProjectModelsConsumer();
  const { app_mode } = CurrentAppConsumer();

  const { config, setConfig, currentModelInfo, handleApplyVirtualModel, handleClearVirtualModel } = ModelConfigDialogConsumer();


  const handleMessagesChange = useCallback((messages: Message[]) => {
    setConfig({ ...config, messages });
  }, [config, setConfig]);

  // Check if a virtual model is being used as the base model
  const isUsingVirtualModelAsBase = config.model && typeof config.model === 'string' && config.model.startsWith('langdb/');

  // Get the current selected model from config, or derive from modelInfo
  // const selectedModel = config.model || (isModelInfo(modelInfo) ? `${modelInfo.model_provider}/${modelInfo.model}` : undefined);

  // When a virtual model is used as base, show the original base model that was saved
  // const displayedBaseModel = isUsingVirtualModelAsBase ? originalBaseModel : selectedModel;

  // Handle base model change - update config.model
  const handleModelChange = useCallback((model: string) => {
    setConfig({ ...config, model });
  }, [config, setConfig]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <TooltipProvider>
        {/* Model Selection Section */}
        <div className={`grid ${!isCreateMode ? 'grid-cols-2' : 'grid-cols-1'} gap-4 pb-4`}>
          {config.model && (
            <div className={isUsingVirtualModelAsBase ? "opacity-50 pointer-events-none" : ""}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm font-semibold text-foreground">Base Model</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {isUsingVirtualModelAsBase
                          ? "Base model is currently overridden by a virtual model (clear virtual model to use this)"
                          : "Select the foundation model for your configuration"
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex-1 flex">
                  {!isUsingVirtualModelAsBase ? <ModelSelectorComponent
                    selectedModel={config.model}
                    onModelChange={handleModelChange}
                    models={models.filter((model) => model.type === 'completions')}
                    isSelectedProviderConfigured={true}
                    app_mode={app_mode}
                  /> : <><Input disabled placeholder="Select base model" /></>}
                </div>
              </div>
            </div>
          )}

          {/* Virtual Model Selector */}
          {!isCreateMode && (
            <div>
              <VirtualModelSelector
                onApplyVirtualModel={handleApplyVirtualModel}
                config={config}
                onConfigChange={setConfig}
                onClearVirtualModel={handleClearVirtualModel}
              />
            </div>
          )}
        </div>
      </TooltipProvider>

      {/* Messages Section */}
      <div className="space-y-2 py-4 border-t">
        <MessagesSection
          messages={config.messages || []}
          onMessagesChange={handleMessagesChange}
        />
      </div>

      {/* Response Cache Section */}
      <div className="space-y-2 py-4 border-t">
        <ResponseCacheConfig
          config={config}
          onConfigChange={setConfig}
        />
      </div>

      {/* Fallback Models Section */}
      <div className="space-y-2 py-4 border-t">
        <FallbackModelsConfig
          config={config}
          onConfigChange={setConfig}
        />
      </div>

      {/* Max Retries Section */}
      <div className="space-y-2 py-4 border-t">
        <MaxRetriesConfig
          config={config}
          onConfigChange={setConfig}
        />
      </div>

      {/* Model Parameters Section - Always last since it varies by model */}
      <ModelParametersSection
        modelInfo={currentModelInfo as ModelInfo}
        config={config}
        onConfigChange={setConfig}
      />
    </div>
  );
}


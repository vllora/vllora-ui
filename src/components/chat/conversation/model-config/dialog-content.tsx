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
import { VirtualModel } from "@/services/virtual-models-api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

// Type guard to check if the modelInfo is a ModelInfo
function isModelInfo(modelInfo: ModelInfo | VirtualModel): modelInfo is ModelInfo {
  return 'model' in modelInfo && 'model_provider' in modelInfo;
}

interface ModelConfigDialogContentProps {
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  modelInfo: ModelInfo | VirtualModel;
  onApplyVirtualModel?: (virtualModel: VirtualModel, mode: 'base' | 'copy') => void;
  onClearVirtualModel?: () => void;
  originalBaseModel?: string;
}

export function ModelConfigDialogContent({
  selectedModel,
  onModelChange,
  config,
  onConfigChange,
  modelInfo,
  onApplyVirtualModel,
  onClearVirtualModel,
  originalBaseModel,
}: ModelConfigDialogContentProps) {
  const { models } = ProjectModelsConsumer();

  const handleMessagesChange = useCallback((messages: Message[]) => {
    onConfigChange({ ...config, messages });
  }, [config, onConfigChange]);

  // Check if a virtual model is being used as the base model
  const isUsingVirtualModelAsBase = config.model && typeof config.model === 'string' && config.model.startsWith('langdb/');

  // When a virtual model is used as base, show the original base model that was saved
  const displayedBaseModel = isUsingVirtualModelAsBase ? originalBaseModel : selectedModel;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <TooltipProvider>
        {/* Model Selection Section */}
        <div className={`grid ${onApplyVirtualModel ? 'grid-cols-2' : 'grid-cols-1'} gap-4 pb-4 border-b`}>
          {/* Base Model - Show when we have a regular model (not viewing a VirtualModel directly) */}
          {displayedBaseModel && onModelChange && isModelInfo(modelInfo) && (
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
                <ModelSelectorComponent
                  selectedModel={displayedBaseModel}
                  onModelChange={onModelChange}
                  models={models.filter((model) => model.type === 'completions')}
                  selectedModelInfo={modelInfo}
                  isSelectedProviderConfigured={true}
                />
                </div>
              </div>
            </div>
          )}

          {/* Virtual Model Selector */}
          {onApplyVirtualModel && (
            <div>
              <VirtualModelSelector
                onApplyVirtualModel={onApplyVirtualModel}
                config={config}
                onConfigChange={onConfigChange}
                onClearVirtualModel={onClearVirtualModel}
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
          onConfigChange={onConfigChange}
        />
      </div>

      {/* Fallback Models Section */}
      <div className="space-y-2 py-4 border-t">
        <FallbackModelsConfig
          config={config}
          onConfigChange={onConfigChange}
        />
      </div>

      {/* Max Retries Section */}
      <div className="space-y-2 py-4 border-t">
        <MaxRetriesConfig
          config={config}
          onConfigChange={onConfigChange}
        />
      </div>

      {/* Model Parameters Section - Always last since it varies by model */}
      <ModelParametersSection
        modelInfo={modelInfo}
        config={config}
        onConfigChange={onConfigChange}
      />
    </div>
  );
}

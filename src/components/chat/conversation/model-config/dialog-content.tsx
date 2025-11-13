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

interface ModelConfigDialogContentProps {
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  modelInfo: ModelInfo;
}

export function ModelConfigDialogContent({
  selectedModel,
  onModelChange,
  config,
  onConfigChange,
  modelInfo,
}: ModelConfigDialogContentProps) {
  const { models } = ProjectModelsConsumer();

  const handleMessagesChange = useCallback((messages: Message[]) => {
    onConfigChange({ ...config, messages });
  }, [config, onConfigChange]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {/* Base Model Section */}
      {selectedModel && onModelChange && (
        <div className="space-y-2 pb-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold text-foreground">Base Model</Label>
          </div>
          <ModelSelectorComponent
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            models={models.filter((model) => model.type === 'completions')}
            selectedModelInfo={modelInfo}
            isSelectedProviderConfigured={true}
          />
        </div>
      )}

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

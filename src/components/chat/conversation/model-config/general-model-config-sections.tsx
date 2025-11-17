import { useCallback } from "react";
import { ModelInfo } from "@/types/models";
import { VirtualModel } from "@/services/virtual-models-api";
import { ResponseCacheConfig } from "./response-cache";
import { FallbackModelsConfig } from "./fallback-models/fallback-models";
import { MaxRetriesConfig } from "./max-retries";
import { ModelParametersSection } from "./model-parameters-section";
import { MessagesSection } from "./messages-section";
import { Message } from "./types";

// Type guard to check if the modelInfo is a ModelInfo
function isModelInfo(modelInfo: ModelInfo | VirtualModel): modelInfo is ModelInfo {
  return 'model' in modelInfo && 'model_provider' in modelInfo;
}

interface ModelConfigSectionsProps {
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  modelInfo?: ModelInfo | VirtualModel;
}

export function GeneralModelConfigSections({
  config,
  onConfigChange,
  modelInfo,
}: ModelConfigSectionsProps) {
  const handleMessagesChange = useCallback((messages: Message[]) => {
    onConfigChange({ ...config, messages });
  }, [config, onConfigChange]);

  const setConfig = onConfigChange;

  return (
    <>
      {/* Messages Section */}
      <div className="space-y-2 py-4 border-t">
        <MessagesSection
          messages={config.messages || []}
          onMessagesChange={handleMessagesChange}
        />
      </div>

      {/* Response Cache Section */}
      <div className="space-y-2 py-2 border-t">
        <ResponseCacheConfig
          config={config}
          onConfigChange={setConfig}
        />
      </div>

      {/* Fallback Models Section */}
      <div className="space-y-2 py-2 border-t">
        <FallbackModelsConfig
          config={config}
          onConfigChange={setConfig}
        />
      </div>

      {/* Max Retries Section */}
      <div className="space-y-2 py-2 border-t">
        <MaxRetriesConfig
          config={config}
          onConfigChange={setConfig}
        />
      </div>

      {/* Model Parameters Section - Always last since it varies by model */}
      {modelInfo && isModelInfo(modelInfo) && (
        <ModelParametersSection
          modelInfo={modelInfo}
          config={config}
          onConfigChange={setConfig}
        />
      )}
    </>
  );
}

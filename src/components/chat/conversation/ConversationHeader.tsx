import { useState } from "react";
import { RefreshCcwIcon } from "lucide-react";
import { ModelSelector } from "../traces/model-selector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelInfo } from "@/types/models";
import { ModelConfigDialog, ModelConfigButton } from "./model-config";

interface ModelSelectorHeaderProps {
  modelName?: string;
  modelInfo?: ModelInfo;
  onModelChange: (model: string) => void;
  onRefresh?: () => void;
  onModelConfigChange?: (config: any) => void;
  isLoading?: boolean;
  modelConfig?: Record<string, any>;
  projectId?: string;
}

export function ConversationHeader({
  modelName,
  onModelChange,
  onRefresh,
  isLoading,
  modelInfo,
  onModelConfigChange,
  modelConfig,
  projectId
}: ModelSelectorHeaderProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  // Check if any configs are applied
  const hasActiveConfig = !!(modelConfig && Object.keys(modelConfig).length > 0);

  return (
    <>
      <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card/95 backdrop-blur-xl">
        <div className="flex items-center gap-2">
            <ModelSelector
              selectedModel={modelName || 'Select a model'}
              onModelChange={onModelChange}
            />
            {modelInfo && (
              <ModelConfigButton
                hasActiveConfig={hasActiveConfig}
                onClick={() => setConfigDialogOpen(true)}
              />
            )}
        </div>
        {onRefresh && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="ml-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCcwIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{isLoading ? 'Refreshing...' : 'Refresh'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {modelInfo && (
        <ModelConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          modelInfo={modelInfo}
          onConfigChange={onModelConfigChange}
          initialConfig={modelConfig}
          selectedModel={modelName}
          onModelChange={onModelChange}
          projectId={projectId}
        />
      )}
    </>
  );
}

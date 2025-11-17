import { useState } from "react";
import { RefreshCcwIcon } from "lucide-react";
import { ModelSelector } from "../traces/model-selector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelConfigDialog, ModelConfigButton } from "./model-config";

interface ModelSelectorHeaderProps {
  onRefresh?: () => void;
  onModelConfigChange?: (config: any) => void;
  isLoading?: boolean;
  modelConfig?: Record<string, any>;
  projectId?: string;
}

export function ConversationHeader({
  onRefresh,
  isLoading,
  onModelConfigChange,
  modelConfig,
  projectId
}: ModelSelectorHeaderProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  // Check if any configs are applied
  const hasActiveConfig = !!(modelConfig && Object.keys(modelConfig).filter(key => key !== 'model').length > 0);
  const modelName = modelConfig?.model;
  // Determine the modelInfo to pass to the dialog (either ModelInfo or VirtualModel)

  return (
    <>
      <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card/95 backdrop-blur-xl">
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1 flex max-w-[20vw]">
            <ModelSelector
              selectedModel={modelName || 'Select a model'}
              onModelChange={(modelId) => {
                onModelConfigChange?.({ model: modelId });
              }}
            />
          </div>
          <ModelConfigButton
            hasActiveConfig={hasActiveConfig}
            onClick={() => setConfigDialogOpen(true)}
          />
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

      <ModelConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onConfigChange={onModelConfigChange}
          initialConfig={modelConfig}
          projectId={projectId}
        />
    </>
  );
}

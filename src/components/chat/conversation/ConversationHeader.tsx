import { RefreshCcwIcon } from "lucide-react";
import { ModelSelector } from "../traces/model-selector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ModelSelectorHeaderProps {
  modelName?: string;
  onModelChange: (model: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function ConversationHeader({ modelName, onModelChange, onRefresh, isLoading }: ModelSelectorHeaderProps) {
  return (
    <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card/95 backdrop-blur-xl">
      <div className="max-w-md border border-border rounded-md px-3 py-2">
        <ModelSelector
          selectedModel={modelName || 'Select a model'}
          onModelChange={onModelChange}
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
  );
}

import { Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ModelConfigButtonProps {
  hasActiveConfig: boolean;
  onClick: () => void;
}

export function ModelConfigButton({ hasActiveConfig, onClick }: ModelConfigButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`relative transition-colors ${
              hasActiveConfig
                ? 'text-primary hover:text-primary/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Model configuration"
          >
            <Settings className="w-4 h-4" />
            {hasActiveConfig && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{hasActiveConfig ? 'Model configuration (active)' : 'Model configuration'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

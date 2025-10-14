import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelCardProps {
  model: any; // We'll use the model type from ellora-ui
  modelKey: string;
  isEnabled: boolean;
  onToggle: (modelKey: string) => void;
}

export const ModelCard = ({ model, modelKey, isEnabled, onToggle }: ModelCardProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "group relative p-4 rounded-lg border transition-all duration-300 cursor-pointer",
              isEnabled
                ? "bg-card border-border hover:shadow-md"
                : "bg-zinc-900 opacity-50 border-border hover:opacity-70"
            )}
            onClick={() => onToggle(modelKey)}
          >
            {/* Main content */}
            <div className="flex flex-col gap-3">
              {/* Header with checkbox and provider */}
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isEnabled}
                  onCheckedChange={() => onToggle(modelKey)}
                  className={cn(
                    "h-4 w-4 mt-0.5 flex-shrink-0 transition-all duration-200",
                    isEnabled
                      ? "border-zinc-400 data-[state=checked]:bg-zinc-100 data-[state=checked]:border-zinc-100"
                      : "border-zinc-400 data-[state=checked]:bg-zinc-500 data-[state=checked]:border-zinc-500"
                  )}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm text-foreground truncate flex-1 min-w-0">
                      {model.model || model.name}
                    </div>
                    {model.is_private && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Private Model
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="border border-border max-w-[35vw]">
          <div className="p-2">
            <div className="text-sm font-medium mb-2">{model.model || model.name}</div>
            <div className="text-xs text-muted-foreground">
              {model.description || 'No description available'}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

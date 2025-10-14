import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ModelPricing } from "@/types/models";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";

interface ModelCardProps {
  model: ModelPricing;
  modelKey: string;
  isEnabled: boolean;
  onToggle: (modelKey: string) => void;
}

export const ModelCard = ({ model, modelKey, isEnabled, onToggle }: ModelCardProps) => {
  // Get model group if available, otherwise treat as single model
  const modelGroup = (model as any)._modelGroup || [model];
  const modelName = (model as any)._modelName || model.model;
  
  // Get unique providers from the group
  const providers = Array.from(new Set(modelGroup.map((m: ModelPricing) => m.inference_provider.provider)));
  const firstModel = modelGroup[0];
  const publisher = firstModel.model_provider; // This is the actual publisher
  
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
            <div className="flex flex-col gap-3">
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
                  <div className="flex items-center gap-2 mb-2">
                    {/* Publisher Icon */}
                    <div className="p-1.5 bg-secondary rounded-lg group-hover:bg-secondary/80 transition-colors">
                      <ProviderIcon
                        provider_name={publisher}
                        className="w-4 h-4"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate">
                        {modelName}
                      </div>
                    </div>
                  </div>
                  
                  {/* Providers */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{providers.length > 1 ? 'Providers' : 'Provider'}</span>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {providers.map((provider, index) => (
                        <div key={`${provider}-${index}`} className="p-1 bg-secondary rounded hover:bg-secondary/80 transition-colors">
                          <ProviderIcon
                            provider_name={provider as string}
                            className="w-4 h-4"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="border border-border max-w-[35vw]">
          <div className="p-3 space-y-2">
            <div className="text-sm font-medium">{modelName}</div>
            <div className="text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-medium">Providers:</span>
                <span className="capitalize">{providers.join(", ")}</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

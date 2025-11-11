import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Info, ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { FallbackModelsEmptyState } from "./fallback-models-empty-state";
import { FallbackModelSelect } from "./fallback-model-select";

interface FallbackModelsConfigProps {
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export function FallbackModelsConfig({
  config,
  onConfigChange,
}: FallbackModelsConfigProps) {
  const { models } = ProjectModelsConsumer();
  const fallbackModels = config.fallback as string[] | undefined;
  const fallbackEnabled = fallbackModels !== undefined;

  // Build list of available model options
  const availableModelOptions: string[] = [];
  models.filter(model => model.type === 'completions').forEach(model => {
    availableModelOptions.push(model.model);
    if (model.endpoints && model.endpoints.length > 1) {
      model.endpoints.forEach(endpoint => {
        const providerName = endpoint.provider.provider;
        availableModelOptions.push(`${providerName}/${model.model}`);
      });
    }
  });

  const toggleFallback = () => {
    const newConfig = { ...config };
    if (fallbackEnabled) {
      delete newConfig.fallback;
    } else {
      newConfig.fallback = [];
    }
    onConfigChange(newConfig);
  };

  const addEmptyFallbackSlot = () => {
    const currentModels = fallbackModels || [];
    onConfigChange({
      ...config,
      fallback: [...currentModels, ""],
    });
  };

  const updateFallbackModel = (index: number, value: string) => {
    if (!fallbackModels) return;
    const newModels = [...fallbackModels];
    newModels[index] = value;
    onConfigChange({
      ...config,
      fallback: newModels,
    });
  };

  const moveModelUp = (index: number) => {
    if (index === 0 || !fallbackModels) return;
    const newModels = [...fallbackModels];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    onConfigChange({
      ...config,
      fallback: newModels,
    });
  };

  const moveModelDown = (index: number) => {
    if (!fallbackModels || index === fallbackModels.length - 1) return;
    const newModels = [...fallbackModels];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    onConfigChange({
      ...config,
      fallback: newModels,
    });
  };

  const removeFallbackModel = (index: number) => {
    if (!fallbackModels) return;
    const newModels = fallbackModels.filter((_, i) => i !== index);
    const newConfig = { ...config };
    if (newModels.length === 0) {
      delete newConfig.fallback;
    } else {
      newConfig.fallback = newModels;
    }
    onConfigChange(newConfig);
  };

  // Get models that are not already selected
  const getAvailableModelsForSlot = (currentIndex?: number) => {
    const currentModel = currentIndex !== undefined ? fallbackModels?.[currentIndex] : undefined;
    return availableModelOptions.filter((model: string) =>
      model === currentModel || !fallbackModels?.includes(model)
    );
  };

  // Get display name (remove provider prefix if present)
  const getDisplayName = (modelString: string): string => {
    if (modelString.includes('/')) {
      return modelString.split('/')[1];
    }
    return modelString;
  };

  // Extract provider name from model string
  const getProviderForModel = (modelString: string): string => {
    if (modelString.includes('/')) {
      return modelString.split('/')[0];
    }

    const model = models.find(m => m.model === modelString);
    if (model?.endpoints && model.endpoints.length > 0) {
      return model.endpoints[0].provider.provider;
    }

    return '';
  };

  return (
    <div className="space-y-3 py-2">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between space-x-2 py-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="fallback_enabled" className="text-sm font-medium">
            Fallback Models
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">Specify backup models to use if the primary model fails or is unavailable. Models will be tried in order.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          id="fallback_enabled"
          checked={fallbackEnabled}
          onCheckedChange={toggleFallback}
        />
      </div>

      {/* Fallback Models - only shown when enabled */}
      {fallbackEnabled && (
        <div className="space-y-2 py-1 pl-1">
          {fallbackModels && fallbackModels.length > 0 ? (
            <>
              <div className="space-y-2">
                {fallbackModels.map((model, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
                    <FallbackModelSelect
                      value={model}
                      availableModels={getAvailableModelsForSlot(index)}
                      onValueChange={(value) => updateFallbackModel(index, value)}
                      getDisplayName={getDisplayName}
                      getProviderForModel={getProviderForModel}
                    />
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveModelUp(index)}
                        disabled={index === 0}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveModelDown(index)}
                        disabled={index === fallbackModels.length - 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFallbackModel(index)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <FallbackModelsEmptyState
              hasAvailableModels={getAvailableModelsForSlot().length > 0}
              onAddModel={addEmptyFallbackSlot}
            />
          )}

          {/* Add button */}
          {fallbackModels && fallbackModels.length > 0 && getAvailableModelsForSlot().length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={addEmptyFallbackSlot}
              className="w-full !mt-3"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Fallback Model
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

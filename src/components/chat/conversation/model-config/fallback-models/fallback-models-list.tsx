import { Checkbox } from "@/components/ui/checkbox";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { ModelInfo } from "@/types/models";

interface FallbackModelsListProps {
  models: ModelInfo[];
  selectedModels: string[];
  onSelectionChange: (models: string[]) => void;
}

export function FallbackModelsList({
  models,
  selectedModels,
  onSelectionChange,
}: FallbackModelsListProps) {
  // Build list of available model options
  const availableModelOptions: Array<{ value: string; label: string; provider: string }> = [];
  models.filter(model => model.type === 'completions').forEach(model => {
    // Add the model name itself
    const firstProvider = model.endpoints?.[0]?.provider.provider || '';
    availableModelOptions.push({
      value: model.model,
      label: model.model,
      provider: firstProvider,
    });

    // Add provider/model combinations if there are multiple endpoints
    if (model.endpoints && model.endpoints.length > 1) {
      model.endpoints.forEach(endpoint => {
        const providerName = endpoint.provider.provider;
        availableModelOptions.push({
          value: `${providerName}/${model.model}`,
          label: model.model,
          provider: providerName,
        });
      });
    }
  });

  const toggleModel = (modelValue: string) => {
    if (selectedModels.includes(modelValue)) {
      onSelectionChange(selectedModels.filter(m => m !== modelValue));
    } else {
      onSelectionChange([...selectedModels, modelValue]);
    }
  };

  return (
    <div className="space-y-1">
      {availableModelOptions.map((option) => (
        <div
          key={option.value}
          className="flex items-center space-x-2 py-1.5 px-2 hover:bg-accent rounded-md cursor-pointer"
          onClick={() => toggleModel(option.value)}
        >
          <Checkbox
            checked={selectedModels.includes(option.value)}
            onCheckedChange={() => toggleModel(option.value)}
          />
          <ProviderIcon
            provider_name={option.provider}
            className="w-4 h-4 flex-shrink-0"
          />
          <span className="text-sm flex-1">{option.label}</span>
          {option.value.includes('/') && (
            <span className="text-xs text-muted-foreground">({option.provider})</span>
          )}
        </div>
      ))}
    </div>
  );
}

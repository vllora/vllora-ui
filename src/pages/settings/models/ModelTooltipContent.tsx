import { ProviderIcon } from "@/components/Icons/ProviderIcons";

interface ModelTooltipContentProps {
  models: string[];
  title: string;
}

/**
 * A component that displays a list of models grouped by provider in a tooltip
 */
export const ModelTooltipContent = ({ models, title }: ModelTooltipContentProps) => {
  // Group models by provider
  const groupedByProvider: Record<string, string[]> = {};
  models.forEach(model => {
    const [provider, modelName] = model.split('/');
    if (!groupedByProvider[provider]) {
      groupedByProvider[provider] = [];
    }
    groupedByProvider[provider].push(modelName);
  });

  return (
    <div className="w-full">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-3 border-separate divide-y divide-border">
        {models.length > 0 ? (
          Object.entries(groupedByProvider)
            .sort(([providerA], [providerB]) => providerA.localeCompare(providerB))
            .map(([provider, models]) => (
              <div key={provider} className="space-y-2">
                <div className="flex items-center gap-2 bg-background rounded-md p-1.5">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <ProviderIcon provider_name={provider} className="w-[18px] h-[18px]" />
                  </div>
                  <div className="text-xs capitalize text-white font-bold">{provider}</div>
                  <div className="text-xs font-bold px-2 py-1 rounded-md bg-secondary text-muted-foreground">{models.length} models</div>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {models.sort().map(model => (
                    <li key={model} className="text-xs text-muted-foreground">{model}</li>
                  ))}
                </ul>
              </div>
            ))
        ) : (
          <div className="text-xs text-muted-foreground">No models selected</div>
        )}
      </div>
    </div>
  );
};



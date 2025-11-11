import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ModelParameterConfig } from "@/types/models";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface ModelParametersListProps {
  parameters: Record<string, ModelParameterConfig>;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export function ModelParametersList({
  parameters,
  config,
  onConfigChange,
}: ModelParametersListProps) {
  const setConfig = (updateFn: (prev: Record<string, any>) => Record<string, any>) => {
    onConfigChange(updateFn(config));
  };

  const renderParameterInput = (key: string, param: ModelParameterConfig) => {
    const value = config[key] ?? param.default;

    if (param.type === "boolean") {
      return (
        <div key={key} className="flex items-center justify-between space-x-2 py-3 px-1">
          <div className="space-y-0.5 flex-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={key} className="text-sm font-medium">
                {key}
              </Label>
              {param.description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">{param.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
          <Switch
            id={key}
            checked={value ?? false}
            onCheckedChange={(checked) =>
              setConfig((prev) => ({ ...prev, [key]: checked }))
            }
          />
        </div>
      );
    }

    if (param.type === "int" || param.type === "number") {
      const hasRange = param.min !== null && param.max !== null;
      const step = param.type === "int" ? 1 : 0.01;

      return (
        <div key={key} className="space-y-2 py-3 px-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={key} className="text-sm font-medium">
                {key}
                {param.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {param.description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">{param.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <span className="text-sm font-mono text-muted-foreground">
              {value ?? param.default ?? 0}
            </span>
          </div>

          {hasRange ? (
            <div className="space-y-2">
              <Slider
                id={key}
                min={param.min!}
                max={param.max!}
                step={step}
                value={[value ?? param.default ?? param.min!]}
                onValueChange={(vals: number[]) => {
                  const val = vals[0];
                  setConfig((prev) => ({
                    ...prev,
                    [key]: param.type === "int" ? Math.round(val) : val
                  }));
                }}
                className="flex-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{param.min}</span>
                <span>{param.max}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Input
                id={key}
                type="number"
                value={value ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? null :
                    param.type === "int" ? parseInt(e.target.value) : parseFloat(e.target.value);
                  setConfig((prev) => ({ ...prev, [key]: val }));
                }}
                min={param.min ?? undefined}
                max={param.max ?? undefined}
                step={step}
                className="flex-1"
              />
              {(param.min !== null || param.max !== null) && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {param.min !== null
                    ? `(min: ${param.min})`
                    : `(max: ${param.max})`}
                </span>
              )}
            </div>
          )}

          {param.default !== null && (
            <p className="text-xs text-muted-foreground">Default: {param.default}</p>
          )}
        </div>
      );
    }

    if (param.type === "string" || param.type === "string/array") {
      return (
        <div key={key} className="space-y-2 py-3 px-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={key} className="text-sm font-medium">
              {key}
              {param.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {param.description && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">{param.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Input
            id={key}
            type="text"
            value={value ?? ""}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, [key]: e.target.value || null }))
            }
            placeholder={param.type === "string/array" ? "Comma-separated values or single string" : ""}
          />
          {param.default !== null && (
            <p className="text-xs text-muted-foreground">
              Default: {typeof param.default === "object" ? JSON.stringify(param.default) : param.default}
            </p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="divide-y divide-border">
      {Object.entries(parameters).map(([key, param]) => (
        <div key={key}>
          {renderParameterInput(key, param)}
        </div>
      ))}
    </div>
  );
}

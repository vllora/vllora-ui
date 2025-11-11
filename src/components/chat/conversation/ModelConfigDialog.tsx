import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ModelInfo, ModelParameterConfig } from "@/types/models";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface ModelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelInfo: ModelInfo;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
}

export function ModelConfigDialog({
  open,
  onOpenChange,
  modelInfo,
  onConfigChange,
  initialConfig = {},
}: ModelConfigDialogProps) {
  const [config, setConfig] = useState<Record<string, any>>(initialConfig);

  useEffect(() => {
    // Initialize config with defaults when dialog opens
    if (open && modelInfo.parameters) {
      const defaultConfig: Record<string, any> = {};
      Object.entries(modelInfo.parameters).forEach(([key, param]) => {
        if (initialConfig[key] !== undefined) {
          defaultConfig[key] = initialConfig[key];
        } else if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });
      setConfig(defaultConfig);
    }
  }, [open, modelInfo.parameters, initialConfig]);

  const handleSave = () => {
    // Only save values that differ from defaults
    const userConfig: Record<string, any> = {};
    if (modelInfo.parameters) {
      Object.entries(config).forEach(([key, value]) => {
        const param = modelInfo.parameters![key];
        // Only include if value is different from default
        if (param && value !== param.default) {
          userConfig[key] = value;
        }
      });
    }
    onConfigChange?.(userConfig);
    onOpenChange(false);
  };

  const handleReset = () => {
    if (modelInfo.parameters) {
      const defaultConfig: Record<string, any> = {};
      Object.entries(modelInfo.parameters).forEach(([key, param]) => {
        if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });
      setConfig(defaultConfig);
      // Clear the saved config since we're resetting to defaults
      onConfigChange?.({});
    }
  };

  const renderParameterInput = (key: string, param: ModelParameterConfig) => {
    const value = config[key] ?? param.default;

    if (param.type === "boolean") {
      return (
        <div key={key} className="flex items-center justify-between space-x-2 py-3">
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
      return (
        <div key={key} className="space-y-2 py-3">
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
              step={param.type === "int" ? 1 : 0.1}
              className="flex-1"
            />
            {(param.min !== null || param.max !== null) && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {param.min !== null && param.max !== null
                  ? `(${param.min}-${param.max})`
                  : param.min !== null
                  ? `(min: ${param.min})`
                  : `(max: ${param.max})`}
              </span>
            )}
          </div>
          {param.default !== null && (
            <p className="text-xs text-muted-foreground">Default: {param.default}</p>
          )}
        </div>
      );
    }

    if (param.type === "string" || param.type === "string/array") {
      return (
        <div key={key} className="space-y-2 py-3">
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

  if (!modelInfo.parameters || Object.keys(modelInfo.parameters).length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Model Configuration</DialogTitle>
            <DialogDescription>
              No configurable parameters available for {modelInfo.model}.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Model Configuration</DialogTitle>
          <DialogDescription>
            Configure parameters for {modelInfo.model}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-1">
          {Object.entries(modelInfo.parameters).map(([key, param], index) => (
            <div key={key}>
              {renderParameterInput(key, param)}
              {index < Object.keys(modelInfo.parameters!).length - 1 && (
                <Separator className="my-2" />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

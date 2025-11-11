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
import { ModelInfo } from "@/types/models";
import { ModelParametersList } from "./parameters";
import { ResponseCacheConfig } from "./response-cache";
import { FallbackModelsConfig } from "./fallback-models/fallback-models";

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

      // Restore parameter values
      Object.entries(modelInfo.parameters).forEach(([key, param]) => {
        if (initialConfig[key] !== undefined) {
          defaultConfig[key] = initialConfig[key];
        } else if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });

      // Restore extra field (contains cache config)
      if (initialConfig.extra !== undefined) {
        defaultConfig.extra = initialConfig.extra;
      }

      // Restore fallback
      if (initialConfig.fallback !== undefined) {
        defaultConfig.fallback = initialConfig.fallback;
      }

      setConfig(defaultConfig);
    }
  }, [open, modelInfo.parameters, initialConfig]);

  const handleSave = () => {
    // Only save values that differ from defaults
    const userConfig: Record<string, any> = {};

    // Save parameter configs that differ from defaults
    if (modelInfo.parameters) {
      Object.entries(config).forEach(([key, value]) => {
        const param = modelInfo.parameters![key];
        // Only include if value is different from default
        if (param && value !== param.default) {
          userConfig[key] = value;
        }
      });
    }

    // Always include extra field if it exists (contains cache config)
    if (config.extra !== undefined) {
      userConfig.extra = config.extra;
    }

    // Include fallback if it exists
    if (config.fallback !== undefined) {
      userConfig.fallback = config.fallback;
    }

    onConfigChange?.(userConfig);
    onOpenChange(false);
  };

  const handleReset = () => {
    const defaultConfig: Record<string, any> = {};

    // Reset parameters to defaults
    if (modelInfo.parameters) {
      Object.entries(modelInfo.parameters).forEach(([key, param]) => {
        if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });
    }

    // Cache is disabled by default (extra.cache is not included)
    setConfig(defaultConfig);

    // Clear the saved config since we're resetting to defaults
    onConfigChange?.({});
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

        <div className="flex-1 overflow-y-auto px-3 space-y-8">
          {/* Response Cache Section */}
          <div>
            <ResponseCacheConfig
              config={config}
              onConfigChange={setConfig}
            />
          </div>

          {/* Fallback Models Section */}
          <div className="border-t border-border pt-4">
            <FallbackModelsConfig
              config={config}
              onConfigChange={setConfig}
            />
          </div>

          {/* Model Parameters Section - Always last since it varies by model */}
          <div className="border-t border-border pt-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">Model Parameters</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Configure {modelInfo.model}-specific parameters
              </p>
            </div>
            <ModelParametersList
              parameters={modelInfo.parameters}
              config={config}
              onConfigChange={setConfig}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

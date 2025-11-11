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
import { Label } from "@/components/ui/label";
import { ModelInfo } from "@/types/models";
import { ModelParametersList } from "./parameters";
import { ResponseCacheConfig } from "./response-cache";
import { FallbackModelsConfig } from "./fallback-models/fallback-models";
import { ModelSelector } from "../../traces/model-selector";

interface ModelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelInfo: ModelInfo;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

export function ModelConfigDialog({
  open,
  onOpenChange,
  modelInfo,
  onConfigChange,
  initialConfig = {},
  selectedModel,
  onModelChange,
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

        <div className="flex-1 overflow-y-auto px-6 divide-y divide-border">
          {/* Base Model Section */}
          {selectedModel && onModelChange && (
            <div className="py-6 first:pt-3">
              <div className="flex items-center gap-2 mb-3">
                <Label className="text-sm font-semibold">Base Model</Label>
              </div>
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={onModelChange}
              />
            </div>
          )}

          {/* Response Cache Section */}
          <div className={selectedModel && onModelChange ? "py-6" : "py-6 first:pt-3"}>
            <ResponseCacheConfig
              config={config}
              onConfigChange={setConfig}
            />
          </div>

          {/* Fallback Models Section */}
          <div className="py-6">
            <FallbackModelsConfig
              config={config}
              onConfigChange={setConfig}
            />
          </div>

          {/* Model Parameters Section - Always last since it varies by model */}
          <div className="py-6 last:pb-3">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">Parameters</h3>
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

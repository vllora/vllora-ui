import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ModelInfo } from "@/types/models";
import { ModelConfigDialogHeader } from "./dialog-header";
import { ModelConfigDialogContent } from "./dialog-content";

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

      // Restore max_retries
      if (initialConfig.max_retries !== undefined) {
        defaultConfig.max_retries = initialConfig.max_retries;
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

    // Include max_retries if it exists
    if (config.max_retries !== undefined) {
      userConfig.max_retries = config.max_retries;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className=" max-w-[60vw] max-h-[80vh] overflow-hidden flex flex-col">
        <ModelConfigDialogHeader
          title="Model Configuration"
          description="Fine-tune parameters, caching, fallbacks, and retries for optimal performance"
        />

        <ModelConfigDialogContent
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          config={config}
          onConfigChange={setConfig}
          modelInfo={modelInfo}
        />

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

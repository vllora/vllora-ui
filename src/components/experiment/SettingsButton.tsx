import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ExperimentData } from "@/hooks/useExperiment";
import { ModelInfo } from "@/types/models";
import { VirtualModel } from "@/services/virtual-models-api";

// Type guard to check if the modelInfo is a ModelInfo
function isModelInfo(
  modelInfo: ModelInfo | VirtualModel | null | undefined
): modelInfo is ModelInfo {
  return !!modelInfo && "model" in modelInfo && "model_provider" in modelInfo;
}

interface SettingsButtonProps {
  experimentData: ExperimentData;
  originalExperimentData: ExperimentData | null;
  selectedModelInfo?: ModelInfo | VirtualModel | null;
  onClick: () => void;
}

interface ParameterInfo {
  key: string;
  value: any;
  changed: boolean;
}

export function SettingsButton({
  experimentData,
  originalExperimentData,
  selectedModelInfo,
  onClick,
}: SettingsButtonProps) {
  // Calculate settings indicator state
  const settingsInfo = useMemo(() => {
    const headerCount = Object.keys(experimentData.headers || {}).length;

    // Keys to exclude - tools/functions are managed separately in the UI
    const excludeKeys = new Set([
      "tools",
      "tool_choice",
      "functions",
      "function_call",
    ]);

    // Only track parameters that exist in model info's parameters definition
    // and are not tool/function related
    const modelParameters = isModelInfo(selectedModelInfo)
      ? selectedModelInfo.parameters
      : null;
    const parameterKeys = modelParameters
      ? Object.keys(modelParameters).filter((key) => !excludeKeys.has(key))
      : [];

    // Check which parameters are set and changed
    const setParameters: ParameterInfo[] = [];
    const changedParameters: string[] = [];

    parameterKeys.forEach((key) => {
      const currentValue = (experimentData as Record<string, any>)[key];
      const originalValue = originalExperimentData
        ? (originalExperimentData as Record<string, any>)[key]
        : undefined;

      if (currentValue !== undefined && currentValue !== null) {
        const isChanged =
          originalValue !== undefined && currentValue !== originalValue;
        setParameters.push({ key, value: currentValue, changed: isChanged });
        if (isChanged) {
          changedParameters.push(key);
        }
      }
    });

    // Check headers changes
    const originalHeaders = originalExperimentData?.headers || {};
    const currentHeaders = experimentData.headers || {};
    const headersChanged =
      JSON.stringify(originalHeaders) !== JSON.stringify(currentHeaders);

    const hasSettings = headerCount > 0 || setParameters.length > 0;
    const hasChanges = headersChanged || changedParameters.length > 0;

    return {
      hasSettings,
      hasChanges,
      headerCount,
      setParameters,
      changedParameters,
      headersChanged,
    };
  }, [experimentData, originalExperimentData, selectedModelInfo]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className="gap-2"
          >
            <span className="relative">
              <Settings className="w-4 h-4" />
              {(settingsInfo.hasSettings || settingsInfo.hasChanges) && (
                <span
                  className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                    settingsInfo.hasChanges
                      ? "bg-amber-500"
                      : "bg-[rgb(var(--theme-500))]"
                  }`}
                />
              )}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-0 overflow-hidden">
          {settingsInfo.hasSettings || settingsInfo.hasChanges ? (
            <div className="text-xs">
              {/* Parameters Section */}
              {settingsInfo.setParameters.length > 0 && (
                <div className="px-3 py-2 border-b border-border/50">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Parameters
                  </div>
                  <div className="space-y-1">
                    {settingsInfo.setParameters.map((param) => {
                      const displayValue =
                        typeof param.value === "object"
                          ? JSON.stringify(param.value)
                          : String(param.value);
                      return (
                        <div
                          key={param.key}
                          className={`flex items-center justify-between gap-3 ${
                            param.changed ? "text-amber-400" : ""
                          }`}
                        >
                          <span className="text-muted-foreground">
                            {param.key}
                          </span>
                          <span className="font-mono">{displayValue}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Headers Section */}
              {settingsInfo.headerCount > 0 && (
                <div
                  className={`px-3 py-2 ${
                    settingsInfo.setParameters.length > 0 ? "" : ""
                  } ${settingsInfo.headersChanged ? "text-amber-400" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Headers</span>
                    <span className="font-mono">
                      {settingsInfo.headerCount}
                    </span>
                  </div>
                </div>
              )}

              {/* Modified indicator */}
              {settingsInfo.hasChanges && (
                <div className="px-3 py-1.5 bg-amber-500/10 text-amber-400 text-[10px] border-t border-amber-500/20">
                  Modified from original
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Request Settings
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

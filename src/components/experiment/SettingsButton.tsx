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
            className="gap-2 relative"
          >
            <Settings className="w-4 h-4" />
            {(settingsInfo.hasSettings || settingsInfo.hasChanges) && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${
                  settingsInfo.hasChanges
                    ? "bg-amber-500"
                    : "bg-[rgb(var(--theme-500))]"
                }`}
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          {settingsInfo.hasSettings || settingsInfo.hasChanges ? (
            <div className="text-xs space-y-1">
              {settingsInfo.setParameters.length > 0 && (
                <div>
                  <span className="font-medium">Parameters:</span>{" "}
                  {settingsInfo.setParameters.map((param, i) => {
                    // Format value for display - handle objects
                    const displayValue =
                      typeof param.value === "object"
                        ? JSON.stringify(param.value)
                        : String(param.value);
                    return (
                      <span key={param.key}>
                        <span className={param.changed ? "text-amber-400" : ""}>
                          {param.key}: {displayValue}
                        </span>
                        {i < settingsInfo.setParameters.length - 1 && ", "}
                      </span>
                    );
                  })}
                </div>
              )}
              {settingsInfo.headerCount > 0 && (
                <div
                  className={settingsInfo.headersChanged ? "text-amber-400" : ""}
                >
                  <span className="font-medium">Headers:</span>{" "}
                  {settingsInfo.headerCount} configured
                </div>
              )}
              {settingsInfo.hasChanges && (
                <div className="text-amber-400 text-[10px] mt-1">
                  * Modified from original request
                </div>
              )}
            </div>
          ) : (
            <p>Request Settings</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

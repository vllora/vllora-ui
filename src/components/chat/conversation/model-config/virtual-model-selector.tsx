import { useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";
import { VirtualModel } from "@/services/virtual-models-api";
import { ApplyVirtualModelDialog } from "./apply-virtual-model-dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VirtualModelSelectorProps {
  onApplyVirtualModel: (virtualModel: VirtualModel, mode: 'base' | 'copy') => void;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  onClearVirtualModel?: () => void;
}

export function VirtualModelSelector({
  onApplyVirtualModel,
  config,
  onConfigChange,
  onClearVirtualModel,
}: VirtualModelSelectorProps) {
  const { virtualModels, loading } = VirtualModelsConsumer();
  const [selectedVirtualModel, setSelectedVirtualModel] = useState<VirtualModel | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectValue, setSelectValue] = useState<string>("");

  // Check if a virtual model is being used as the base model
  const isUsingVirtualModelAsBase = config.model && typeof config.model === 'string' && config.model.startsWith('langdb/');
  const handleVirtualModelSelect = useCallback((virtualModelId: string) => {
    setSelectValue(virtualModelId);
    const virtualModel = virtualModels.find(vm => vm.id === virtualModelId);
    if (virtualModel) {
      setSelectedVirtualModel(virtualModel);
      setApplyDialogOpen(true);
    }
  }, [virtualModels]);

  const handleApply = useCallback((mode: 'base' | 'copy') => {
    if (selectedVirtualModel) {
      onApplyVirtualModel(selectedVirtualModel, mode);
      setSelectedVirtualModel(null);

      // Only reset dropdown when copying, not when using as base
      if (mode === 'copy') {
        setSelectValue("");
      }
    }
  }, [selectedVirtualModel, onApplyVirtualModel]);

  const handleClearClick = useCallback(() => {
    // Use the passed-in handler if available, otherwise fallback to local logic
    if (onClearVirtualModel) {
      onClearVirtualModel();
    } else {
      // Fallback: Remove the virtual model from config
      const { model, ...restConfig } = config;
      onConfigChange(restConfig);
    }
    setSelectValue("");
  }, [config, onConfigChange, onClearVirtualModel]);

  if (loading || virtualModels.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-semibold text-foreground">Virtual Model</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {isUsingVirtualModelAsBase
                    ? "This virtual model is currently used as your base configuration"
                    : "Apply a saved virtual model configuration to quickly set up your parameters"
                  }
                </p>
              </TooltipContent>
            </Tooltip>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {isUsingVirtualModelAsBase && (
              <Badge variant="default" className="text-xs h-5 px-2">
                Active as Base
              </Badge>
            )}
          </div>
          {isUsingVirtualModelAsBase && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearClick}
              className="h-7 px-2 text-xs"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <Select value={selectValue} onValueChange={handleVirtualModelSelect}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a virtual model..." />
          </SelectTrigger>
          <SelectContent>
            {virtualModels.map((vm) => {
              const latestVersion = vm.versions.find(v => v.latest);
              const versionNumber = latestVersion?.version || vm.versions[0]?.version;

              return (
                <SelectItem key={vm.id} value={vm.id}>
                  <div className="flex items-center gap-2">
                    <span>{vm.name}</span>
                    {versionNumber !== undefined && (
                      <Badge variant="secondary" className="text-xs h-4 px-1">
                        v{versionNumber}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <ApplyVirtualModelDialog
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
        virtualModel={selectedVirtualModel}
        onApply={handleApply}
      />
    </>
  );
}

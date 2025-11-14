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
import { Sparkles } from "lucide-react";

interface VirtualModelSelectorProps {
  onApplyVirtualModel: (virtualModel: VirtualModel, mode: 'base' | 'copy') => void;
}

export function VirtualModelSelector({
  onApplyVirtualModel,
}: VirtualModelSelectorProps) {
  const { virtualModels, loading } = VirtualModelsConsumer();
  const [selectedVirtualModel, setSelectedVirtualModel] = useState<VirtualModel | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  const handleVirtualModelSelect = useCallback((virtualModelId: string) => {
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
    }
  }, [selectedVirtualModel, onApplyVirtualModel]);

  if (loading || virtualModels.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-2 pb-4 border-b">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold text-foreground">Virtual Model</Label>
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground">
          Apply a saved virtual model configuration to quickly set up your parameters
        </p>
        <Select onValueChange={handleVirtualModelSelect}>
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

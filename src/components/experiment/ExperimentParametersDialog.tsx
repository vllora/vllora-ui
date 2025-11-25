import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ModelParametersSection } from "@/components/chat/conversation/model-config/model-parameters-section";
import type { ExperimentData } from "@/hooks/useExperiment";
import { ModelInfo } from "@/types/models";
import { VirtualModel } from "@/services/virtual-models-api";

interface ExperimentParametersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experimentData: ExperimentData;
  updateExperimentData: (updates: Partial<ExperimentData>) => void;
  selectedModelInfo?: ModelInfo | VirtualModel | null;
}

export function ExperimentParametersDialog({
  open,
  onOpenChange,
  experimentData,
  updateExperimentData,
  selectedModelInfo,
}: ExperimentParametersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Model Parameters</DialogTitle>
          <DialogDescription>
            Configure parameters for {experimentData.model}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {selectedModelInfo ? (
            <ModelParametersSection
              modelInfo={selectedModelInfo}
              config={experimentData}
              onConfigChange={updateExperimentData}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No parameters available for this model
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

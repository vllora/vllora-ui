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
import { HeadersEditor } from "./HeadersEditor";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  const headerCount = Object.keys(experimentData.headers || {}).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Request Settings</DialogTitle>
          <DialogDescription>
            Configure parameters and headers for the request
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Accordion type="multiple" defaultValue={["parameters", "headers"]} className="w-full">
            {/* Model Parameters Section */}
            <AccordionItem value="parameters" className="border-b">
              <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
                Model Parameters
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
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
              </AccordionContent>
            </AccordionItem>

            {/* Headers Section */}
            <AccordionItem value="headers" className="border-b-0">
              <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
                <span className="flex items-center gap-2">
                  Request Headers
                  {headerCount > 0 && (
                    <span className="text-xs text-muted-foreground">({headerCount})</span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <HeadersEditor
                  headers={experimentData.headers || {}}
                  onChange={(headers) => updateExperimentData({ headers })}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}

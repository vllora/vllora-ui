import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ModelParametersList } from "@/components/chat/conversation/model-config";
import type { ExperimentData } from "@/hooks/useExperiment";
import { ModelInfo } from "@/types/models";
import { VirtualModel } from "@/services/virtual-models-api";
import { HeadersEditor } from "./HeadersEditor";
import { SlidersHorizontal, FileCode2, ChevronDown } from "lucide-react";
import { useState } from "react";

// Type guard to check if the modelInfo is a ModelInfo
function isModelInfo(modelInfo: ModelInfo | VirtualModel): modelInfo is ModelInfo {
  return modelInfo && 'model' in modelInfo && 'model_provider' in modelInfo;
}

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
  const [parametersOpen, setParametersOpen] = useState(true);
  const [headersOpen, setHeadersOpen] = useState(true);

  const headerCount = Object.keys(experimentData.headers || {}).length;
  const hasParameters = selectedModelInfo && isModelInfo(selectedModelInfo) && selectedModelInfo.parameters;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] max-h-[80vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-base">Request Settings</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Model Parameters Section */}
          <Collapsible open={parametersOpen} onOpenChange={setParametersOpen} className="border-b border-border">
            <CollapsibleTrigger className="flex items-center gap-2 px-5 py-3 bg-muted/30 w-full hover:bg-muted/50 transition-colors">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Model Parameters</span>
              <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition-transform duration-200 ${parametersOpen ? '' : '-rotate-90'}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 py-4">
                {hasParameters ? (
                  <ModelParametersList
                    parameters={(selectedModelInfo as ModelInfo).parameters!}
                    config={experimentData}
                    onConfigChange={updateExperimentData}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No parameters available for this model
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Headers Section */}
          <Collapsible open={headersOpen} onOpenChange={setHeadersOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 px-5 py-3 bg-muted/30 w-full hover:bg-muted/50 transition-colors">
              <FileCode2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Request Headers</span>
              {headerCount > 0 && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                  {headerCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition-transform duration-200 ${headersOpen ? '' : '-rotate-90'}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 py-4">
                <HeadersEditor
                  headers={experimentData.headers || {}}
                  onChange={(headers) => updateExperimentData({ headers })}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

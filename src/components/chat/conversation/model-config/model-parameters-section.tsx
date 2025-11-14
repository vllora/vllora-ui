import { ModelInfo } from "@/types/models";
import { VirtualModel } from "@/services/virtual-models-api";
import { ModelParametersList } from "./parameters";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Type guard to check if the modelInfo is a ModelInfo
function isModelInfo(modelInfo: ModelInfo | VirtualModel): modelInfo is ModelInfo {
  return 'model' in modelInfo && 'model_provider' in modelInfo;
}

interface ModelParametersSectionProps {
  modelInfo: ModelInfo | VirtualModel;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export function ModelParametersSection({
  modelInfo,
  config,
  onConfigChange,
}: ModelParametersSectionProps) {
  // Only ModelInfo has parameters, VirtualModel doesn't
  if (!isModelInfo(modelInfo) || !modelInfo.parameters) {
    return null;
  }

  return (
    <div className="py-4 border-t">
      <Accordion type="single" collapsible defaultValue="">
        <AccordionItem value="parameters" className="border-none">
          <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-1.5">
            Parameters
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <div className="rounded-lg bg-secondary/20 border border-border/40 px-4 py-2">
              <ModelParametersList
                parameters={modelInfo.parameters}
                config={config}
                onConfigChange={onConfigChange}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

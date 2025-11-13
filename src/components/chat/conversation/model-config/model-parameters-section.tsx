import { ModelInfo } from "@/types/models";
import { ModelParametersList } from "./parameters";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ModelParametersSectionProps {
  modelInfo: ModelInfo;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export function ModelParametersSection({
  modelInfo,
  config,
  onConfigChange,
}: ModelParametersSectionProps) {
  if (!modelInfo.parameters) {
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

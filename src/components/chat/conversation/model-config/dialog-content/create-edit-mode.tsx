

import { ProjectModelsConsumer } from "@/lib";
import { CurrentAppConsumer } from "@/lib";
import { ModelConfigDialogConsumer } from "../useModelConfigDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { ModelSelectorComponent } from "../../../traces/model-selector";
import { useCallback } from "react";
import { Label } from "@/components/ui/label";
import { GeneralModelConfigSections } from "../general-model-config-sections";
import { VirtualModelsConsumer } from "@/lib";
import { VirtualModelNameInput } from "./name-input";

export const CreateEditMode = () => {

    const { models } = ProjectModelsConsumer();
    const { virtualModels } = VirtualModelsConsumer();
    const { app_mode } = CurrentAppConsumer();

    const { config, setConfig, currentModelInfo, virtualModelName, setVirtualModelName } = ModelConfigDialogConsumer();


    // Handle base model change - update config.model
    const handleModelChange = useCallback((model: string) => {
        setConfig({ ...config, model });
    }, [config, setConfig]);
    return (
        <div className="flex-1 overflow-y-auto px-6">
            <VirtualModelNameInput virtualModelName={virtualModelName} setVirtualModelName={setVirtualModelName} />
            <TooltipProvider>
                {/* Model Selection Section */}
                <div className={`grid-cols-2 gap-4 pb-4 space-y-2 py-4 border-t`}>
                    {(
                        <div className={""}>
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                    <Label className="text-sm font-semibold text-foreground">Base Model</Label>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="text-xs">
                                                {"Select the foundation model for your configuration"}
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                                <div className="flex-1 flex">
                                    <ModelSelectorComponent
                                        selectedModel={config.model}
                                        onModelChange={handleModelChange}
                                        virtualModels={virtualModels}
                                        models={models.filter((model) => model.type === 'completions')}
                                        isSelectedProviderConfigured={true}
                                        app_mode={app_mode}
                                    />
                                </div>
                            </div>
                        </div>
                    )}


                </div>
            </TooltipProvider>

            {/* Configuration Sections */}
            <GeneralModelConfigSections
                config={config}
                onConfigChange={setConfig}
                modelInfo={currentModelInfo}
            />
        </div>
    );
}
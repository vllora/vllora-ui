import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ModelInfo, ModelProviderInfo } from '@/types/models';
import { ModelSelectorContent } from './ModelSelectorContent';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { CurrentAppConsumer } from '@/contexts/CurrentAppContext';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange?: (modelId: string) => void;
}



export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
}) => {
  const { models } = ProjectModelsConsumer();
  const { app_mode } = CurrentAppConsumer();
  const { selectedModelInfo, selectedProvider, isSelectedProviderConfigured, setSelectedProviderForConfig, setConfigDialogOpen, handleWarningClick } = ChatWindowConsumer();

  return <ModelSelectorComponent
    selectedModel={selectedModel}
    onModelChange={onModelChange}
    models={models.filter((model) => model.type === 'completions')}
    selectedModelInfo={selectedModelInfo}
    selectedProvider={selectedProvider}
    isSelectedProviderConfigured={app_mode === 'langdb' || isSelectedProviderConfigured}
    setSelectedProviderForConfig={setSelectedProviderForConfig}
    setConfigDialogOpen={setConfigDialogOpen}
    handleWarningClick={handleWarningClick} />
}
interface ModelSelectorComponentProps {
  selectedModel: string;
  onModelChange?: (modelId: string) => void;
  models: ModelInfo[];
  selectedModelInfo?: ModelInfo;
  selectedProvider?: ModelProviderInfo;
  isSelectedProviderConfigured?: boolean;
  setSelectedProviderForConfig?: (providerName: string) => void;
  setConfigDialogOpen?: (open: boolean) => void;
  handleWarningClick?: () => void;
}
export const ModelSelectorComponent: React.FC<ModelSelectorComponentProps> = ({
  selectedModel,
  onModelChange,
  models,
  selectedModelInfo,
  selectedProvider,
  isSelectedProviderConfigured,
  setSelectedProviderForConfig,
  setConfigDialogOpen,
  handleWarningClick
}) => {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<'model' | 'provider'>('model');
  const getIconForModel = useCallback((modelId: string) => {
    if (modelId.includes('/')) {
      return modelId.split('/')[0];
    }
    // find model that have same model_name
    const model = models.find((model) => model.model === modelId);
    if (model) {
      return model.model_provider
    }
    return '';
  }, [models]);

  // Group models by model name (without provider prefix)
  const modelNameGroups: Record<string, ModelInfo> = useMemo(() => {
    const groups: Record<string, ModelInfo> = {};
    models.map((model) => {
      const modelName = model.model;
      groups[modelName] = model;
    });
    return groups;
  }, [models]);

  // Get all model names
  const modelNames: string[] = useMemo(() => {
    return Object.keys(modelNameGroups);
  }, [modelNameGroups]);

  // Get all providers for selected model
  const providers: ModelProviderInfo[] = useMemo(() => {
    if (!selectedModelInfo) {
      return [];
    }
    return selectedModelInfo.endpoints || [];
  }, [selectedModelInfo]);

  const handleModelSelect = (modelId: string) => {
    onModelChange?.(modelId);
    setOpen(false);
    setCurrentStep('model');
  };

  const handleModelNameSelect = useCallback((modelName: string) => {
    const availableModels = modelNameGroups[modelName];

    // If only one provider offers this model, select it directly
    if (availableModels.endpoints?.length === 1) {
      handleModelSelect(modelName);
      return;
    }
    onModelChange?.(modelName);
    // Otherwise, show provider selection
    setCurrentStep('provider');
  }, [modelNameGroups, onModelChange]);

  const getProviderCount = useCallback((modelName: string) => {
    return modelNameGroups[modelName]?.endpoints?.length || 0;
  }, [modelNameGroups]);

  const handleBack = () => {
    setCurrentStep('model');
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
  };


  // Check if the currently selected provider is configured


  return (
    <div className="inline-flex flex-1 items-center gap-2">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <div className="inline-flex border border-border rounded-md px-3 py-2 items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full truncate">
            {selectedModel && <ProviderIcon
              provider_name={getIconForModel(selectedModel)}
              className="w-4 h-4 flex-shrink-0"
            />}
            <span className="truncate flex-1">{selectedModel.includes('/') ? selectedModel.split('/')[1] : selectedModel}</span>
            <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-96 p-0" align="start">
          <ModelSelectorContent
            currentStep={currentStep}
            handleBack={handleBack}
            selectedProvider={selectedProvider}
            modelNames={modelNames}
            handleModelNameSelect={handleModelNameSelect}
            getProviderCount={getProviderCount}
            providers={providers}
            selectedModelInfo={selectedModelInfo}
            selectedModel={selectedModel}
            handleModelSelect={handleModelSelect}
            setSelectedProviderForConfig={setSelectedProviderForConfig}
            setConfigDialogOpen={setConfigDialogOpen}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {!isSelectedProviderConfigured && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleWarningClick?.();
                }}
                className="flex items-center"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 cursor-pointer hover:text-amber-600 transition-colors" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-sm">Provider credentials for this model not configured</p>
              <p className="text-xs text-muted-foreground mt-1">Click to configure</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

    </div>
  );
};
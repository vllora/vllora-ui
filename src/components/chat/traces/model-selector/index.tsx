import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { LocalModelsConsumer } from '@/contexts/LocalModelsContext';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LocalModel, LocalModelProviderInfo } from '@/types/models';
import { ModelListView } from './ModelListView';
import { ProviderListView } from './ProviderListView';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange?: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
}) => {
  const { models } = LocalModelsConsumer();
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<'model' | 'provider'>('model');

  const selectedModelInfo: LocalModel | undefined = useMemo(()=> {
    let isFullName = selectedModel.includes('/');
    if(isFullName){
      let splited = selectedModel.split('/');
      let modelName = splited[1];
      let modelInfo = models.find((model) => model.model === modelName);
      return modelInfo

    } else {
      let modelInfo = models.find((model) => model.model === selectedModel);
      return modelInfo
    }
  }, [models, selectedModel])

  const selectedProvider:LocalModelProviderInfo | undefined = useMemo(() => {
      let isFullName = selectedModel.includes('/');
      if(!isFullName){
        return undefined
      }

    if(selectedModelInfo){
      let providerName = selectedModel.split('/')[0];

      return selectedModelInfo.endpoints?.find((endpoint) => endpoint.provider.provider === providerName);
    }
    return undefined;
  }, [selectedModelInfo, selectedModel]);

  const getIconForModel = useCallback((modelId: string) => {
    if(modelId.includes('/')){
      return modelId.split('/')[0];
    }
    // find model that have same model_name
    const model = models.find((model) => model.model === modelId);
    if(model){
      return model.model_provider
    }
    return '';
  }, [models]);

  // Group models by model name (without provider prefix)
  const modelNameGroups: Record<string, LocalModel> = useMemo(() => {
    const groups: Record<string, LocalModel> = {};
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
  const providers: LocalModelProviderInfo[] = useMemo(() => {
    if(!selectedModelInfo){
      return [];
    }
    return selectedModelInfo.endpoints || [];
  }, [selectedModelInfo]);

  const handleModelSelect = (modelId: string) => {
    console.log('==== handleModelSelect', modelId)
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

  // const isNoProviderConfigured = useMemo(() => {
  //   if(!selectedModelInfo || selectedModelInfo.endpoints?.length === 0) {
  //     return true;
  //   }
  //   return selectedModelInfo.endpoints?.filter((endpoint) => !endpoint.available).length === selectedModelInfo.endpoints?.length;
  // }, [selectedModelInfo]);
  

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-[200px] truncate">
          {selectedModel && selectedModel.includes('/') && <ProviderIcon
            provider_name={getIconForModel(selectedModel)}
            className="w-4 h-4 flex-shrink-0"
          />}
          <span className="truncate flex-1">{selectedModel.includes('/') ? selectedModel.split('/')[1] : selectedModel}</span>

          <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-96 p-0" align="start">
        {/* Header with Back Button (when model name is selected) */}
        {currentStep === 'provider' && (
          <div className="p-3 border-b border-border flex items-center gap-2">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            {selectedProvider && <span className="text-sm font-medium text-foreground ml-2">{selectedProvider.provider.provider}</span>}
          </div>
        )}

        {/* Content Area */}
        {currentStep === 'model' ? (
          <ModelListView
            modelNames={modelNames}
            onModelNameSelect={handleModelNameSelect}
            getProviderCount={getProviderCount}
          />
        ) : (
          <ProviderListView
            providers={providers}
            selectedModelInfo={selectedModelInfo}
            selectedModel={selectedModel}
            onProviderSelect={(modelFullName)=>{
              console.log('===== onProviderSelect', modelFullName)
              handleModelSelect(modelFullName);
            }}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
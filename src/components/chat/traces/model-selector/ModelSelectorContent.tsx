import React from 'react';
import { ModelInfo, ModelProviderInfo } from '@/types/models';
import { ModelStepContent } from './ModelStepContent';
import { ProviderStepContent } from './ProviderStepContent';
import { VirtualModelOption } from './index';
import { VirtualModel } from '@/lib';

interface ModelSelectorContentProps {
  currentStep: 'model' | 'provider';
  handleBack: () => void;
  selectedProvider?: ModelProviderInfo;
  modelNames: string[];
  handleModelNameSelect: (modelName: string) => void;
  getProviderCount: (modelName: string) => number;
  providers: ModelProviderInfo[];
  selectedModelInfo?: ModelInfo | VirtualModel;
  selectedModel: string;
  handleModelSelect: (modelId: string) => void;
  setSelectedProviderForConfig?: (providerName: string) => void;
  setConfigDialogOpen?: (open: boolean) => void;
  virtualModels?: VirtualModelOption[];
  app_mode:'langdb' | 'vllora';
  onAddCustomModel?: () => void;
}

export const ModelSelectorContent: React.FC<ModelSelectorContentProps> = ({
  currentStep,
  handleBack,
  selectedProvider,
  modelNames,
  handleModelNameSelect,
  getProviderCount,
  providers,
  selectedModelInfo,
  selectedModel,
  handleModelSelect,
  setSelectedProviderForConfig,
  setConfigDialogOpen,
  virtualModels,
  app_mode,
  onAddCustomModel,
}) => {
  return (
    <>
      {currentStep === 'model' ? (
        <ModelStepContent
          modelNames={modelNames}
          handleModelNameSelect={handleModelNameSelect}
          getProviderCount={getProviderCount}
          virtualModels={virtualModels}
          onAddCustomModel={onAddCustomModel}
        />
      ) : (
        <ProviderStepContent
          handleBack={handleBack}
          selectedProvider={selectedProvider}
          providers={providers}
          selectedModelInfo={selectedModelInfo && 'endpoints' in selectedModelInfo ? selectedModelInfo : undefined}
          selectedModel={selectedModel}
          handleModelSelect={handleModelSelect}
          setSelectedProviderForConfig={setSelectedProviderForConfig}
          setConfigDialogOpen={setConfigDialogOpen}
          app_mode={app_mode}
        />
      )}
    </>
  );
};

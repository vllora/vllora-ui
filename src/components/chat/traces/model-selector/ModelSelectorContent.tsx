import React from 'react';
import { LocalModel, LocalModelProviderInfo } from '@/types/models';
import { ModelStepContent } from './ModelStepContent';
import { ProviderStepContent } from './ProviderStepContent';

interface ModelSelectorContentProps {
  currentStep: 'model' | 'provider';
  handleBack: () => void;
  selectedProvider?: LocalModelProviderInfo;
  modelNames: string[];
  handleModelNameSelect: (modelName: string) => void;
  getProviderCount: (modelName: string) => number;
  providers: LocalModelProviderInfo[];
  selectedModelInfo?: LocalModel;
  selectedModel: string;
  handleModelSelect: (modelId: string) => void;
  setSelectedProviderForConfig?: (providerName: string) => void;
  setConfigDialogOpen?: (open: boolean) => void;
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
}) => {
  return (
    <>
      {currentStep === 'model' ? (
        <ModelStepContent
          modelNames={modelNames}
          handleModelNameSelect={handleModelNameSelect}
          getProviderCount={getProviderCount}
        />
      ) : (
        <ProviderStepContent
          handleBack={handleBack}
          selectedProvider={selectedProvider}
          providers={providers}
          selectedModelInfo={selectedModelInfo}
          selectedModel={selectedModel}
          handleModelSelect={handleModelSelect}
          setSelectedProviderForConfig={setSelectedProviderForConfig}
          setConfigDialogOpen={setConfigDialogOpen}
        />
      )}
    </>
  );
};

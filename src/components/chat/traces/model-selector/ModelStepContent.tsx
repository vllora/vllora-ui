import React from 'react';
import { ModelListView } from './ModelListView';
import { VirtualModelOption } from './index';

interface ModelStepContentProps {
  modelNames: string[];
  handleModelNameSelect: (modelName: string) => void;
  getProviderCount: (modelName: string) => number;
  virtualModels?: VirtualModelOption[];
}

export const ModelStepContent: React.FC<ModelStepContentProps> = ({
  modelNames,
  handleModelNameSelect,
  getProviderCount,
  virtualModels,
}) => {
  return (
    <ModelListView
      modelNames={modelNames}
      onModelNameSelect={handleModelNameSelect}
      getProviderCount={getProviderCount}
      virtualModels={virtualModels}
    />
  );
};

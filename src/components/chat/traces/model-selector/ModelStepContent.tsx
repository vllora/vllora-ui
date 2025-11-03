import React from 'react';
import { ModelListView } from './ModelListView';

interface ModelStepContentProps {
  modelNames: string[];
  handleModelNameSelect: (modelName: string) => void;
  getProviderCount: (modelName: string) => number;
}

export const ModelStepContent: React.FC<ModelStepContentProps> = ({
  modelNames,
  handleModelNameSelect,
  getProviderCount,
}) => {
  return (
    <ModelListView
      modelNames={modelNames}
      onModelNameSelect={handleModelNameSelect}
      getProviderCount={getProviderCount}
    />
  );
};

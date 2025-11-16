import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { ModelInfo, ModelProviderInfo } from '@/types/models';
import { ProviderListView } from './ProviderListView';

interface ProviderStepContentProps {
  handleBack: () => void;
  selectedProvider?: ModelProviderInfo;
  providers: ModelProviderInfo[];
  selectedModelInfo?: ModelInfo;
  selectedModel: string;
  handleModelSelect: (modelId: string) => void;
  setSelectedProviderForConfig?: (providerName: string) => void;
  setConfigDialogOpen?: (open: boolean) => void;
  app_mode:'langdb' | 'vllora'
}

export const ProviderStepContent: React.FC<ProviderStepContentProps> = ({
  handleBack,
  selectedProvider,
  providers,
  selectedModelInfo,
  selectedModel,
  handleModelSelect,
  setSelectedProviderForConfig,
  setConfigDialogOpen,
  app_mode
}) => {
  return (
    <>
      {/* Header with Back Button */}
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

      {/* Provider List */}
      <ProviderListView
        providers={providers}
        selectedModelInfo={selectedModelInfo}
        selectedModel={selectedModel}
        onProviderSelect={(modelFullName) => {
          handleModelSelect(modelFullName);
        }}
        onConfigureProvider={(providerName) => {
          setSelectedProviderForConfig?.(providerName);
          setConfigDialogOpen?.(true);
        }}
        app_mode={app_mode}
      />
    </>
  );
};

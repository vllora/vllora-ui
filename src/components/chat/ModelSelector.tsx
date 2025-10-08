import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { LocalModelsConsumer } from '@/contexts/LocalModelsContext';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange?: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
}) => {
  const { models } = LocalModelsConsumer();
  const [open, setOpen] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const getProviderFromModelId = (modelId: string) => {
    return modelId.split('/')[0];
  };

  const getModelNameFromId = (modelId: string) => {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : modelId;
  };

  // Group models by model name (without provider prefix)
  const modelNameGroups = useMemo(() => {
    const groups: Record<string, typeof models> = {};
    models.forEach((model) => {
      const modelName = getModelNameFromId(model.id);
      if (!groups[modelName]) {
        groups[modelName] = [];
      }
      groups[modelName].push(model);
    });
    return groups;
  }, [models]);

  // Filter model names by search term
  const filteredModelNames = useMemo(() => {
    if (!searchTerm) return Object.keys(modelNameGroups);
    return Object.keys(modelNameGroups).filter((modelName) =>
      modelName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [modelNameGroups, searchTerm]);

  // Filter providers for selected model name
  const filteredProviders = useMemo(() => {
    if (!selectedProvider) return [];
    const modelProviders = modelNameGroups[selectedProvider] || [];
    if (!searchTerm) return modelProviders;
    return modelProviders.filter((model) =>
      getProviderFromModelId(model.id).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [selectedProvider, modelNameGroups, searchTerm]);

  const handleModelSelect = (modelId: string) => {
    onModelChange?.(modelId);
    setOpen(false);
    setSelectedProvider(null);
    setSearchTerm('');
  };

  const handleModelNameSelect = (modelName: string) => {
    const availableModels = modelNameGroups[modelName];

    // If only one provider offers this model, select it directly
    if (availableModels.length === 1) {
      handleModelSelect(availableModels[0].id);
      return;
    }

    // Otherwise, show provider selection
    setSelectedProvider(modelName);
    setSearchTerm('');
  };

  const handleBack = () => {
    setSelectedProvider(null);
    setSearchTerm('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSelectedProvider(null);
      setSearchTerm('');
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ProviderIcon
            provider_name={getProviderFromModelId(selectedModel)}
            className="w-4 h-4"
          />
          <span>{selectedModel}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ml-auto ${open ? 'rotate-180' : ''}`} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-96 p-0" align="start">
        {/* Header with Back Button (when model name is selected) */}
        {selectedProvider && (
          <div className="p-3 border-b border-border flex items-center gap-2">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <span className="text-sm font-medium text-foreground ml-2">{selectedProvider}</span>
          </div>
        )}

        {/* Search Input */}
        <div className="p-3 border-b border-border">
          <input
            type="text"
            placeholder={selectedProvider ? "Search providers..." : "Search models..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-background text-foreground placeholder-muted-foreground px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring border border-input"
            autoFocus
          />
        </div>

        {/* Content Area */}
        <div className="max-h-80 overflow-y-auto">
          {!selectedProvider ? (
            // Model Name Selection View (Step 1)
            filteredModelNames.length > 0 ? (
              filteredModelNames.map((modelName) => (
                <DropdownMenuItem
                  key={modelName}
                  onSelect={() => handleModelNameSelect(modelName)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-popover-foreground truncate">{modelName}</p>
                    <p className="text-xs text-muted-foreground">
                      {modelNameGroups[modelName].length} {modelNameGroups[modelName].length === 1 ? 'provider' : 'providers'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No models found
              </div>
            )
          ) : (
            // Provider Selection View (Step 2)
            filteredProviders.length > 0 ? (
              filteredProviders.map((model) => {
                const provider = getProviderFromModelId(model.id);
                return (
                  <DropdownMenuItem
                    key={model.id}
                    onSelect={() => handleModelSelect(model.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${
                      model.id === selectedModel ? 'bg-accent/50' : ''
                    }`}
                  >
                    <ProviderIcon
                      provider_name={provider}
                      className="w-6 h-6 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-popover-foreground">{provider}</p>
                      <p className="text-xs text-muted-foreground truncate">{model.owned_by}</p>
                    </div>
                  </DropdownMenuItem>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No providers found
              </div>
            )
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
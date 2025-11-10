import React, { useState, useMemo, useCallback } from 'react';
import { ModelInfo } from '@/types/models';
import { ModelCard } from './ModelCard';
import { ModelSearchFilters } from './ModelSearchFilters';
import { NewModelsTable } from './NewModelsTable';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModelsExplorerProps {
  models: ModelInfo[];
  showViewModeToggle?: boolean;
  showStats?: boolean;
  statsTitle?: string;
}

export const ModelsExplorer: React.FC<ModelsExplorerProps> = ({
  models,
  showViewModeToggle = true,
  showStats = false,
  statsTitle = 'AI Models Ecosystem'
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedPublishers, setSelectedPublishers] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedInputFormats, setSelectedInputFormats] = useState<string[]>([]);
  const [selectedOutputFormats, setSelectedOutputFormats] = useState<string[]>([]);
  const [minContextSize, setMinContextSize] = useState<number | undefined>();
  const [maxContextSize, setMaxContextSize] = useState<number | undefined>();
  const [minInputCost, setMinInputCost] = useState<number | undefined>();
  const [maxInputCost, setMaxInputCost] = useState<number | undefined>();
  const [copiedModel, setCopiedModel] = useState<string | null>(null);

  // Extract unique values for filters
  const providers = useMemo(() => {
    const uniqueProviders = new Set<string>();
    models.forEach(m => {
      if (m.inference_provider?.provider) {
        uniqueProviders.add(m.inference_provider.provider);
      }
    });
    return Array.from(uniqueProviders).sort();
  }, [models]);

  const publishers = useMemo(() => {
    const uniquePublishers = new Set<string>();
    models.forEach(m => {
      if (m.model_provider) {
        uniquePublishers.add(m.model_provider);
      }
    });
    return Array.from(uniquePublishers).sort();
  }, [models]);

  const types = useMemo(() => {
    const uniqueTypes = new Set(models.map(m => m.type));
    return Array.from(uniqueTypes).sort();
  }, [models]);

  const inputFormats = useMemo(() => {
    const formats = new Set<string>();
    models.forEach(m => {
      if (m.input_formats) {
        m.input_formats.forEach(format => formats.add(format));
      }
    });
    return Array.from(formats).sort();
  }, [models]);

  const outputFormats = useMemo(() => {
    const formats = new Set<string>();
    models.forEach(m => {
      if (m.output_formats) {
        m.output_formats.forEach(format => formats.add(format));
      }
    });
    return Array.from(formats).sort();
  }, [models]);

  // Group models by name for display
  const groupedModels = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();

    models.forEach(model => {
      const modelName = (model.model || '').toLowerCase();
      if (!groups.has(modelName)) {
        groups.set(modelName, []);
      }
      groups.get(modelName)!.push(model);
    });

    // Convert to array and add _modelGroup property to first item of each group
    return Array.from(groups.entries())
      .map(([, modelGroup]) => {
        const firstModel = { ...modelGroup[0] };
        (firstModel as any)._modelGroup = modelGroup;
        return firstModel;
      });
  }, [models]);

  // Filter models
  const filteredModels = useMemo(() => {
    return groupedModels.filter((model: any) => {
      const modelGroup = model._modelGroup || [model];

      // Search term filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const nameMatch = model.model?.toLowerCase().includes(search);
        const publisherMatch = model.model_provider?.toLowerCase().includes(search);
        const providerMatch = modelGroup.some((m: ModelInfo) =>
          m.inference_provider?.provider?.toLowerCase().includes(search)
        );

        if (!nameMatch && !publisherMatch && !providerMatch) {
          return false;
        }
      }

      // Provider filter - check if ANY provider in the group matches
      if (selectedProviders.length > 0) {
        const hasMatchingProvider = modelGroup.some((m: ModelInfo) =>
          selectedProviders.includes(m.inference_provider?.provider || '')
        );
        if (!hasMatchingProvider) {
          return false;
        }
      }

      // Publisher filter
      if (selectedPublishers.length > 0 && !selectedPublishers.includes(model.model_provider || '')) {
        return false;
      }

      // Type filter
      if (selectedType !== 'all' && model.type !== selectedType) {
        return false;
      }

      // Input formats filter
      if (selectedInputFormats.length > 0) {
        const modelInputFormats = model.input_formats || [];
        const hasMatchingFormat = selectedInputFormats.some(format =>
          modelInputFormats.includes(format)
        );
        if (!hasMatchingFormat) {
          return false;
        }
      }

      // Output formats filter
      if (selectedOutputFormats.length > 0) {
        const modelOutputFormats = model.output_formats || [];
        const hasMatchingFormat = selectedOutputFormats.some(format =>
          modelOutputFormats.includes(format)
        );
        if (!hasMatchingFormat) {
          return false;
        }
      }

      // Context size filter
      if (minContextSize && model.limits.max_context_size < minContextSize) {
        return false;
      }
      if (maxContextSize && model.limits.max_context_size > maxContextSize) {
        return false;
      }

      // Cost filter (per 1M tokens)
      const inputCostPerMillion = model.price.per_input_token * 1000000;
      if (minInputCost && inputCostPerMillion < minInputCost) {
        return false;
      }
      if (maxInputCost && inputCostPerMillion > maxInputCost) {
        return false;
      }

      return true;
    });
  }, [groupedModels, searchTerm, selectedProviders, selectedPublishers, selectedType, selectedInputFormats, selectedOutputFormats, minContextSize, maxContextSize, minInputCost, maxInputCost]);

  // Copy model name function
  const copyModelName = useCallback(async (modelName: string) => {
    await navigator.clipboard.writeText(modelName);
    setCopiedModel(modelName);
    setTimeout(() => setCopiedModel(null), 2000);
  }, []);

  // Check if model is new (within last 7 days)
  const isNewModel = useCallback((model: ModelInfo) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (model.langdb_release_date) {
      return new Date(model.langdb_release_date) > sevenDaysAgo;
    }
    if (model.release_date) {
      return new Date(model.release_date) > sevenDaysAgo;
    }
    return false;
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    if (!showStats) return null;

    const uniqueProviders = new Set(filteredModels.map((m: any) => m.model_provider));
    const multiModalCount = filteredModels.filter((m: any) => m.type === 'multimodal').length;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newModelsCount = filteredModels.filter((m: any) => {
      const date = new Date(m.release_date || m.langdb_release_date || 0);
      return date > sevenDaysAgo;
    }).length;

    return {
      totalModels: filteredModels.length,
      totalProviders: uniqueProviders.size,
      newModelsCount,
      multiModalCount
    };
  }, [filteredModels, showStats]);

  return (
    <div className="flex flex-col space-y-6">
      {/* Stats */}
      {showStats && stats && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">{statsTitle}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-3xl font-bold text-white">{stats.totalModels}</p>
              <p className="text-sm text-zinc-400">Total Models</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{stats.totalProviders}</p>
              <p className="text-sm text-zinc-400">Providers</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[rgb(var(--theme-400))]">{stats.newModelsCount}</p>
              <p className="text-sm text-zinc-400">New Models</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-purple-400">{stats.multiModalCount}</p>
              <p className="text-sm text-zinc-400">Multimodal</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <ModelSearchFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedProviders={selectedProviders}
        onProvidersChange={setSelectedProviders}
        selectedPublishers={selectedPublishers}
        onPublishersChange={setSelectedPublishers}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        selectedInputFormats={selectedInputFormats}
        onInputFormatsChange={setSelectedInputFormats}
        selectedOutputFormats={selectedOutputFormats}
        onOutputFormatsChange={setSelectedOutputFormats}
        providers={providers}
        publishers={publishers}
        types={types}
        inputFormats={inputFormats}
        outputFormats={outputFormats}
        minContextSize={minContextSize}
        onMinContextSizeChange={setMinContextSize}
        maxContextSize={maxContextSize}
        onMaxContextSizeChange={setMaxContextSize}
        minInputCost={minInputCost}
        onMinInputCostChange={setMinInputCost}
        maxInputCost={maxInputCost}
        onMaxInputCostChange={setMaxInputCost}
        resultsCount={filteredModels.length}
        totalCount={groupedModels.length}
      />

      {/* View Mode Toggle */}
      {showViewModeToggle && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-zinc-400">
            Showing {filteredModels.length} of {models.length} models
          </p>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Grid
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              <List className="w-4 h-4 mr-2" />
              Table
            </Button>
          </div>
        </div>
      )}

      {/* Models Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.map((model: any, index) => {
            const modelsGroup = model._modelGroup || [model];
            return (
              <ModelCard
                key={`${model.model}-${model.inference_provider.provider}-${index}`}
                model={model}
                modelsGroup={modelsGroup}
                showPublisherProvider={true}
                showRanking={true}
              />
            );
          })}
        </div>
      ) : (
        <NewModelsTable
          models={filteredModels}
          isNewModel={isNewModel}
          copiedModel={copiedModel}
          copyModelName={copyModelName}
        />
      )}

      {/* Empty State */}
      {filteredModels.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-400">No models found matching your filters.</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedProviders([]);
              setSelectedPublishers([]);
              setSelectedType('all');
              setSelectedInputFormats([]);
              setSelectedOutputFormats([]);
              setMinContextSize(undefined);
              setMaxContextSize(undefined);
              setMinInputCost(undefined);
              setMaxInputCost(undefined);
            }}
            className="mt-4 text-sm text-zinc-300 hover:text-white underline"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
};
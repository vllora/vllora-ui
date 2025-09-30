import React, { useState, useMemo, useCallback } from 'react';
import { LocalModel } from '@/types/models';
import { LocalModelCard } from './LocalModelCard';
import { LocalModelsTable } from './LocalModelsTable';
import { LocalModelSearchFilters } from './LocalModelSearchFilters';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LocalModelsExplorerProps {
  models: LocalModel[];
  showViewModeToggle?: boolean;
  showStats?: boolean;
  statsTitle?: string;
}

export const LocalModelsExplorer: React.FC<LocalModelsExplorerProps> = ({
  models,
  showViewModeToggle = true,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [copiedModel, setCopiedModel] = useState<string | null>(null);
  const [groupByName, setGroupByName] = useState(false);

  // Group models by model name (without provider prefix) - only if grouping by name is enabled
  const groupedModels = useMemo(() => {
    if (!groupByName) {
      // Return models as-is when NOT grouping by name
      return models;
    }

    // Otherwise, group by model name
    const groups = new Map<string, LocalModel[]>();

    models.forEach(model => {
      const [, ...modelNameParts] = model.id.split('/');
      const modelName = modelNameParts.join('/'); // Handle cases where model name might have slashes

      if (!groups.has(modelName)) {
        groups.set(modelName, []);
      }
      groups.get(modelName)!.push(model);
    });

    // Convert to array with _modelGroup property
    return Array.from(groups.entries()).map(([modelName, modelGroup]) => {
      const firstModel = { ...modelGroup[0] };
      (firstModel as any)._modelGroup = modelGroup;
      (firstModel as any)._modelName = modelName;
      return firstModel;
    });
  }, [models, groupByName]);

  // Extract unique providers and owners
  const providers = useMemo(() => {
    const uniqueProviders = new Set<string>();
    models.forEach(m => {
      const provider = m.id.split('/')[0];
      if (provider) {
        uniqueProviders.add(provider);
      }
    });
    return Array.from(uniqueProviders).sort();
  }, [models]);

  const owners = useMemo(() => {
    const uniqueOwners = new Set<string>();
    models.forEach(m => {
      if (m.owned_by) {
        uniqueOwners.add(m.owned_by);
      }
    });
    return Array.from(uniqueOwners).sort();
  }, [models]);

  // Filter grouped models
  const filteredModels = useMemo(() => {
    return groupedModels.filter((model: any) => {
      const modelGroup = model._modelGroup || [model];
      const modelName = model._modelName || model.id.split('/').slice(1).join('/');

      // Search term filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const nameMatch = modelName.toLowerCase().includes(search);
        const providerMatch = modelGroup.some((m: LocalModel) =>
          m.id.split('/')[0].toLowerCase().includes(search)
        );
        const ownerMatch = modelGroup.some((m: LocalModel) =>
          m.owned_by.toLowerCase().includes(search)
        );

        if (!nameMatch && !providerMatch && !ownerMatch) {
          return false;
        }
      }

      // Provider filter - check if ANY model in the group has a matching provider
      if (selectedProviders.length > 0) {
        const hasMatchingProvider = modelGroup.some((m: LocalModel) =>
          selectedProviders.includes(m.id.split('/')[0])
        );
        if (!hasMatchingProvider) {
          return false;
        }
      }

      // Owner filter - check if ANY model in the group has a matching owner
      if (selectedOwners.length > 0) {
        const hasMatchingOwner = modelGroup.some((m: LocalModel) =>
          selectedOwners.includes(m.owned_by)
        );
        if (!hasMatchingOwner) {
          return false;
        }
      }

      return true;
    });
  }, [groupedModels, searchTerm, selectedProviders, selectedOwners]);

  // Copy model name function
  const copyModelName = useCallback(async (modelName: string) => {
    await navigator.clipboard.writeText(modelName);
    setCopiedModel(modelName);
    setTimeout(() => setCopiedModel(null), 2000);
  }, []);

  

  return (
    <div className="flex flex-col space-y-6">
      {/* Filters */}
      <LocalModelSearchFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedProviders={selectedProviders}
        onProvidersChange={setSelectedProviders}
        selectedOwners={selectedOwners}
        onOwnersChange={setSelectedOwners}
        providers={providers}
        owners={owners}
        resultsCount={filteredModels.length}
        totalCount={models.length}
        groupByName={groupByName}
        onGroupByNameChange={setGroupByName}
      />

      {/* View Mode Toggle */}
      {showViewModeToggle && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-zinc-400">
            Showing {filteredModels.length} of {groupedModels.length} {groupByName ? 'models' : 'models'}
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
          {filteredModels.map((model, index) => (
            <LocalModelCard
              key={`${model.id}-${index}`}
              model={model}
            />
          ))}
        </div>
      ) : (
        <LocalModelsTable
          models={filteredModels}
          copiedModel={copiedModel}
          copyModelName={copyModelName}
        />
      )}

      {/* Empty State */}
      {filteredModels.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-400">No local models found matching your filters.</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedProviders([]);
              setSelectedOwners([]);
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
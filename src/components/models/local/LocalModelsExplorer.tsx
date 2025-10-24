import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LocalModel } from '@/types/models';
import { LocalModelCard } from './LocalModelCard';
import { LocalModelsTable } from './LocalModelsTable';
import { LocalModelSearchFilters } from './LocalModelSearchFilters';
import { LayoutGrid, List, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderInfo } from '@/services/providers-api';

interface LocalModelsExplorerProps {
  models: LocalModel[];
  showViewModeToggle?: boolean;
  showStats?: boolean;
  statsTitle?: string;
  providers?: ProviderInfo[];
  providerStatusMap?: Map<string, boolean>;
  getModelType?: (providerName: string, providersData: any[]) => 'remote' | 'opensource' | 'local' | 'unknown';
  defaultView?: 'grid' | 'table';
}

export const LocalModelsExplorer: React.FC<LocalModelsExplorerProps> = ({
  models,
  showViewModeToggle = true,
  providers: providersData = [],
  providerStatusMap = new Map(),
  getModelType = () => 'unknown',
  defaultView = 'grid',
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL params, with fallback to defaultView
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    const view = searchParams.get('view');
    if (view === 'table' || view === 'grid') {
      return view;
    }
    return defaultView;
  });
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [selectedProviders, setSelectedProviders] = useState<string[]>(() => {
    const providers = searchParams.get('providers');
    return providers ? providers.split(',') : [];
  });
  const [selectedOwners, setSelectedOwners] = useState<string[]>(() => {
    const owners = searchParams.get('owners');
    return owners ? owners.split(',') : [];
  });
  const [groupByName, setGroupByName] = useState(() => {
    return searchParams.get('groupByName') === 'true';
  });
  const [showConfiguredOnly, setShowConfiguredOnly] = useState(() => {
    return searchParams.get('configured') === 'true';
  });
  const [copiedModel, setCopiedModel] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // New comprehensive filter states
  const [selectedInputFormats, setSelectedInputFormats] = useState<string[]>(() => {
    const formats = searchParams.get('inputFormats');
    return formats ? formats.split(',') : [];
  });
  const [selectedOutputFormats, setSelectedOutputFormats] = useState<string[]>(() => {
    const formats = searchParams.get('outputFormats');
    return formats ? formats.split(',') : [];
  });
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(() => {
    const capabilities = searchParams.get('capabilities');
    return capabilities ? capabilities.split(',') : [];
  });
  const [minContextSize, setMinContextSize] = useState<number | undefined>(() => {
    const min = searchParams.get('minContext');
    return min ? parseInt(min) : undefined;
  });
  const [maxContextSize, setMaxContextSize] = useState<number | undefined>(() => {
    const max = searchParams.get('maxContext');
    return max ? parseInt(max) : undefined;
  });
  const [minInputCost, setMinInputCost] = useState<number | undefined>(() => {
    const min = searchParams.get('minInputCost');
    return min ? parseFloat(min) : undefined;
  });
  const [maxInputCost, setMaxInputCost] = useState<number | undefined>(() => {
    const max = searchParams.get('maxInputCost');
    return max ? parseFloat(max) : undefined;
  });
  const [minOutputCost, setMinOutputCost] = useState<number | undefined>(() => {
    const min = searchParams.get('minOutputCost');
    return min ? parseFloat(min) : undefined;
  });
  const [maxOutputCost, setMaxOutputCost] = useState<number | undefined>(() => {
    const max = searchParams.get('maxOutputCost');
    return max ? parseFloat(max) : undefined;
  });
  const [cachingEnabled, setCachingEnabled] = useState<boolean | undefined>(() => {
    const caching = searchParams.get('caching');
    return caching === 'true' ? true : caching === 'false' ? false : undefined;
  });
  const [selectedType, setSelectedType] = useState<string>(() => {
    return searchParams.get('type') || 'all';
  });

  // Update URL params when state changes
  useEffect(() => {
    // Start with existing search params to preserve things like project_id
    const params = new URLSearchParams(searchParams);

    // Only sync view mode to URL if toggle is shown
    if (showViewModeToggle) {
      if (viewMode === 'grid') {
        params.delete('view');
      } else {
        params.set('view', viewMode);
      }
    } else {
      // If toggle is hidden, remove view param from URL
      params.delete('view');
    }

    if (!searchTerm) {
      params.delete('search');
    } else {
      params.set('search', searchTerm);
    }

    if (selectedProviders.length === 0) {
      params.delete('providers');
    } else {
      params.set('providers', selectedProviders.join(','));
    }

    if (selectedOwners.length === 0) {
      params.delete('owners');
    } else {
      params.set('owners', selectedOwners.join(','));
    }

    if (!groupByName) {
      params.delete('groupByName');
    } else {
      params.set('groupByName', 'true');
    }

    if (showConfiguredOnly) {
      params.set('configured', 'true');
    } else {
      params.delete('configured');
    }

    // New filter params
    if (selectedInputFormats.length === 0) {
      params.delete('inputFormats');
    } else {
      params.set('inputFormats', selectedInputFormats.join(','));
    }

    if (selectedOutputFormats.length === 0) {
      params.delete('outputFormats');
    } else {
      params.set('outputFormats', selectedOutputFormats.join(','));
    }

    if (selectedCapabilities.length === 0) {
      params.delete('capabilities');
    } else {
      params.set('capabilities', selectedCapabilities.join(','));
    }

    if (minContextSize === undefined) {
      params.delete('minContext');
    } else {
      params.set('minContext', minContextSize.toString());
    }

    if (maxContextSize === undefined) {
      params.delete('maxContext');
    } else {
      params.set('maxContext', maxContextSize.toString());
    }

    if (minInputCost === undefined) {
      params.delete('minInputCost');
    } else {
      params.set('minInputCost', minInputCost.toString());
    }

    if (maxInputCost === undefined) {
      params.delete('maxInputCost');
    } else {
      params.set('maxInputCost', maxInputCost.toString());
    }

    if (minOutputCost === undefined) {
      params.delete('minOutputCost');
    } else {
      params.set('minOutputCost', minOutputCost.toString());
    }

    if (maxOutputCost === undefined) {
      params.delete('maxOutputCost');
    } else {
      params.set('maxOutputCost', maxOutputCost.toString());
    }

    if (cachingEnabled === undefined) {
      params.delete('caching');
    } else {
      params.set('caching', cachingEnabled.toString());
    }

    if (selectedType === 'all') {
      params.delete('type');
    } else {
      params.set('type', selectedType);
    }

    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewMode,
    searchTerm,
    selectedProviders,
    selectedOwners,
    groupByName,
    showConfiguredOnly,
    selectedInputFormats,
    selectedOutputFormats,
    minContextSize,
    maxContextSize,
    minInputCost,
    maxInputCost,
    minOutputCost,
    maxOutputCost,
    cachingEnabled,
    selectedType,
    showViewModeToggle,
    // Note: searchParams and setSearchParams are intentionally not in deps to avoid infinite loops
  ]);

  // Track scroll position to show/hide scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const scrollContainer = document.querySelector('section.overflow-auto');
      if (scrollContainer) {
        if (scrollContainer.scrollTop > 200) {
          setShowScrollTop(true);
        } else if (scrollContainer.scrollTop <= 200) {
          setShowScrollTop(false);
        }
      }
    };

    const scrollContainer = document.querySelector('section.overflow-auto');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Scroll to top function
  const scrollToTop = () => {
    const scrollContainer = document.querySelector('section.overflow-auto');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Group models by model name (without provider prefix) - only if grouping by name is enabled
  const groupedModels = useMemo(() => {
    if (!groupByName) {
      // Return models as-is when NOT grouping by name
      return models;
    }

    // Otherwise, group by model name
    const groups = new Map<string, LocalModel[]>();

    models.forEach(model => {
      const modelName = model.model;

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
  const uniqueProviders = useMemo(() => {
    const uniqueProviderSet = new Set<string>();
    models.forEach(m => {
      const provider = m.inference_provider.provider;
      if (provider) {
        uniqueProviderSet.add(provider);
      }
    });
    return Array.from(uniqueProviderSet).sort();
  }, [models]);

  const owners = useMemo(() => {
    const uniqueOwners = new Set<string>();
    models.forEach(m => {
      if (m.model_provider) {
        uniqueOwners.add(m.model_provider);
      }
    });
    return Array.from(uniqueOwners).sort();
  }, [models]);

  // Extract unique values for new filters
  const inputFormats = useMemo(() => {
    const uniqueFormats = new Set<string>();
    models.forEach(m => {
      if (m.input_formats) {
        m.input_formats.forEach(format => uniqueFormats.add(format));
      }
    });
    return Array.from(uniqueFormats).sort();
  }, [models]);

  const outputFormats = useMemo(() => {
    const uniqueFormats = new Set<string>();
    models.forEach(m => {
      if (m.output_formats) {
        m.output_formats.forEach(format => uniqueFormats.add(format));
      }
    });
    return Array.from(uniqueFormats).sort();
  }, [models]);

  const capabilities = useMemo(() => {
    const uniqueCapabilities = new Set<string>();
    models.forEach(m => {
      if (m.capabilities) {
        m.capabilities.forEach(capability => uniqueCapabilities.add(capability));
      }
    });
    return Array.from(uniqueCapabilities).sort();
  }, [models]);

  const types = useMemo(() => {
    const uniqueTypes = new Set<string>();
    models.forEach(m => {
      if (m.type) {
        uniqueTypes.add(m.type);
      }
    });
    return Array.from(uniqueTypes).sort();
  }, [models]);

  const contextSizeRange = useMemo(() => {
    const contextSizes = models.map(m => m.limits?.max_context_size || 0);
    return {
      min: Math.min(...contextSizes),
      max: Math.max(...contextSizes)
    };
  }, [models]);

  const inputCostRange = useMemo(() => {
    const inputCosts = models.map(m => m.price?.per_input_token || 0);
    return {
      min: Math.min(...inputCosts),
      max: Math.max(...inputCosts)
    };
  }, [models]);

  const outputCostRange = useMemo(() => {
    const outputCosts = models.map(m => m.price?.per_output_token || 0);
    return {
      min: Math.min(...outputCosts),
      max: Math.max(...outputCosts)
    };
  }, [models]);

  // Filter grouped models
  const filteredModels = useMemo(() => {
    return groupedModels.filter((model: any) => {
      const modelGroup = model._modelGroup || [model];
      const modelName = model._modelName || model.model;

      // Search term filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const nameMatch = modelName.toLowerCase().includes(search);
        const providerMatch = modelGroup.some((m: LocalModel) =>
          m.inference_provider.provider.toLowerCase().includes(search)
        );
        const ownerMatch = modelGroup.some((m: LocalModel) =>
          m.model_provider.toLowerCase().includes(search)
        );

        if (!nameMatch && !providerMatch && !ownerMatch) {
          return false;
        }
      }

      // Provider filter - check if ANY model in the group has a matching provider
      if (selectedProviders.length > 0) {
        const hasMatchingProvider = modelGroup.some((m: LocalModel) =>
          selectedProviders.includes(m.inference_provider.provider)
        );
        if (!hasMatchingProvider) {
          return false;
        }
      }

      // Owner filter - check if ANY model in the group has a matching owner
      if (selectedOwners.length > 0) {
        const hasMatchingOwner = modelGroup.some((m: LocalModel) =>
          selectedOwners.includes(m.model_provider)
        );
        if (!hasMatchingOwner) {
          return false;
        }
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

      // Capabilities filter
      if (selectedCapabilities.length > 0) {
        const modelCapabilities = model.capabilities || [];
        const hasMatchingCapability = selectedCapabilities.some(capability => 
          modelCapabilities.includes(capability)
        );
        if (!hasMatchingCapability) {
          return false;
        }
      }

      // Context size filter
      if (minContextSize !== undefined && model.limits?.max_context_size < minContextSize) {
        return false;
      }
      if (maxContextSize !== undefined && model.limits?.max_context_size > maxContextSize) {
        return false;
      }

      // Input cost filter
      if (minInputCost !== undefined && model.price?.per_input_token < minInputCost) {
        return false;
      }
      if (maxInputCost !== undefined && model.price?.per_input_token > maxInputCost) {
        return false;
      }

      // Output cost filter
      if (minOutputCost !== undefined && model.price?.per_output_token < minOutputCost) {
        return false;
      }
      if (maxOutputCost !== undefined && model.price?.per_output_token > maxOutputCost) {
        return false;
      }

      // Caching filter
      if (cachingEnabled !== undefined) {
        const hasCaching = model.price?.per_cached_input_token !== undefined;
        if (cachingEnabled && !hasCaching) {
          return false;
        }
        if (!cachingEnabled && hasCaching) {
          return false;
        }
      }

      // Configuration status filter - show only configured models
      if (showConfiguredOnly) {
        const hasConfiguredProvider = modelGroup.some((m: LocalModel) => {
          const provider = m.inference_provider.provider.toLowerCase();
          const providerExists = providersData.some(p => p.name.toLowerCase() === provider);
          const hasCredentials = providerStatusMap.get(provider) || false;
          return providerExists && hasCredentials;
        });
        if (!hasConfiguredProvider) {
          return false;
        }
      }

      return true;
    });
  }, [groupedModels, searchTerm, selectedProviders, selectedOwners, selectedType, selectedInputFormats, selectedOutputFormats, minContextSize, maxContextSize, minInputCost, maxInputCost, minOutputCost, maxOutputCost, cachingEnabled, showConfiguredOnly, getModelType, providerStatusMap, providersData]);

  // Copy model name function
  const copyModelName = useCallback(async (modelName: string) => {
    await navigator.clipboard.writeText(modelName);
    setCopiedModel(modelName);
    setTimeout(() => setCopiedModel(null), 2000);
  }, []);

  

  return (
    <div className="flex flex-col space-y-6">
      {/* Sticky container for Filters and View Mode Toggle */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm pt-4 pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 space-y-4 border-b border-border/50">
        <LocalModelSearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedProviders={selectedProviders}
          onProvidersChange={setSelectedProviders}
          selectedOwners={selectedOwners}
          onOwnersChange={setSelectedOwners}
          providers={uniqueProviders}
          owners={owners}
          resultsCount={filteredModels.length}
          totalCount={models.length}
          groupByName={groupByName}
          onGroupByNameChange={setGroupByName}
          showConfiguredOnly={showConfiguredOnly}
          onShowConfiguredOnlyChange={setShowConfiguredOnly}
          // New comprehensive filter props
          selectedInputFormats={selectedInputFormats}
          onInputFormatsChange={setSelectedInputFormats}
          selectedOutputFormats={selectedOutputFormats}
          onOutputFormatsChange={setSelectedOutputFormats}
          selectedCapabilities={selectedCapabilities}
          onCapabilitiesChange={setSelectedCapabilities}
          minContextSize={minContextSize}
          onMinContextSizeChange={setMinContextSize}
          maxContextSize={maxContextSize}
          onMaxContextSizeChange={setMaxContextSize}
          minInputCost={minInputCost}
          onMinInputCostChange={setMinInputCost}
          maxInputCost={maxInputCost}
          onMaxInputCostChange={setMaxInputCost}
          minOutputCost={minOutputCost}
          onMinOutputCostChange={setMinOutputCost}
          maxOutputCost={maxOutputCost}
          onMaxOutputCostChange={setMaxOutputCost}
          cachingEnabled={cachingEnabled}
          onCachingEnabledChange={setCachingEnabled}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
          inputFormats={inputFormats}
          outputFormats={outputFormats}
          capabilities={capabilities}
          types={types}
          contextSizeRange={contextSizeRange}
          inputCostRange={inputCostRange}
          outputCostRange={outputCostRange}
        />

        {/* View Mode Toggle */}
        {showViewModeToggle && (
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
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
      </div>

      {/* Models Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.map((model, index) => (
            <LocalModelCard
              key={`${model.inference_provider.provider}/${model.model}-${index}`}
              model={model}
              providerStatusMap={providerStatusMap}
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
          <p className="text-muted-foreground">No local models found matching your filters.</p>
        </div>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 p-3 rounded-full bg-[rgb(var(--theme-500))]/30 backdrop-blur-md hover:bg-[rgb(var(--theme-500))]/50 text-white shadow-lg transition-all duration-300 hover:scale-110 animate-in fade-in slide-in-from-bottom-4"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
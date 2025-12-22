import React, { useEffect, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounceFn } from 'ahooks';
import { LocalProviderFilter } from '../filter-components/LocalProviderFilter';
import { OwnerFilter } from '../filter-components/OwnerFilter';
import { FormatDropdown } from '../filter-components/FormatDropdown';
import { ContextSizeFilter } from '../filter-components/ContextSizeFilter';
import { CombinedCostFilter } from '../filter-components/CombinedCostFilter';
import { CachingFilter } from '../filter-components/CachingFilter';
import { TypeFilter } from '../filter-components/TypeFilter';

interface LocalModelSearchFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedProviders: string[];
  onProvidersChange: (providers: string[]) => void;
  selectedOwners: string[];
  onOwnersChange: (owners: string[]) => void;
  providers: string[];
  owners: string[];
  resultsCount: number;
  totalCount?: number;
  showConfiguredOnly?: boolean;
  onShowConfiguredOnlyChange?: (value: boolean) => void;
  showCustomOnly?: boolean;
  onShowCustomOnlyChange?: (value: boolean) => void;
  // New optional filter props
  selectedInputFormats?: string[];
  onInputFormatsChange?: (formats: string[]) => void;
  selectedOutputFormats?: string[];
  onOutputFormatsChange?: (formats: string[]) => void;
  selectedCapabilities?: string[];
  onCapabilitiesChange?: (capabilities: string[]) => void;
  minContextSize?: number;
  onMinContextSizeChange?: (value?: number) => void;
  maxContextSize?: number;
  onMaxContextSizeChange?: (value?: number) => void;
  minInputCost?: number;
  onMinInputCostChange?: (value?: number) => void;
  maxInputCost?: number;
  onMaxInputCostChange?: (value?: number) => void;
  minOutputCost?: number;
  onMinOutputCostChange?: (value?: number) => void;
  maxOutputCost?: number;
  onMaxOutputCostChange?: (value?: number) => void;
  cachingEnabled?: boolean;
  onCachingEnabledChange?: (value?: boolean) => void;
  selectedType?: string;
  onTypeChange?: (type: string) => void;
  inputFormats?: string[];
  outputFormats?: string[];
  capabilities?: string[];
  types?: string[];
  contextSizeRange?: { min: number; max: number };
  inputCostRange?: { min: number; max: number };
  outputCostRange?: { min: number; max: number };
}

export const LocalModelSearchFilters: React.FC<LocalModelSearchFiltersProps> = ({
  searchTerm,
  onSearchChange,
  selectedProviders,
  onProvidersChange,
  selectedOwners,
  onOwnersChange,
  providers,
  owners,
  showConfiguredOnly = false,
  onShowConfiguredOnlyChange,
  showCustomOnly = false,
  onShowCustomOnlyChange,
  // New optional props with defaults
  selectedInputFormats = [],
  onInputFormatsChange = () => {},
  selectedOutputFormats = [],
  onOutputFormatsChange = () => {},
  selectedCapabilities = [],
  onCapabilitiesChange = () => {},
  minContextSize,
  onMinContextSizeChange = () => {},
  maxContextSize,
  onMaxContextSizeChange = () => {},
  minInputCost,
  onMinInputCostChange = () => {},
  maxInputCost,
  onMaxInputCostChange = () => {},
  minOutputCost,
  onMinOutputCostChange = () => {},
  maxOutputCost,
  onMaxOutputCostChange = () => {},
  cachingEnabled,
  onCachingEnabledChange = () => {},
  selectedType = 'all',
  onTypeChange = () => {},
  inputFormats = [],
  outputFormats = [],
  capabilities = [],
  types = [],
  contextSizeRange = { min: 0, max: 1000000 },
  inputCostRange = { min: 0, max: 100 },
  outputCostRange = { min: 0, max: 100 },
}) => {
  // Local state for immediate UI update
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

  // Debounced function to update the actual search term
  const { run: debouncedSetSearchTerm } = useDebounceFn(
    (value: string) => {
      onSearchChange(value);
    },
    { wait: 500 }
  );

  // Update local state when external searchTerm changes
  useEffect(() => {
    setLocalSearchTerm(searchTerm);
  }, [searchTerm]);

  // Handle input change with debounce
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearchTerm(value);
    debouncedSetSearchTerm(value);
  }, [debouncedSetSearchTerm]);

  const clearAllFilters = () => {
    onSearchChange('');
    onProvidersChange([]);
    onOwnersChange([]);
    if (onInputFormatsChange) onInputFormatsChange([]);
    if (onOutputFormatsChange) onOutputFormatsChange([]);
    if (onCapabilitiesChange) onCapabilitiesChange([]);
    if (onMinContextSizeChange) onMinContextSizeChange(undefined);
    if (onMaxContextSizeChange) onMaxContextSizeChange(undefined);
    if (onMinInputCostChange) onMinInputCostChange(undefined);
    if (onMaxInputCostChange) onMaxInputCostChange(undefined);
    if (onMinOutputCostChange) onMinOutputCostChange(undefined);
    if (onMaxOutputCostChange) onMaxOutputCostChange(undefined);
    if (onCachingEnabledChange) onCachingEnabledChange(undefined);
    if (onTypeChange) onTypeChange('all');
    if (onShowCustomOnlyChange) onShowCustomOnlyChange(false);
  };

  const hasActiveFilters = selectedProviders.length > 0 ||
    selectedOwners.length > 0 ||
    (selectedInputFormats && selectedInputFormats.length > 0) ||
    (selectedOutputFormats && selectedOutputFormats.length > 0) ||
    (selectedCapabilities && selectedCapabilities.length > 0) ||
    minContextSize !== undefined ||
    maxContextSize !== undefined ||
    minInputCost !== undefined ||
    maxInputCost !== undefined ||
    minOutputCost !== undefined ||
    maxOutputCost !== undefined ||
    cachingEnabled !== undefined ||
    (selectedType && selectedType !== 'all') ||
    showCustomOnly ||
    searchTerm;

  return (
    <div className="w-full space-y-4">
      {/* Search Bar */}
      <div className="relative w-full group">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-[rgb(var(--theme-500))]" />
        <input
          type="text"
          placeholder="Search models by name, provider, or publisher..."
          value={localSearchTerm}
          onChange={handleSearchChange}
          className="w-full pl-12 pr-12 py-3.5 bg-card text-foreground placeholder-muted-foreground
            border border-border rounded-lg
            focus:border-[rgb(var(--theme-500))] focus:shadow-[0_0_0_3px_rgba(var(--theme-rgb),0.1)]
            focus:outline-none transition-all duration-200"
        />
        {localSearchTerm && (
          <button
            onClick={() => {
              setLocalSearchTerm('');
              onSearchChange('');
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1.5 hover:bg-accent rounded-full transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Desktop Filter Controls */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {/* Owner Filter (Publisher) */}
        {owners.length > 1 && (
          <OwnerFilter
            owners={owners}
            selectedOwners={selectedOwners}
            setSelectedOwners={onOwnersChange}
          />
        )}

        {/* Provider Filter */}
        {providers.length > 1 && (
          <LocalProviderFilter
            providers={providers}
            selectedProviders={selectedProviders}
            setSelectedProviders={onProvidersChange}
          />
        )}

        {/* Type Filter */}
        {types.length > 0 && (
          <TypeFilter
            selectedType={selectedType}
            setSelectedType={onTypeChange}
            types={types}
          />
        )}

        {/* Input Formats Filter */}
        {inputFormats.length > 0 && (
          <FormatDropdown
            label="Input Formats"
            placeholder="Search input formats..."
            formats={inputFormats}
            selectedFormats={selectedInputFormats}
            setSelectedFormats={onInputFormatsChange}
          />
        )}

        {/* Output Formats Filter */}
        {outputFormats.length > 0 && (
          <FormatDropdown
            label="Output Formats"
            placeholder="Search output formats..."
            formats={outputFormats}
            selectedFormats={selectedOutputFormats}
            setSelectedFormats={onOutputFormatsChange}
          />
        )}

        {/* Capabilities Filter */}
        {capabilities.length > 0 && (
          <FormatDropdown
            label="Capabilities"
            placeholder="Search capabilities..."
            formats={capabilities}
            selectedFormats={selectedCapabilities}
            setSelectedFormats={onCapabilitiesChange}
          />
        )}

        {/* Context Size Filter */}
        {contextSizeRange && (
          <ContextSizeFilter
            minValue={minContextSize}
            maxValue={maxContextSize}
            rangeMin={contextSizeRange.min}
            rangeMax={contextSizeRange.max}
            onChange={(min, max) => {
              onMinContextSizeChange(min);
              onMaxContextSizeChange(max);
            }}
          />
        )}

        {/* Cost Filter */}
        {inputCostRange && outputCostRange && (
          <CombinedCostFilter
            minInputCost={minInputCost}
            setMinInputCost={onMinInputCostChange}
            maxInputCost={maxInputCost}
            setMaxInputCost={onMaxInputCostChange}
            minOutputCost={minOutputCost}
            setMinOutputCost={onMinOutputCostChange}
            maxOutputCost={maxOutputCost}
            setMaxOutputCost={onMaxOutputCostChange}
            inputCostRange={inputCostRange}
            outputCostRange={outputCostRange}
          />
        )}

        {/* Caching Filter */}
        <CachingFilter
          cachingEnabled={cachingEnabled}
          setCachingEnabled={onCachingEnabledChange}
        />

        {/* Configured Filter */}
        {onShowConfiguredOnlyChange && (
          <label className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={showConfiguredOnly}
              onChange={(e) => onShowConfiguredOnlyChange(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background text-[rgb(var(--theme-500))] focus:ring-ring focus:ring-2 cursor-pointer"
            />
            <span>Configured</span>
          </label>
        )}

        {/* Custom Filter */}
        {onShowCustomOnlyChange && (
          <label className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={showCustomOnly}
              onChange={(e) => onShowCustomOnlyChange(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background text-[rgb(var(--theme-500))] focus:ring-ring focus:ring-2 cursor-pointer"
            />
            <span>Custom</span>
          </label>
        )}
      </div>

      {/* Active Filters */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filtering:</span>
          <div className="flex flex-wrap gap-1.5">
            {searchTerm && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                "{searchTerm}"
                <button
                  onClick={() => onSearchChange('')}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </span>
            )}
            {selectedProviders.map(provider => (
              <div key={provider} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>provider:</span>
                <span className="font-bold">{provider}</span>
                <button
                  onClick={() => onProvidersChange(selectedProviders.filter(p => p !== provider))}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
            {selectedOwners.map(owner => (
              <div key={owner} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>publisher:</span>
                <span className="font-bold">{owner}</span>
                <button
                  onClick={() => onOwnersChange(selectedOwners.filter(o => o !== owner))}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
            {selectedInputFormats && selectedInputFormats.map(format => (
              <div key={format} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>input:</span>
                <span className="font-bold">{format}</span>
                <button
                  onClick={() => onInputFormatsChange && onInputFormatsChange(selectedInputFormats.filter(f => f !== format))}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
            {selectedOutputFormats && selectedOutputFormats.map(format => (
              <div key={format} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>output:</span>
                <span className="font-bold">{format}</span>
                <button
                  onClick={() => onOutputFormatsChange && onOutputFormatsChange(selectedOutputFormats.filter(f => f !== format))}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
            {selectedCapabilities && selectedCapabilities.length > 0 && selectedCapabilities.map(capability => (
              <div key={capability} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>capability:</span>
                <span className="font-bold">{capability}</span>
                <button
                  onClick={() => onCapabilitiesChange && onCapabilitiesChange(selectedCapabilities.filter(c => c !== capability))}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
            {(minContextSize !== undefined || maxContextSize !== undefined) && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>context:</span>
                <span className="font-bold">
                  {minContextSize || 0} - {maxContextSize || '∞'}
                </span>
                <button
                  onClick={() => {
                    if (onMinContextSizeChange) onMinContextSizeChange(undefined);
                    if (onMaxContextSizeChange) onMaxContextSizeChange(undefined);
                  }}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            )}
            {(minInputCost !== undefined || maxInputCost !== undefined || minOutputCost !== undefined || maxOutputCost !== undefined) && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>cost:</span>
                <span className="font-bold">filtered</span>
                <button
                  onClick={() => {
                    if (onMinInputCostChange) onMinInputCostChange(undefined);
                    if (onMaxInputCostChange) onMaxInputCostChange(undefined);
                    if (onMinOutputCostChange) onMinOutputCostChange(undefined);
                    if (onMaxOutputCostChange) onMaxOutputCostChange(undefined);
                  }}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            )}
            {cachingEnabled !== undefined && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>caching:</span>
                <span className="font-bold">{cachingEnabled ? 'enabled' : 'disabled'}</span>
                <button
                  onClick={() => onCachingEnabledChange && onCachingEnabledChange(undefined)}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            )}
            {selectedType !== 'all' && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span>type:</span>
                <span className="font-bold">{selectedType}</span>
                <button
                  onClick={() => onTypeChange && onTypeChange('all')}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            )}
            {showCustomOnly && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
                <span className="font-bold">custom</span>
                <button
                  onClick={() => onShowCustomOnlyChange && onShowCustomOnlyChange(false)}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          <button
            onClick={clearAllFilters}
            className="ml-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};
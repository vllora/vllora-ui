import React, { useEffect, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounceFn } from 'ahooks';
import { LocalProviderFilter } from './filter-components/LocalProviderFilter';
import { OwnerFilter } from './filter-components/OwnerFilter';

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
  resultsCount,
  totalCount,
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
  };

  const hasActiveFilters = selectedProviders.length > 0 ||
    selectedOwners.length > 0 ||
    searchTerm;

  return (
    <div className="w-full space-y-4">
      {/* Search Bar */}
      <div className="relative w-full group">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-zinc-500 w-5 h-5 transition-colors group-focus-within:text-emerald-400" />
        <input
          type="text"
          placeholder="Search models by name, provider, or owner..."
          value={localSearchTerm}
          onChange={handleSearchChange}
          className="w-full pl-12 pr-12 py-3.5 bg-zinc-900/50 text-white placeholder-zinc-500
            border border-zinc-800 rounded-lg
            focus:border-emerald-500/50 focus:bg-zinc-900/80 focus:ring-2 focus:ring-emerald-500/20
            focus:outline-none transition-all duration-200"
        />
        {localSearchTerm && (
          <button
            onClick={() => {
              setLocalSearchTerm('');
              onSearchChange('');
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1.5 hover:bg-zinc-700/50 rounded-full transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4 text-zinc-400 hover:text-white" />
          </button>
        )}
      </div>

      {/* Desktop Filter Controls */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {/* Provider Filter */}
        {providers.length > 1 && (
          <LocalProviderFilter
            providers={providers}
            selectedProviders={selectedProviders}
            setSelectedProviders={onProvidersChange}
          />
        )}

        {/* Owner Filter */}
        {owners.length > 1 && (
          <OwnerFilter
            owners={owners}
            selectedOwners={selectedOwners}
            setSelectedOwners={onOwnersChange}
          />
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="ml-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active Filters & Results */}
      <div className="flex items-center justify-between mt-1">
        {/* Active Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasActiveFilters && (
            <>
              <span className="text-xs text-zinc-600">Filtering:</span>
              <div className="flex flex-wrap gap-1.5">
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                    "{searchTerm}"
                    <button
                      onClick={() => onSearchChange('')}
                      className="ml-1 hover:text-zinc-200"
                    >
                      ×
                    </button>
                  </span>
                )}
                {selectedProviders.map(provider => (
                  <div key={provider} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                    <span>provider:</span>
                    <span className="text-zinc-300 font-bold">{provider}</span>
                    <button
                      onClick={() => onProvidersChange(selectedProviders.filter(p => p !== provider))}
                      className="ml-1 hover:text-zinc-200"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {selectedOwners.map(owner => (
                  <div key={owner} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                    <span>owner:</span>
                    <span className="text-zinc-300 font-bold">{owner}</span>
                    <button
                      onClick={() => onOwnersChange(selectedOwners.filter(o => o !== owner))}
                      className="ml-1 hover:text-zinc-200"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={clearAllFilters}
                className="ml-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear all
              </button>
            </>
          )}
        </div>

        {/* Results Count */}
        <div className="text-xs text-zinc-500">
          <span className="text-zinc-300 font-medium">{resultsCount}</span>
          <span> / {totalCount || resultsCount} models</span>
        </div>
      </div>
    </div>
  );
};
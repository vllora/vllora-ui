import React, { useEffect, useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounceFn } from 'ahooks';
import { LocalProviderFilter } from '../filter-components/LocalProviderFilter';
import { OwnerFilter } from '../filter-components/OwnerFilter';

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
  groupByName?: boolean;
  onGroupByNameChange?: (value: boolean) => void;
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
  groupByName = false,
  onGroupByNameChange,
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
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-theme-500" />
        <input
          type="text"
          placeholder="Search models by name, provider, or owner..."
          value={localSearchTerm}
          onChange={handleSearchChange}
          className="w-full pl-12 pr-12 py-3.5 bg-card text-foreground placeholder-muted-foreground
            border border-border rounded-lg
            focus:border-theme-500 focus:shadow-[0_0_0_3px_rgba(var(--theme-rgb),0.1)]
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

        {/* Group By Model Name Checkbox */}
        {onGroupByNameChange && providers.length > 1 && (
          <label className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={groupByName}
              onChange={(e) => onGroupByNameChange(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-background text-theme-500 focus:ring-ring focus:ring-2 cursor-pointer"
            />
            <span>Group by name</span>
          </label>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="ml-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
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
                <span>owner:</span>
                <span className="font-bold">{owner}</span>
                <button
                  onClick={() => onOwnersChange(selectedOwners.filter(o => o !== owner))}
                  className="ml-1 hover:text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
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
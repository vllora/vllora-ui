import React, { useEffect, useState, useCallback } from 'react';
import { Search, Grid3X3, List, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounceFn } from 'ahooks';
import { FormatDropdown } from './FormatDropdown';
import { ContextSizeFilter } from './ContextSizeFilter';
import { getModelTypeDisplayName } from '@/utils/modelUtils';
import {
  ProviderFilter,
  PublisherFilter,
  TypeFilter,
  CategoryFilter,
  CombinedCostFilter,
  CachingFilter
} from './filter-components';

interface ModelSearchFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedProviders: string[];
  onProvidersChange: (providers: string[]) => void;
  selectedPublishers?: string[];
  onPublishersChange?: (publishers: string[]) => void;
  selectedType: string;
  onTypeChange: (type: string) => void;
  selectedCategories?: string[];
  onCategoriesChange?: (categories: string[]) => void;
  selectedInputFormats?: string[];
  onInputFormatsChange?: (formats: string[]) => void;
  selectedOutputFormats?: string[];
  onOutputFormatsChange?: (formats: string[]) => void;
  minContextSize?: number;
  onMinContextSizeChange: (value: number | undefined) => void;
  maxContextSize?: number;
  onMaxContextSizeChange: (value: number | undefined) => void;
  contextSizeRange?: { min: number; max: number };
  minInputCost?: number;
  onMinInputCostChange: (value: number | undefined) => void;
  maxInputCost?: number;
  onMaxInputCostChange: (value: number | undefined) => void;
  minOutputCost?: number;
  onMinOutputCostChange?: (value: number | undefined) => void;
  maxOutputCost?: number;
  onMaxOutputCostChange?: (value: number | undefined) => void;
  inputCostRange?: { min: number; max: number };
  outputCostRange?: { min: number; max: number };
  cachingEnabled?: boolean;
  onCachingEnabledChange?: (value: boolean | undefined) => void;
  viewMode?: 'grid' | 'table';
  onViewModeChange?: (value: 'grid' | 'table') => void;
  providers: string[];
  publishers?: string[];
  types: string[];
  categories?: string[];
  inputFormats?: string[];
  outputFormats?: string[];
  resultsCount: number;
  totalCount?: number;
}

export const ModelSearchFilters: React.FC<ModelSearchFiltersProps> = ({
  searchTerm,
  onSearchChange,
  selectedProviders,
  onProvidersChange,
  selectedPublishers = [],
  onPublishersChange,
  selectedType,
  onTypeChange,
  selectedCategories = [],
  onCategoriesChange,
  selectedInputFormats = [],
  onInputFormatsChange,
  selectedOutputFormats = [],
  onOutputFormatsChange,
  minContextSize,
  onMinContextSizeChange,
  maxContextSize,
  onMaxContextSizeChange,
  contextSizeRange = { min: 0, max: 2000000 },
  minInputCost,
  onMinInputCostChange,
  maxInputCost,
  onMaxInputCostChange,
  minOutputCost,
  onMinOutputCostChange,
  maxOutputCost,
  onMaxOutputCostChange,
  inputCostRange = { min: 0, max: 100 },
  outputCostRange = { min: 0, max: 100 },
  cachingEnabled,
  onCachingEnabledChange,
  viewMode,
  onViewModeChange,
  providers,
  publishers = [],
  types,
  categories = [],
  inputFormats = [],
  outputFormats = [],
  resultsCount,
  totalCount,
}) => {
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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
    onPublishersChange?.([]);
    onTypeChange('all');
    onCategoriesChange?.([]);
    onInputFormatsChange?.([]);
    onOutputFormatsChange?.([]);
    onMinContextSizeChange(undefined);
    onMaxContextSizeChange(undefined);
    onMinInputCostChange(undefined);
    onMaxInputCostChange(undefined);
    onMinOutputCostChange?.(undefined);
    onMaxOutputCostChange?.(undefined);
    onCachingEnabledChange?.(undefined);
  };

  const hasActiveFilters = selectedProviders.length > 0 ||
    selectedPublishers.length > 0 ||
    selectedType !== 'all' ||
    selectedCategories.length > 0 ||
    selectedInputFormats.length > 0 ||
    selectedOutputFormats.length > 0 ||
    minContextSize !== undefined ||
    maxContextSize !== undefined ||
    minInputCost !== undefined ||
    maxInputCost !== undefined ||
    minOutputCost !== undefined ||
    maxOutputCost !== undefined ||
    cachingEnabled !== undefined ||
    searchTerm;

  const formatContextSize = (num: number): string => {
    if (num >= 1048576) {
      return `${(num / 1048576).toFixed(1)}M`;
    } else if (num >= 1024) {
      return `${Math.round(num / 1024)}K`;
    }
    return num.toString();
  };

  return (
    <>
      <div className="w-full space-y-3">
        {/* Search Bar - Minimalist with bottom border only */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search models..."
            value={localSearchTerm}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-4 py-3 bg-transparent text-white placeholder-zinc-600
              border-b border-zinc-800 focus:border-zinc-600
              focus:outline-none transition-colors duration-200"
          />
        </div>

        {/* Desktop Filter Controls - Hidden on mobile */}
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          {/* Publisher Filter - Only show if more than 1 publisher */}
          {publishers.length > 1 && onPublishersChange && (
            <PublisherFilter
              publishers={publishers}
              selectedPublishers={selectedPublishers}
              setSelectedPublishers={onPublishersChange}
            />
          )}

          {/* Provider Filter - Only show if more than 1 provider */}
          {providers.length > 1 && (
            <ProviderFilter
              providers={providers}
              selectedProviders={selectedProviders}
              setSelectedProviders={onProvidersChange}
            />
          )}

          {/* Type Filter */}
          <TypeFilter
            modelTypes={types}
            selectedType={selectedType}
            setSelectedType={onTypeChange}
          />

          {/* Category Filter - Only show if there are categories */}
          {categories.length > 0 && onCategoriesChange && (
            <CategoryFilter
              categories={categories}
              selectedCategories={selectedCategories}
              setSelectedCategories={onCategoriesChange}
            />
          )}

          {/* Input Formats Dropdown */}
          {inputFormats.length > 0 && onInputFormatsChange && (
            <FormatDropdown
              label="Input Formats"
              placeholder="Search input formats..."
              formats={inputFormats}
              selectedFormats={selectedInputFormats}
              setSelectedFormats={onInputFormatsChange}
            />
          )}

          {/* Output Formats Dropdown */}
          {outputFormats.length > 0 && onOutputFormatsChange && (
            <FormatDropdown
              label="Output Formats"
              placeholder="Search output formats..."
              formats={outputFormats}
              selectedFormats={selectedOutputFormats}
              setSelectedFormats={onOutputFormatsChange}
            />
          )}

          {/* Context Size Filter */}
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

          {/* Combined Cost Filter */}
          {onMinOutputCostChange && onMaxOutputCostChange && (
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
          {onCachingEnabledChange && (
            <CachingFilter
              cachingEnabled={cachingEnabled}
              setCachingEnabled={onCachingEnabledChange}
            />
          )}

          {/* View Mode Toggle - Only show if props are provided */}
          {viewMode && onViewModeChange && (
            <div className="flex gap-1 ml-auto">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  viewMode === 'grid'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewModeChange('table')}
                className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  viewMode === 'table'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Active Filters & Results - Minimal style */}
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
                  {selectedPublishers.map(publisher => (
                    <div key={publisher} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>publisher:</span>
                      <span className="text-zinc-300 font-bold">{publisher}</span>
                      <button
                        onClick={() => onPublishersChange?.(selectedPublishers.filter(p => p !== publisher))}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  ))}
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
                  {selectedType !== 'all' && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>type:</span>
                      <span className="text-zinc-300 font-bold">{getModelTypeDisplayName(selectedType)}</span>
                      <button
                        onClick={() => onTypeChange('all')}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {selectedCategories.map(category => (
                    <div key={category} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>category:</span>
                      <span className="text-zinc-300 font-bold">{category}</span>
                      <button
                        onClick={() => onCategoriesChange?.(selectedCategories.filter(c => c !== category))}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {selectedInputFormats.map(format => (
                    <div key={format} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>input:</span>
                      <span className="text-zinc-300 font-bold">{format}</span>
                      <button
                        onClick={() => onInputFormatsChange?.(selectedInputFormats.filter(f => f !== format))}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {selectedOutputFormats.map(format => (
                    <div key={format} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>output:</span>
                      <span className="text-zinc-300 font-bold">{format}</span>
                      <button
                        onClick={() => onOutputFormatsChange?.(selectedOutputFormats.filter(f => f !== format))}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {(minContextSize !== undefined || maxContextSize !== undefined) && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>context:</span>
                      <span className="text-zinc-300 font-bold">
                        {minContextSize ? formatContextSize(minContextSize) : '0'} - {maxContextSize ? formatContextSize(maxContextSize) : '∞'}
                      </span>
                      <button
                        onClick={() => {
                          onMinContextSizeChange(undefined);
                          onMaxContextSizeChange(undefined);
                        }}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {(minInputCost !== undefined || maxInputCost !== undefined) && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>input cost:</span>
                      <span className="text-zinc-300 font-bold">
                        {minInputCost !== undefined && maxInputCost !== undefined ?
                          `$${minInputCost.toFixed(2)}-$${maxInputCost.toFixed(2)}` :
                          minInputCost !== undefined ? `≥$${minInputCost.toFixed(2)}` :
                          `≤$${maxInputCost?.toFixed(2)}`}
                      </span>
                      <button
                        onClick={() => {
                          onMinInputCostChange(undefined);
                          onMaxInputCostChange(undefined);
                        }}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {(minOutputCost !== undefined || maxOutputCost !== undefined) && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>output cost:</span>
                      <span className="text-zinc-300 font-bold">
                        {minOutputCost !== undefined && maxOutputCost !== undefined ?
                          `$${minOutputCost.toFixed(2)}-$${maxOutputCost.toFixed(2)}` :
                          minOutputCost !== undefined ? `≥$${minOutputCost.toFixed(2)}` :
                          `≤$${maxOutputCost?.toFixed(2)}`}
                      </span>
                      <button
                        onClick={() => {
                          onMinOutputCostChange?.(undefined);
                          onMaxOutputCostChange?.(undefined);
                        }}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {cachingEnabled !== undefined && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-xs">
                      <span>caching:</span>
                      <span className="text-zinc-300 font-bold">{cachingEnabled ? 'enabled' : 'disabled'}</span>
                      <button
                        onClick={() => onCachingEnabledChange?.(undefined)}
                        className="ml-1 hover:text-zinc-200"
                      >
                        ×
                      </button>
                    </div>
                  )}
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

          {/* Results Count - Minimal */}
          <div className="text-xs text-zinc-500">
            <span className="text-zinc-300 font-medium">{resultsCount}</span>
            <span> / {totalCount || resultsCount} models</span>
          </div>
        </div>
      </div>

      {/* Sticky Mobile Filter Button */}
      <div className="sm:hidden fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="flex items-center gap-2 px-4 py-3 bg-zinc-900 text-white rounded-full shadow-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
        >
          <Filter className="w-5 h-5" />
          <span className="font-medium">Filters</span>
          {hasActiveFilters && (
            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {selectedProviders.length + selectedPublishers.length +
               (selectedType !== 'all' ? 1 : 0) + selectedCategories.length +
               selectedInputFormats.length + selectedOutputFormats.length +
               (minContextSize || maxContextSize ? 1 : 0) +
               (cachingEnabled !== undefined ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Mobile Filter Modal/Sheet */}
      <AnimatePresence>
        {showMobileFilters && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileFilters(false)}
              className="sm:hidden fixed inset-0 bg-black/50 z-[60]"
            />

            {/* Filter Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="sm:hidden fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl z-[70] max-h-[80vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Filters</h3>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Filter Controls */}
              <div className="p-4 space-y-4">
                {/* Publishers */}
                {publishers.length > 0 && onPublishersChange && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Publishers</label>
                    <select
                      value={selectedPublishers.length === 1 ? selectedPublishers[0] : (selectedPublishers.length > 0 ? 'multiple' : 'all')}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'all') {
                          onPublishersChange([]);
                        } else if (value !== 'multiple') {
                          onPublishersChange([value]);
                        }
                      }}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
                    >
                      <option value="all">All Publishers</option>
                      {publishers.map(pub => (
                        <option key={pub} value={pub}>{pub}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Providers */}
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Providers</label>
                  <select
                    value={selectedProviders.length === 1 ? selectedProviders[0] : (selectedProviders.length > 0 ? 'multiple' : 'all')}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'all') {
                        onProvidersChange([]);
                      } else if (value !== 'multiple') {
                        onProvidersChange([value]);
                      }
                    }}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
                  >
                    <option value="all">All Providers</option>
                    {providers.map(prov => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                </div>

                {/* Type */}
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">Model Type</label>
                  <select
                    value={selectedType}
                    onChange={(e) => onTypeChange(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
                  >
                    <option value="all">All Types</option>
                    {types.map(type => (
                      <option key={type} value={type}>{getModelTypeDisplayName(type)}</option>
                    ))}
                  </select>
                </div>

                {/* Caching Toggle */}
                {onCachingEnabledChange && (
                  <label className="flex items-center justify-between px-3 py-3 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer">
                    <span className="text-sm text-white">Caching Enabled</span>
                    <select
                      value={cachingEnabled === true ? 'enabled' : cachingEnabled === false ? 'disabled' : 'all'}
                      onChange={(e) => {
                        const value = e.target.value;
                        onCachingEnabledChange(value === 'enabled' ? true : value === 'disabled' ? false : undefined);
                      }}
                      className="text-sm bg-zinc-700 text-white border border-zinc-600 rounded px-2 py-1 focus:ring-green-500"
                    >
                      <option value="all">All</option>
                      <option value="enabled">Yes</option>
                      <option value="disabled">No</option>
                    </select>
                  </label>
                )}

                {/* View Mode - Only show if props are provided */}
                {viewMode && onViewModeChange && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">View Mode</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onViewModeChange('grid')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          viewMode === 'grid'
                            ? 'bg-zinc-700 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        <Grid3X3 className="w-4 h-4 mx-auto mb-1" />
                        Grid
                      </button>
                      <button
                        onClick={() => onViewModeChange('table')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          viewMode === 'table'
                            ? 'bg-zinc-700 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        <List className="w-4 h-4 mx-auto mb-1" />
                        Table
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        clearAllFilters();
                        setShowMobileFilters(false);
                      }}
                      className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
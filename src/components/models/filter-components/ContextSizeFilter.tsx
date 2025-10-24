import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatContextSize } from '@/utils/format';

interface ContextSizeFilterProps {
  minValue?: number;
  maxValue?: number;
  rangeMin: number;
  rangeMax: number;
  onChange: (min?: number, max?: number) => void;
}

export const ContextSizeFilter: React.FC<ContextSizeFilterProps> = ({
  minValue,
  maxValue,
  rangeMin,
  rangeMax,
  onChange
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localMin, setLocalMin] = useState<number | undefined>(minValue);
  const [localMax, setLocalMax] = useState<number | undefined>(maxValue);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update local values when props change
  useEffect(() => {
    setLocalMin(minValue);
    setLocalMax(maxValue);
  }, [minValue, maxValue]);

  const getButtonLabel = () => {
    if (minValue === undefined && maxValue === undefined) {
      return 'Context Size';
    }
    
    const minText = minValue ? formatContextSize(minValue, true) : '0';
    const maxText = maxValue ? formatContextSize(maxValue, true) : '∞';
    
    return `${minText} - ${maxText}`;
  };

  const applyFilter = () => {
    onChange(localMin, localMax);
    setShowDropdown(false);
  };

  const clearFilter = () => {
    setLocalMin(undefined);
    setLocalMax(undefined);
    onChange(undefined, undefined);
    setShowDropdown(false);
  };

  const hasActiveFilter = minValue !== undefined || maxValue !== undefined;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-full
          transition-all duration-200 cursor-pointer font-medium ${
          hasActiveFilter
            ? 'text-white bg-zinc-800/50'
            : 'text-muted-foreground hover:text-white hover:bg-zinc-800/50'
        }`}
      >
        <span>{getButtonLabel()}</span>
        {hasActiveFilter && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              clearFilter();
            }}
            className="ml-1 p-0.5 hover:bg-zinc-700 rounded-full cursor-pointer inline-flex"
          >
            <X className="w-3 h-3" />
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${
          showDropdown ? 'rotate-180' : ''
        }`} />
      </button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[300px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl max-w-[calc(100vw-2rem)]"
            style={{ zIndex: 100 }}
          >
            <div className="p-4 space-y-4">
              <div className="text-sm font-medium text-white">Context Size Range</div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Minimum</label>
                  <input
                    type="number"
                    value={localMin || ''}
                    onChange={(e) => setLocalMin(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="0"
                    min={rangeMin}
                    max={rangeMax}
                    className="w-full px-3 py-2 bg-zinc-800/50 text-white text-sm rounded
                      border border-zinc-700/50 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Maximum</label>
                  <input
                    type="number"
                    value={localMax || ''}
                    onChange={(e) => setLocalMax(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="∞"
                    min={rangeMin}
                    max={rangeMax}
                    className="w-full px-3 py-2 bg-zinc-800/50 text-white text-sm rounded
                      border border-zinc-700/50 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                Available range: {formatContextSize(rangeMin, true)} - {formatContextSize(rangeMax, true)}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={applyFilter}
                  className="flex-1 px-3 py-2 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={clearFilter}
                  className="px-3 py-2 text-zinc-400 text-sm rounded hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

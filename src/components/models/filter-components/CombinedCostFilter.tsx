import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatMoney } from '@/utils/format';

interface CombinedCostFilterProps {
  minInputCost?: number;
  setMinInputCost: (value?: number) => void;
  maxInputCost?: number;
  setMaxInputCost: (value?: number) => void;
  minOutputCost?: number;
  setMinOutputCost: (value?: number) => void;
  maxOutputCost?: number;
  setMaxOutputCost: (value?: number) => void;
  inputCostRange: { min: number; max: number };
  outputCostRange: { min: number; max: number };
}

export const CombinedCostFilter: React.FC<CombinedCostFilterProps> = ({
  minInputCost,
  setMinInputCost,
  maxInputCost,
  setMaxInputCost,
  minOutputCost,
  setMinOutputCost,
  maxOutputCost,
  setMaxOutputCost,
  inputCostRange,
  outputCostRange
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [localMinInput, setLocalMinInput] = useState<number | undefined>(minInputCost);
  const [localMaxInput, setLocalMaxInput] = useState<number | undefined>(maxInputCost);
  const [localMinOutput, setLocalMinOutput] = useState<number | undefined>(minOutputCost);
  const [localMaxOutput, setLocalMaxOutput] = useState<number | undefined>(maxOutputCost);
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
    setLocalMinInput(minInputCost);
    setLocalMaxInput(maxInputCost);
    setLocalMinOutput(minOutputCost);
    setLocalMaxOutput(maxOutputCost);
  }, [minInputCost, maxInputCost, minOutputCost, maxOutputCost]);

  const getButtonLabel = () => {
    const hasInputFilter = minInputCost !== undefined || maxInputCost !== undefined;
    const hasOutputFilter = minOutputCost !== undefined || maxOutputCost !== undefined;
    
    if (!hasInputFilter && !hasOutputFilter) {
      return 'Cost';
    }
    
    if (hasInputFilter && hasOutputFilter) {
      return 'Input & Output Cost';
    }
    
    if (hasInputFilter) {
      return 'Input Cost';
    }
    
    return 'Output Cost';
  };

  const applyFilter = () => {
    setMinInputCost(localMinInput);
    setMaxInputCost(localMaxInput);
    setMinOutputCost(localMinOutput);
    setMaxOutputCost(localMaxOutput);
    setShowDropdown(false);
  };

  const clearFilter = () => {
    setLocalMinInput(undefined);
    setLocalMaxInput(undefined);
    setLocalMinOutput(undefined);
    setLocalMaxOutput(undefined);
    setMinInputCost(undefined);
    setMaxInputCost(undefined);
    setMinOutputCost(undefined);
    setMaxOutputCost(undefined);
    setShowDropdown(false);
  };

  const hasActiveFilter = minInputCost !== undefined || maxInputCost !== undefined ||
                         minOutputCost !== undefined || maxOutputCost !== undefined;

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
        <DollarSign className="w-3.5 h-3.5" />
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
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[350px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl max-w-[calc(100vw-2rem)]"
            style={{ zIndex: 100 }}
          >
            <div className="p-4 space-y-4">
              <div className="text-sm font-medium text-white">Cost Range (per 1M tokens)</div>
              
              {/* Input Cost */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-zinc-300">Input Cost</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Min</label>
                    <input
                      type="number"
                      step="0.001"
                      value={localMinInput || ''}
                      onChange={(e) => setLocalMinInput(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      min={inputCostRange.min}
                      max={inputCostRange.max}
                      className="w-full px-3 py-2 bg-zinc-800/50 text-white text-sm rounded
                        border border-zinc-700/50 focus:border-zinc-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Max</label>
                    <input
                      type="number"
                      step="0.001"
                      value={localMaxInput || ''}
                      onChange={(e) => setLocalMaxInput(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="∞"
                      min={inputCostRange.min}
                      max={inputCostRange.max}
                      className="w-full px-3 py-2 bg-zinc-800/50 text-white text-sm rounded
                        border border-zinc-700/50 focus:border-zinc-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  Range: {formatMoney(inputCostRange.min)} - {formatMoney(inputCostRange.max)}
                </div>
              </div>

              {/* Output Cost */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-zinc-300">Output Cost</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Min</label>
                    <input
                      type="number"
                      step="0.001"
                      value={localMinOutput || ''}
                      onChange={(e) => setLocalMinOutput(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="0"
                      min={outputCostRange.min}
                      max={outputCostRange.max}
                      className="w-full px-3 py-2 bg-zinc-800/50 text-white text-sm rounded
                        border border-zinc-700/50 focus:border-zinc-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Max</label>
                    <input
                      type="number"
                      step="0.001"
                      value={localMaxOutput || ''}
                      onChange={(e) => setLocalMaxOutput(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="∞"
                      min={outputCostRange.min}
                      max={outputCostRange.max}
                      className="w-full px-3 py-2 bg-zinc-800/50 text-white text-sm rounded
                        border border-zinc-700/50 focus:border-zinc-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  Range: {formatMoney(outputCostRange.min)} - {formatMoney(outputCostRange.max)}
                </div>
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
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  outputCostRange,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Local state for cost dropdown
  const [localMinInputCost, setLocalMinInputCost] = useState<string>(minInputCost?.toString() || '');
  const [localMaxInputCost, setLocalMaxInputCost] = useState<string>(maxInputCost?.toString() || '');
  const [localMinOutputCost, setLocalMinOutputCost] = useState<string>(minOutputCost?.toString() || '');
  const [localMaxOutputCost, setLocalMaxOutputCost] = useState<string>(maxOutputCost?.toString() || '');

  // Update local cost state when dropdown opens
  useEffect(() => {
    if (showDropdown) {
      setLocalMinInputCost(minInputCost?.toString() || '');
      setLocalMaxInputCost(maxInputCost?.toString() || '');
      setLocalMinOutputCost(minOutputCost?.toString() || '');
      setLocalMaxOutputCost(maxOutputCost?.toString() || '');
    }
  }, [showDropdown, minInputCost, maxInputCost, minOutputCost, maxOutputCost]);

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

  const hasFilters = minInputCost !== undefined || maxInputCost !== undefined ||
                     minOutputCost !== undefined || maxOutputCost !== undefined;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-2 px-3 py-2 text-sm
          ${hasFilters ? 'text-white bg-zinc-800' : 'text-zinc-400'}
          hover:text-white hover:bg-zinc-800/50 rounded-full
          transition-all duration-200 cursor-pointer font-medium`}
      >
        <DollarSign className="w-3.5 h-3.5" />
        <span>{hasFilters ? 'Cost Filtered' : 'Cost'}</span>
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
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[400px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl p-4"
            style={{ zIndex: 100 }}
          >
            <div className="space-y-4">
              {/* Input Cost Section */}
              <div>
                <label className="text-xs text-zinc-400 mb-2 block">Input Cost (per 1M tokens)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={localMinInputCost}
                    onChange={(e) => setLocalMinInputCost(e.target.value)}
                    placeholder={`Min ${inputCostRange.min.toFixed(2)}`}
                    className="w-24 h-8 px-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800"
                  />
                  <span className="text-zinc-500 self-center">-</span>
                  <input
                    type="number"
                    step="0.01"
                    value={localMaxInputCost}
                    onChange={(e) => setLocalMaxInputCost(e.target.value)}
                    placeholder={`Max ${inputCostRange.max.toFixed(2)}`}
                    className="w-24 h-8 px-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800"
                  />
                </div>
              </div>

              {/* Output Cost Section */}
              <div>
                <label className="text-xs text-zinc-400 mb-2 block">Output Cost (per 1M tokens)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={localMinOutputCost}
                    onChange={(e) => setLocalMinOutputCost(e.target.value)}
                    placeholder={`Min ${outputCostRange.min.toFixed(2)}`}
                    className="w-24 h-8 px-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800"
                  />
                  <span className="text-zinc-500 self-center">-</span>
                  <input
                    type="number"
                    step="0.01"
                    value={localMaxOutputCost}
                    onChange={(e) => setLocalMaxOutputCost(e.target.value)}
                    placeholder={`Max ${outputCostRange.max.toFixed(2)}`}
                    className="w-24 h-8 px-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {(localMinInputCost || localMaxInputCost || localMinOutputCost || localMaxOutputCost) && (
                  <button
                    onClick={() => {
                      setLocalMinInputCost('');
                      setLocalMaxInputCost('');
                      setLocalMinOutputCost('');
                      setLocalMaxOutputCost('');
                      setMinInputCost(undefined);
                      setMaxInputCost(undefined);
                      setMinOutputCost(undefined);
                      setMaxOutputCost(undefined);
                      setShowDropdown(false);
                    }}
                    className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => {
                    // Apply the local values to the actual filters
                    setMinInputCost(localMinInputCost ? parseFloat(localMinInputCost) : undefined);
                    setMaxInputCost(localMaxInputCost ? parseFloat(localMaxInputCost) : undefined);
                    setMinOutputCost(localMinOutputCost ? parseFloat(localMinOutputCost) : undefined);
                    setMaxOutputCost(localMaxOutputCost ? parseFloat(localMaxOutputCost) : undefined);
                    setShowDropdown(false);
                  }}
                  className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
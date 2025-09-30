import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ContextSizeFilterProps {
  minValue?: number;
  maxValue?: number;
  rangeMin: number;
  rangeMax: number;
  onChange: (min?: number, max?: number) => void;
}

const PRESET_SIZES = [
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
  { label: '200K', value: 200000 },
  { label: '1M', value: 1048576 },
  { label: '2M', value: 2097152 },
];

export const ContextSizeFilter: React.FC<ContextSizeFilterProps> = ({
  minValue,
  maxValue,
  rangeMin,
  rangeMax,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localMin, setLocalMin] = useState<string>(minValue?.toString() || '');
  const [localMax, setLocalMax] = useState<string>(maxValue?.toString() || '');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-size-dropdown')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const formatNumber = (num: number): string => {
    if (num >= 1048576) {
      return `${(num / 1048576).toFixed(1)}M`;
    } else if (num >= 1024) {
      return `${Math.round(num / 1024)}K`;
    }
    return num.toString();
  };

  const handleApply = () => {
    const min = localMin ? parseInt(localMin, 10) : undefined;
    const max = localMax ? parseInt(localMax, 10) : undefined;
    onChange(min, max);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalMin('');
    setLocalMax('');
    onChange(undefined, undefined);
  };

  const handlePresetClick = (value: number, isMin: boolean) => {
    if (isMin) {
      setLocalMin(value.toString());
    } else {
      setLocalMax(value.toString());
    }
  };

  const hasFilter = minValue !== undefined || maxValue !== undefined;
  const filterLabel = hasFilter
    ? `${minValue ? formatNumber(minValue) : '0'} - ${maxValue ? formatNumber(maxValue) : '∞'}`
    : 'Context Size';

  return (
    <div className="relative context-size-dropdown">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400
          hover:text-white hover:bg-zinc-800/50 rounded-full
          transition-all duration-200 cursor-pointer font-medium"
      >
        <span>{filterLabel}</span>
        {hasFilter && (
          <span className="text-xs text-zinc-300 ml-1">(filtered)</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[320px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl max-w-[calc(100vw-2rem)]"
            style={{ zIndex: 100 }}
          >
            <div className="p-3">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-medium text-zinc-400">Filter by Context Size</span>
                {hasFilter && (
                  <button
                    onClick={handleClear}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {/* Min input */}
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Minimum</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={localMin}
                      onChange={(e) => setLocalMin(e.target.value)}
                      placeholder={rangeMin.toString()}
                      className="flex-1 h-8 px-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800"
                    />
                    <div className="flex gap-1 flex-shrink-0">
                      {PRESET_SIZES.filter(p => p.value >= rangeMin && p.value <= rangeMax).slice(0, 2).map(preset => (
                        <button
                          key={preset.label}
                          onClick={() => handlePresetClick(preset.value, true)}
                          className="px-2 h-7 text-xs bg-zinc-800/30 hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 rounded transition-all whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Max input */}
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Maximum</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={localMax}
                      onChange={(e) => setLocalMax(e.target.value)}
                      placeholder={rangeMax.toString()}
                      className="flex-1 h-8 px-2 bg-zinc-800/50 border border-zinc-700/50 rounded text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:bg-zinc-800"
                    />
                    <div className="flex gap-1 flex-shrink-0">
                      {PRESET_SIZES.filter(p => p.value >= rangeMin && p.value <= rangeMax).slice(-2).map(preset => (
                        <button
                          key={preset.label}
                          onClick={() => handlePresetClick(preset.value, false)}
                          className="px-2 h-7 text-xs bg-zinc-800/30 hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 rounded transition-all whitespace-nowrap"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Range info */}
                <div className="text-xs text-zinc-600 pt-2 mt-2 border-t border-zinc-800/50">
                  Available range: {formatNumber(rangeMin)} - {formatNumber(rangeMax)}
                </div>

                {/* Apply button */}
                <button
                  onClick={handleApply}
                  className="w-full h-8 mt-3 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-sm font-medium rounded transition-all"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
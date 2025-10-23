import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CachingFilterProps {
  cachingEnabled?: boolean;
  setCachingEnabled: (value?: boolean) => void;
}

export const CachingFilter: React.FC<CachingFilterProps> = ({
  cachingEnabled,
  setCachingEnabled
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
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

  const getButtonLabel = () => {
    if (cachingEnabled === undefined) {
      return 'Caching';
    }
    return cachingEnabled ? 'Caching Enabled' : 'Caching Disabled';
  };

  const handleOptionClick = (value: boolean | undefined) => {
    setCachingEnabled(value);
    setShowDropdown(false);
  };

  const clearFilter = () => {
    setCachingEnabled(undefined);
    setShowDropdown(false);
  };

  const hasActiveFilter = cachingEnabled !== undefined;

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
        <Database className="w-3.5 h-3.5" />
        <span>{getButtonLabel()}</span>
        {hasActiveFilter && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearFilter();
            }}
            className="ml-1 p-0.5 hover:bg-zinc-700 rounded-full"
          >
            <X className="w-3 h-3" />
          </button>
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
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[200px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl max-w-[calc(100vw-2rem)]"
            style={{ zIndex: 100 }}
          >
            <div className="p-2">
              <div className="text-sm font-medium text-white mb-2">Caching Support</div>
              
              <div className="space-y-1">
                <button
                  onClick={() => handleOptionClick(undefined)}
                  className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                    cachingEnabled === undefined
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  All Models
                </button>
                
                <button
                  onClick={() => handleOptionClick(true)}
                  className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                    cachingEnabled === true
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" />
                    <span>Caching Enabled</span>
                  </div>
                </button>
                
                <button
                  onClick={() => handleOptionClick(false)}
                  className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                    cachingEnabled === false
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-zinc-500" />
                    <span>Caching Disabled</span>
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
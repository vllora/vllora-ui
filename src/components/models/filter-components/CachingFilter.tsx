import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CachingFilterProps {
  cachingEnabled?: boolean;
  setCachingEnabled: (value?: boolean) => void;
}

export const CachingFilter: React.FC<CachingFilterProps> = ({
  cachingEnabled,
  setCachingEnabled,
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-2 px-3 py-2 text-sm
          ${cachingEnabled !== undefined ? 'text-white bg-zinc-800' : 'text-zinc-400'}
          hover:text-white hover:bg-zinc-800/50 rounded-full
          transition-all duration-200 cursor-pointer font-medium`}
      >
        <Database className="w-3.5 h-3.5" />
        <span>
          {cachingEnabled === undefined ? 'Caching' : cachingEnabled ? 'Cached' : 'No Cache'}
        </span>
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
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[200px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl"
            style={{ zIndex: 100 }}
          >
            <button
              onClick={() => {
                setCachingEnabled(undefined);
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-zinc-300">All</span>
              {cachingEnabled === undefined && <Check className="w-4 h-4 text-green-400" />}
            </button>
            <button
              onClick={() => {
                setCachingEnabled(true);
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-zinc-300">With Caching</span>
              {cachingEnabled === true && <Check className="w-4 h-4 text-green-400" />}
            </button>
            <button
              onClick={() => {
                setCachingEnabled(false);
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-zinc-300">Without Caching</span>
              {cachingEnabled === false && <Check className="w-4 h-4 text-green-400" />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
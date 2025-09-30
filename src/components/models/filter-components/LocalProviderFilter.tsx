import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';

interface LocalProviderFilterProps {
  providers: string[];
  selectedProviders: string[];
  setSelectedProviders: (providers: string[]) => void;
}

export const LocalProviderFilter: React.FC<LocalProviderFilterProps> = ({
  providers,
  selectedProviders,
  setSelectedProviders,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter providers based on search
  const filteredProviders = useMemo(() => {
    if (!searchTerm) return providers;
    const searchLower = searchTerm.toLowerCase();
    return providers.filter(prov => prov.toLowerCase().includes(searchLower));
  }, [providers, searchTerm]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setSearchTerm('');
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
          ${selectedProviders.length > 0 ? 'text-white bg-zinc-800' : 'text-zinc-400'}
          hover:text-white hover:bg-zinc-800/50 rounded-full
          transition-all duration-200 cursor-pointer font-medium`}
      >
        {selectedProviders.length === 1 && (
          <div className="p-0.5 rounded bg-zinc-800/30">
            <ProviderIcon
              provider_name={selectedProviders[0]}
              className="w-3.5 h-3.5"
            />
          </div>
        )}
        <span>
          {selectedProviders.length === 0
            ? 'Providers'
            : selectedProviders.length === 1
            ? selectedProviders[0]
            : `${selectedProviders.length} Providers`
          }
        </span>
        {selectedProviders.length > 0 && (
          <span className="text-xs text-zinc-300 ml-1">({selectedProviders.length})</span>
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
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[250px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl max-w-[calc(100vw-2rem)]"
            style={{ zIndex: 100 }}
          >
            {/* Search Input */}
            <div className="p-2 border-b border-zinc-700/50">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search providers..."
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-800/50 text-white text-sm rounded
                    border border-zinc-700/50 focus:border-theme-500/50 focus:outline-none focus:ring-2 focus:ring-theme-500/20
                    placeholder-zinc-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* All Providers Option */}
            <button
              onClick={() => {
                setSelectedProviders([]);
                setSearchTerm('');
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-zinc-300">All Providers</span>
              {selectedProviders.length === 0 && <Check className="w-4 h-4 text-theme-400" />}
            </button>

            {/* Provider List */}
            <div className="border-t border-zinc-700/50 max-h-48 overflow-y-auto">
              {filteredProviders.length > 0 ? (
                filteredProviders.map(provider => (
                  <button
                    key={provider}
                    onClick={() => {
                      if (selectedProviders.includes(provider)) {
                        setSelectedProviders(selectedProviders.filter(p => p !== provider));
                      } else {
                        setSelectedProviders([...selectedProviders, provider]);
                      }
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-zinc-800/30 group-hover:bg-zinc-700/50 transition-colors">
                        <ProviderIcon
                          provider_name={provider}
                          className="w-4 h-4"
                        />
                      </div>
                      <span className="text-zinc-300">{provider}</span>
                    </div>
                    {selectedProviders.includes(provider) && <Check className="w-4 h-4 text-theme-400" />}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-sm text-zinc-500">
                  No providers found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';

interface OwnerFilterProps {
  owners: string[];
  selectedOwners: string[];
  setSelectedOwners: (owners: string[]) => void;
}

export const OwnerFilter: React.FC<OwnerFilterProps> = ({
  owners,
  selectedOwners,
  setSelectedOwners,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter owners based on search
  const filteredOwners = useMemo(() => {
    if (!searchTerm) return owners;
    const searchLower = searchTerm.toLowerCase();
    return owners.filter(owner => owner.toLowerCase().includes(searchLower));
  }, [owners, searchTerm]);

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
          ${selectedOwners.length > 0 ? 'text-white bg-zinc-800' : 'text-zinc-400'}
          hover:text-white hover:bg-zinc-800/50 rounded-full
          transition-all duration-200 cursor-pointer font-medium`}
      >
        {selectedOwners.length === 1 && (
          <ProviderIcon provider_name={selectedOwners[0]} className="w-3.5 h-3.5" />
        )}
        <span>
          {selectedOwners.length === 0
            ? 'Publisher'
            : selectedOwners.length === 1
            ? selectedOwners[0]
            : `${selectedOwners.length} Publishers`
          }
        </span>
        {selectedOwners.length > 0 && (
          <span className="text-xs text-zinc-300 ml-1">({selectedOwners.length})</span>
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
                  placeholder="Search publishers..."
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-800/50 text-white text-sm rounded
                    border border-zinc-700/50 focus:border-[rgba(var(--theme-500),0.5)] focus:outline-none focus:ring-2 focus:ring-theme-500/20
                    placeholder-zinc-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* All Publishers Option */}
            <button
              onClick={() => {
                setSelectedOwners([]);
                setSearchTerm('');
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-zinc-300">All Publishers</span>
              {selectedOwners.length === 0 && <Check className="w-4 h-4 text-[rgb(var(--theme-400))]" />}
            </button>

            {/* Publisher List */}
            <div className="border-t border-zinc-700/50 max-h-48 overflow-y-auto">
              {filteredOwners.length > 0 ? (
                filteredOwners.map(owner => (
                  <button
                    key={owner}
                    onClick={() => {
                      if (selectedOwners.includes(owner)) {
                        setSelectedOwners(selectedOwners.filter(o => o !== owner));
                      } else {
                        setSelectedOwners([...selectedOwners, owner]);
                      }
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider_name={owner} className="w-5 h-5" />
                      <span className="text-zinc-300">{owner}</span>
                    </div>
                    {selectedOwners.includes(owner) && <Check className="w-4 h-4 text-[rgb(var(--theme-400))]" />}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-sm text-zinc-500">
                  No publishers found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
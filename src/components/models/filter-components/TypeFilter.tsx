import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getModelTypeDisplayName } from '@/utils/modelUtils';

interface TypeFilterProps {
  modelTypes: string[];
  selectedType: string;
  setSelectedType: (type: string) => void;
}

export const TypeFilter: React.FC<TypeFilterProps> = ({
  modelTypes,
  selectedType,
  setSelectedType,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter types based on search
  const filteredTypes = React.useMemo(() => {
    if (!searchTerm) return modelTypes;
    const searchLower = searchTerm.toLowerCase();
    return modelTypes.filter(type => type.toLowerCase().includes(searchLower));
  }, [modelTypes, searchTerm]);

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
        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400
          hover:text-white hover:bg-zinc-800/50 rounded-full
          transition-all duration-200 cursor-pointer font-medium"
      >
        <span>
          {selectedType === 'all' ? 'All Types' : getModelTypeDisplayName(selectedType)}
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
                  placeholder="Search types..."
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-800/50 text-white text-sm rounded
                    border border-zinc-700/50 focus:border-zinc-600 focus:outline-none
                    placeholder-zinc-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* All Types Option */}
            <button
              onClick={() => {
                setSelectedType('all');
                setSearchTerm('');
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-zinc-300">All Types</span>
              {selectedType === 'all' && <Check className="w-4 h-4 text-green-400" />}
            </button>

            {/* Type List */}
            <div className="border-t border-zinc-700/50 max-h-48 overflow-y-auto">
              {filteredTypes.length > 0 ? (
                filteredTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type);
                      setSearchTerm('');
                      setShowDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
                  >
                    <span className="text-zinc-300">{getModelTypeDisplayName(type)}</span>
                    {selectedType === type && <Check className="w-4 h-4 text-green-400" />}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-sm text-zinc-500">
                  No types found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
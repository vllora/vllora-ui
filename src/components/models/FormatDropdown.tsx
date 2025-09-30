import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FormatDropdownProps {
  label: string;
  placeholder: string;
  formats: string[];
  selectedFormats: string[];
  setSelectedFormats: (value: string[]) => void;
}

export const FormatDropdown: React.FC<FormatDropdownProps> = ({
  label,
  placeholder,
  formats,
  selectedFormats,
  setSelectedFormats
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter formats based on search
  const filteredFormats = useMemo(() => {
    if (!searchTerm) return formats;
    const searchLower = searchTerm.toLowerCase();
    return formats.filter(format => format.toLowerCase().includes(searchLower));
  }, [formats, searchTerm]);

  // Click outside handler
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

  const getButtonLabel = () => {
    if (selectedFormats.length === 0) return label;
    if (selectedFormats.length === 1) return selectedFormats[0];
    return `${selectedFormats.length} ${label}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400
          hover:text-white hover:bg-zinc-800/50 rounded-full
          transition-all duration-200 cursor-pointer font-medium"
      >
        <span>{getButtonLabel()}</span>
        {selectedFormats.length > 0 && (
          <span className="text-xs text-zinc-300 ml-1">({selectedFormats.length})</span>
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
                  placeholder={placeholder}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-800/50 text-white text-sm rounded
                    border border-zinc-700/50 focus:border-zinc-600 focus:outline-none
                    placeholder-zinc-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* All Formats Option */}
            <button
              onClick={() => {
                setSelectedFormats([]);
                setSearchTerm('');
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-zinc-300">All {label}</span>
              {selectedFormats.length === 0 && <Check className="w-4 h-4 text-green-400" />}
            </button>

            {/* Formats List */}
            <div className="border-t border-zinc-700/50 max-h-48 overflow-y-auto">
              {filteredFormats.length > 0 ? (
                filteredFormats.map(format => (
                  <button
                    key={format}
                    onClick={() => {
                      if (selectedFormats.includes(format)) {
                        setSelectedFormats(selectedFormats.filter(f => f !== format));
                      } else {
                        setSelectedFormats([...selectedFormats, format]);
                      }
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors flex items-center justify-between group"
                  >
                    <span className="text-zinc-300 font-mono text-xs">{format}</span>
                    {selectedFormats.includes(format) && <Check className="w-4 h-4 text-green-400" />}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-sm text-zinc-500">
                  No formats found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
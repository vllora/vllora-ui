import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FormatDropdownProps {
  label: string;
  placeholder: string;
  formats: string[];
  selectedFormats: string[];
  setSelectedFormats: (formats: string[]) => void;
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

  const filteredFormats = formats.filter(format =>
    format.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getButtonLabel = () => {
    if (selectedFormats.length === 0) {
      return label;
    }
    return `${selectedFormats.length} ${label}`;
  };

  const toggleFormat = (format: string) => {
    if (selectedFormats.includes(format)) {
      setSelectedFormats(selectedFormats.filter(f => f !== format));
    } else {
      setSelectedFormats([...selectedFormats, format]);
    }
  };

  const clearAll = () => {
    setSelectedFormats([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground
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
                if (selectedFormats.length === formats.length) {
                  clearAll();
                } else {
                  setSelectedFormats([...formats]);
                }
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors border-b border-zinc-700/30"
            >
              {selectedFormats.length === formats.length ? 'Deselect All' : 'Select All'}
            </button>

            {/* Formats List */}
            <div className="max-h-60 overflow-y-auto">
              {filteredFormats.length === 0 ? (
                <div className="px-3 py-2 text-sm text-zinc-500">No formats found</div>
              ) : (
                filteredFormats.map((format) => (
                  <button
                    key={format}
                    onClick={() => toggleFormat(format)}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors flex items-center gap-2"
                  >
                    <div className={`w-4 h-4 rounded border border-zinc-600 flex items-center justify-center ${
                      selectedFormats.includes(format) ? 'bg-zinc-600' : ''
                    }`}>
                      {selectedFormats.includes(format) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <span className="truncate">{format}</span>
                  </button>
                ))
              )}
            </div>

            {/* Clear Selection */}
            {selectedFormats.length > 0 && (
              <div className="p-2 border-t border-zinc-700/50">
                <button
                  onClick={() => {
                    clearAll();
                    setShowDropdown(false);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

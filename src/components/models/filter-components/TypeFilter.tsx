import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TypeFilterProps {
  selectedType: string;
  setSelectedType: (type: string) => void;
  types: string[];
}

export const TypeFilter: React.FC<TypeFilterProps> = ({
  selectedType,
  setSelectedType,
  types
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
    if (selectedType === 'all') {
      return 'All Types';
    }
    return selectedType;
  };

  const handleTypeClick = (type: string) => {
    setSelectedType(type);
    setShowDropdown(false);
  };

  const clearFilter = () => {
    setSelectedType('all');
    setShowDropdown(false);
  };

  const hasActiveFilter = selectedType !== 'all';

  const getTypeDisplayName = (type: string) => {
    switch (type) {
      case 'text':
        return 'Text Generation';
      case 'image_generation':
        return 'Image Generation';
      case 'embedding':
        return 'Embeddings';
      case 'audio':
        return 'Audio';
      case 'video':
        return 'Video';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

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
            className="absolute z-[100] mt-2 left-0 right-4 sm:left-auto sm:right-auto sm:w-auto sm:min-w-[200px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl max-w-[calc(100vw-2rem)]"
            style={{ zIndex: 100 }}
          >
            <div className="p-2">
              <div className="text-sm font-medium text-white mb-2">Model Type</div>
              
              <div className="space-y-1">
                <button
                  onClick={() => handleTypeClick('all')}
                  className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                    selectedType === 'all'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  All Types
                </button>
                
                {types.map((type) => (
                  <button
                    key={type}
                    onClick={() => handleTypeClick(type)}
                    className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                      selectedType === type
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    {getTypeDisplayName(type)}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
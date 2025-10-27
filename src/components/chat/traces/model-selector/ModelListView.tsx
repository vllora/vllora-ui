import React, { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface ModelListViewProps {
  modelNames: string[];
  onModelNameSelect: (modelName: string) => void;
  getProviderCount: (modelName: string) => number;
}

export const ModelListView: React.FC<ModelListViewProps> = ({
  modelNames,
  onModelNameSelect,
  getProviderCount,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredModelNames = useMemo(() => {
    if (!searchTerm) return modelNames;
    return modelNames.filter((modelName) =>
      modelName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [modelNames, searchTerm]);

  return (
    <>
      {/* Search Input */}
      <div className="p-3 border-b border-border">
        <input
          type="text"
          placeholder="Search models..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-background text-foreground placeholder-muted-foreground px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring border border-input"
          autoFocus
        />
      </div>

      {/* Content Area */}
      <div className="max-h-80 overflow-y-auto">
        {filteredModelNames.length > 0 ? (
          filteredModelNames.map((modelName) => {
            const providerCount = getProviderCount(modelName);
            return (
              <DropdownMenuItem
                key={modelName}
                onSelect={(e) => {
                  e.preventDefault();
                  onModelNameSelect(modelName);
                }}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-popover-foreground truncate">
                    {modelName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {providerCount} {providerCount === 1 ? 'provider' : 'providers'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </DropdownMenuItem>
            );
          })
        ) : (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            No models found
          </div>
        )}
      </div>
    </>
  );
};

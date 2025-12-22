import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronRight, Sparkles, Plus } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { VirtualModelOption } from './index';

interface ModelListViewProps {
  modelNames: string[];
  onModelNameSelect: (modelName: string) => void;
  getProviderCount: (modelName: string) => number;
  virtualModels?: VirtualModelOption[];
  onAddCustomModel?: () => void;
}

export const ModelListView: React.FC<ModelListViewProps> = ({
  modelNames,
  onModelNameSelect,
  getProviderCount,
  virtualModels,
  onAddCustomModel,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const filteredModelNames = useMemo(() => {
    if (!debouncedSearchTerm) return modelNames;
    return modelNames.filter((modelName) =>
      modelName.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [modelNames, debouncedSearchTerm]);

  const filteredVirtualModels = useMemo(() => {
    if (!virtualModels || !debouncedSearchTerm) return virtualModels || [];
    return virtualModels.filter((vm) =>
      vm.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [virtualModels, debouncedSearchTerm]);

  return (
    <>
      {/* Search Input and Add Custom Button */}
      <div
        className="p-3 border-b border-border"
        onKeyDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onMouseDown={(e) => {
              // Prevent dropdown from closing when clicking input
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              // Prevent dropdown from closing on certain keys
              if (e.key !== 'Escape') {
                e.stopPropagation();
              }
            }}
            className="flex-1 bg-background text-foreground placeholder-muted-foreground px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring border border-input"
            autoFocus
          />
          {onAddCustomModel && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddCustomModel();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="shrink-0 h-[38px]"
            >
              <Plus className="w-4 h-4 mr-1" />
              Custom
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        className="max-h-80 overflow-y-auto"
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Virtual Models Section */}
        {virtualModels && filteredVirtualModels.length > 0 && (
          <>
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
              Virtual Models
            </div>
            {filteredVirtualModels.map((vm) => (
              <DropdownMenuItem
                key={vm.id}
                onSelect={(e) => {
                  e.preventDefault();
                  onModelNameSelect(`langdb/${vm.slug}`);
                }}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-popover-foreground truncate">
                    {vm.name}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* Regular Models Section */}
        {virtualModels && filteredVirtualModels.length > 0 && filteredModelNames.length > 0 && (
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
            Base Models
          </div>
        )}

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
                  {providerCount > 1 && <p className="text-xs text-muted-foreground">
                    {providerCount} {providerCount === 1 ? 'provider' : 'providers'}
                  </p>}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </DropdownMenuItem>
            );
          })
        ) : !virtualModels || filteredVirtualModels.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            No models found
          </div>
        ) : null}
      </div>
    </>
  );
};

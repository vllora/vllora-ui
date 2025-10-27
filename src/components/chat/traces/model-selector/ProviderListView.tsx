import React, { useState, useMemo } from 'react';
import { Settings } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { LocalModel, LocalModelProviderInfo } from '@/types/models';
import { getModelFullName } from '@/utils/model-fullname';

interface ProviderListViewProps {
  providers: LocalModelProviderInfo[];
  selectedModelInfo: LocalModel | undefined;
  selectedModel: string;
  onProviderSelect: (modelFullName: string) => void;
  onConfigureProvider?: (providerName: string) => void;
}

export const ProviderListView: React.FC<ProviderListViewProps> = ({
  providers,
  selectedModelInfo,
  selectedModel,
  onProviderSelect,
  onConfigureProvider,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const filteredProviders = useMemo(() => {
    if (!searchTerm) return providers;
    return providers.filter((ep) =>
      ep.provider.provider.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [providers, searchTerm]);

  return (
    <>
      {/* Search Input */}
      <div className="p-3 border-b border-border">
        <input
          type="text"
          placeholder="Search providers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-background text-foreground placeholder-muted-foreground px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring border border-input"
          autoFocus
        />
      </div>

      {/* Content Area */}
      <div className="max-h-80 overflow-y-auto">
        {filteredProviders.length > 0 ? (
          filteredProviders.map((providerInfo, idx) => {
            const provider = providerInfo.provider;
            const modelFullName = selectedModelInfo
              ? getModelFullName(selectedModelInfo, providerInfo)
              : '';
            const isSelected = modelFullName === selectedModel;
            const isConfigured = providerInfo.available;

            return (
              <DropdownMenuItem
                key={`${provider.provider}-${idx}`}
                onSelect={(e) => {
                  e.preventDefault();
                  if (!selectedModelInfo) {
                    return;
                  }

                  // If not configured, notify parent to open config dialog
                  if (!isConfigured) {
                    onProviderSelect(modelFullName);
                    onConfigureProvider?.(provider.provider);
                    return;
                  }
                  // Otherwise, select the provider
                  onProviderSelect(modelFullName);
                }}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer relative ${
                  isSelected ? 'bg-accent/50' : ''
                } ${!isConfigured ? 'opacity-60' : ''}`}
              >
                <ProviderIcon
                  provider_name={provider.provider}
                  className="w-6 h-6 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-popover-foreground">
                    {provider.provider}
                  </p>
                  {!isConfigured && <p className="text-xs text-muted-foreground truncate">
                    {'Click to configure'}
                  </p>}
                </div>
                {!isConfigured && (
                  <Settings className="w-4 h-4 text-orange-500 flex-shrink-0" />
                )}
              </DropdownMenuItem>
            );
          })
        ) : (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            No providers found
          </div>
        )}
      </div>
    </>
  );
};

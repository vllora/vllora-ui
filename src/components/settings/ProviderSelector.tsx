import { useState, useMemo } from 'react';
import { Plus, Eye, EyeOff, Search, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { type ProviderInfo } from '@/services/providers-api';
import { type CustomInferenceApiType } from '@/services/custom-providers-api';
import { cn } from '@/lib/utils';

const API_TYPES: { value: CustomInferenceApiType; label: string }[] = [
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'gemini', label: 'Google Gemini' },
];

export interface NewProviderFormData {
  name: string;
  endpoint: string;
  apiType: CustomInferenceApiType;
  apiKey: string;
}

interface ProviderSelectorProps {
  providers: ProviderInfo[];
  selectedProvider: string;
  isCreatingNewProvider: boolean;
  newProviderData: NewProviderFormData;
  onProviderChange: (providerName: string) => void;
  onCreateNewClick: () => void;
  onNewProviderDataChange: (data: Partial<NewProviderFormData>) => void;
}

export function ProviderSelector({
  providers,
  selectedProvider,
  isCreatingNewProvider,
  newProviderData,
  onProviderChange,
  onCreateNewClick,
  onNewProviderDataChange,
}: ProviderSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [open, setOpen] = useState(false);

  // Separate providers into configured, available (unconfigured), and custom
  const { configuredProviders, availableProviders, customProviders } = useMemo(() => {
    const configured = providers.filter(p => p.has_credentials && !p.is_custom && !p.custom_endpoint);
    const available = providers.filter(p => !p.has_credentials && !p.is_custom && !p.custom_endpoint);
    const custom = providers.filter(p => p.is_custom || p.custom_endpoint);
    return { configuredProviders: configured, availableProviders: available, customProviders: custom };
  }, [providers]);

  // Filter providers based on search term
  const filteredProviders = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      return { configuredProviders, availableProviders, customProviders };
    }

    return {
      configuredProviders: configuredProviders.filter(p => p.name.toLowerCase().includes(term)),
      availableProviders: availableProviders.filter(p => p.name.toLowerCase().includes(term)),
      customProviders: customProviders.filter(p => p.name.toLowerCase().includes(term)),
    };
  }, [configuredProviders, availableProviders, customProviders, searchTerm]);

  const totalFilteredCount =
    filteredProviders.configuredProviders.length +
    filteredProviders.availableProviders.length +
    filteredProviders.customProviders.length;

  const handleSelectProvider = (providerName: string) => {
    onProviderChange(providerName);
    setOpen(false);
    setSearchTerm('');
  };

  const handleCreateNew = () => {
    onCreateNewClick();
    setOpen(false);
    setSearchTerm('');
  };

  // Get display text for selected provider
  const getDisplayText = () => {
    if (isCreatingNewProvider) {
      return (
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span>Create new provider...</span>
        </div>
      );
    }
    if (selectedProvider) {
      const provider = providers.find(p => p.name === selectedProvider);
      return (
        <div className="flex items-center gap-2">
          <ProviderIcon provider_name={selectedProvider} className="h-4 w-4" />
          <span className="capitalize">{provider?.name || selectedProvider}</span>
        </div>
      );
    }
    return <span className="text-muted-foreground">Select a provider...</span>;
  };

  const renderProviderItem = (provider: ProviderInfo, showNotConfigured = false) => {
    const isSelected = selectedProvider === provider.name && !isCreatingNewProvider;

    return (
      <button
        key={provider.name}
        type="button"
        onClick={() => handleSelectProvider(provider.name)}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:bg-accent focus:text-accent-foreground"
        )}
      >
        <ProviderIcon provider_name={provider.name} className="h-4 w-4 mr-2" />
        <span className="capitalize">{provider.name}</span>
        {showNotConfigured && (
          <span className="text-xs text-muted-foreground ml-1">(not configured)</span>
        )}
        {isSelected && <Check className="ml-auto h-4 w-4" />}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Provider
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <Label>
          Select Provider <span className="text-destructive">*</span>
        </Label>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {getDisplayText()}
              <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            {/* Search Input */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search providers..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  autoFocus
                />
              </div>
            </div>

            {/* Scrollable Provider List */}
            <div
              className="p-1"
              style={{ maxHeight: '200px', overflowY: 'auto' }}
              onWheel={e => e.stopPropagation()}
            >
              {filteredProviders.configuredProviders.length > 0 && (
                <div className="px-2 py-1.5">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Configured Providers</div>
                  {filteredProviders.configuredProviders.map(provider => renderProviderItem(provider))}
                </div>
              )}

              {filteredProviders.availableProviders.length > 0 && (
                <div className="px-2 py-1.5">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Available Providers</div>
                  {filteredProviders.availableProviders.map(provider => renderProviderItem(provider, true))}
                </div>
              )}

              {filteredProviders.customProviders.length > 0 && (
                <div className="px-2 py-1.5">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Custom Providers</div>
                  {filteredProviders.customProviders.map(provider => renderProviderItem(provider))}
                </div>
              )}

              {totalFilteredCount === 0 && searchTerm && (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  No providers found
                </div>
              )}
            </div>

            {/* Separator and Create New */}
            <div className="border-t p-1">
              <button
                type="button"
                onClick={handleCreateNew}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                <span>Create new provider...</span>
                {isCreatingNewProvider && <Check className="ml-auto h-4 w-4" />}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* New Provider Form */}
      {isCreatingNewProvider && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="text-sm font-medium">New Provider Details</div>

          <div className="space-y-2">
            <Label htmlFor="provider-name">
              Provider Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="provider-name"
              placeholder="e.g., groq, together, local-llm"
              value={newProviderData.name}
              onChange={e => onNewProviderDataChange({ name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>API Type</Label>
              <Select
                value={newProviderData.apiType}
                onValueChange={v => onNewProviderDataChange({ apiType: v as CustomInferenceApiType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {API_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-endpoint">
                Endpoint URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="provider-endpoint"
                placeholder="https://api.example.com/v1"
                value={newProviderData.endpoint}
                onChange={e => onNewProviderDataChange({ endpoint: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-api-key">API Key (optional)</Label>
            <div className="relative">
              <Input
                id="provider-api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder="Enter API key if required"
                value={newProviderData.apiKey}
                onChange={e => onNewProviderDataChange({ apiKey: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

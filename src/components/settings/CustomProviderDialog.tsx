import { useState, useCallback } from 'react';
import { Plus, Trash2, Eye, EyeOff, Info, Bot, ChevronDown, ChevronUp, Wrench, Brain } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import {
  createCustomProvider,
  createCustomModel,
  setCustomProviderCredentials,
  type CustomInferenceApiType,
  type ModelCapability,
  API_TYPES,
} from '@/services/custom-providers-api';

import { cn } from '@/lib/utils';

const CAPABILITIES: { value: ModelCapability; label: string; icon: typeof Wrench }[] = [
  { value: 'tools', label: 'Tools', icon: Wrench },
  { value: 'reasoning', label: 'Reasoning', icon: Brain },
];

interface PendingModel {
  id: string;
  modelId: string;
  contextSize?: number;
  capabilities: ModelCapability[];
}

interface CustomProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CustomProviderDialog({
  open,
  onOpenChange,
  onSuccess,
}: CustomProviderDialogProps) {
  const { currentProjectId } = ProjectsConsumer();
  const { refetchProviders } = ProviderKeysConsumer();
  const { refetchModels } = ProjectModelsConsumer();

  // Provider form state
  const [providerName, setProviderName] = useState('');
  const [description, setDescription] = useState('');
  const [apiType, setApiType] = useState<CustomInferenceApiType>('openai');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Models state
  const [models, setModels] = useState<PendingModel[]>([]);

  // New model form state
  const [newModelId, setNewModelId] = useState('');
  const [newModelContextSize, setNewModelContextSize] = useState<number | undefined>();
  const [newModelCapabilities, setNewModelCapabilities] = useState<ModelCapability[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setProviderName('');
    setDescription('');
    setApiType('openai');
    setEndpoint('');
    setApiKey('');
    setShowApiKey(false);
    setModels([]);
    setExpandedModelId(null);
    resetNewModelForm();
  }, []);

  const resetNewModelForm = useCallback(() => {
    setNewModelId('');
    setNewModelContextSize(undefined);
    setNewModelCapabilities([]);
  }, []);

  const handleAddModelToList = useCallback(() => {
    if (!newModelId.trim()) {
      toast.error('Please enter a model ID');
      return;
    }

    const newModel: PendingModel = {
      id: crypto.randomUUID(),
      modelId: newModelId.trim(),
      contextSize: newModelContextSize,
      capabilities: [...newModelCapabilities],
    };

    setModels(prev => [...prev, newModel]);
    resetNewModelForm();
  }, [newModelId, newModelContextSize, newModelCapabilities, resetNewModelForm]);

  const handleRemoveModel = useCallback((id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
    if (expandedModelId === id) {
      setExpandedModelId(null);
    }
  }, [expandedModelId]);

  const updateModelContextSize = useCallback((id: string, contextSize: number | undefined) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, contextSize } : m));
  }, []);

  const toggleModelCapability = useCallback((id: string, cap: ModelCapability) => {
    setModels(prev => prev.map(m => {
      if (m.id !== id) return m;
      const hasCap = m.capabilities.includes(cap);
      return {
        ...m,
        capabilities: hasCap ? m.capabilities.filter(c => c !== cap) : [...m.capabilities, cap],
      };
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validation
    if (!providerName.trim()) {
      toast.error('Please enter a provider name');
      return;
    }
    if (!endpoint.trim()) {
      toast.error('Please enter an endpoint URL');
      return;
    }

    setSaving(true);
    try {
      // Create the provider
      await createCustomProvider({
        provider_name: providerName.trim(),
        description: description.trim() || undefined,
        endpoint: endpoint.trim(),
        custom_inference_api_type: apiType,
      }, currentProjectId);

      // Set credentials if API key provided
      if (apiKey.trim()) {
        await setCustomProviderCredentials(
          providerName.trim(),
          { api_key: apiKey.trim() },
          currentProjectId
        );
      }

      // Create all models
      for (const model of models) {
        await createCustomModel({
          model_name: model.modelId,
          provider_name: providerName.trim(),
          model_type: 'completions',
          model_name_in_provider: model.modelId,
          context_size: model.contextSize,
          capabilities: model.capabilities.length > 0 ? model.capabilities : undefined,
        }, currentProjectId);
      }

      const modelCount = models.length;
      toast.success(
        modelCount > 0
          ? `Provider "${providerName}" created with ${modelCount} model${modelCount > 1 ? 's' : ''}`
          : `Provider "${providerName}" created`
      );

      // Refresh data
      await refetchProviders();
      refetchModels();

      // Close and reset
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create provider');
    } finally {
      setSaving(false);
    }
  }, [
    providerName,
    description,
    endpoint,
    apiType,
    apiKey,
    models,
    currentProjectId,
    refetchProviders,
    refetchModels,
    resetForm,
    onOpenChange,
    onSuccess,
  ]);

  const handleClose = useCallback(() => {
    resetForm();
    onOpenChange(false);
  }, [resetForm, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Custom Provider</DialogTitle>
          <DialogDescription>
            Create a custom provider with your own endpoint and models
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Provider Information Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Provider Information
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="provider-name">
                  Provider Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="provider-name"
                  placeholder="e.g., my-local-llm, groq, together"
                  value={providerName}
                  onChange={e => setProviderName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Unique identifier for this provider
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="e.g., Local Ollama server running Llama models"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>API Type <span className="text-destructive">*</span></Label>
                  <Select value={apiType} onValueChange={v => setApiType(v as CustomInferenceApiType)}>
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
                  <Label htmlFor="endpoint">
                    Base Endpoint URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="endpoint"
                    placeholder="http://localhost:11434/v1"
                    value={endpoint}
                    onChange={e => setEndpoint(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">API Key (optional)</Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="Enter API key if required"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Models Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Models ({models.length})
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* Inline Add Model Input */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter model ID and press Enter (e.g., llama3.2:70b)"
                value={newModelId}
                onChange={e => setNewModelId(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newModelId.trim()) {
                    e.preventDefault();
                    handleAddModelToList();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddModelToList}
                disabled={!newModelId.trim()}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Models List */}
            {models.length > 0 && (
              <div className="border rounded-lg divide-y">
                {models.map(model => {
                  const isExpanded = expandedModelId === model.id;
                  return (
                    <div key={model.id}>
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedModelId(isExpanded ? null : model.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Bot className="h-5 w-5 text-muted-foreground" />
                          <div className='flex flex-row gap-2'>
                            <div className="font-medium text-sm">{model.modelId}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              {model.contextSize && (
                                <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                                  {(model.contextSize / 1000).toFixed(0)}K
                                </span>
                              )}
                              {model.capabilities.map(c => {
                                const cap = CAPABILITIES.find(cap => cap.value === c);
                                const Icon = cap?.icon;
                                return (
                                  <span key={c} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium flex items-center gap-0.5">
                                    {Icon && <Icon className="h-2.5 w-2.5" />}
                                    {cap?.label || c}
                                  </span>
                                );
                              })}
                              {!model.contextSize && model.capabilities.length === 0 && (
                                <span className="italic">click to add more details</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveModel(model.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Options */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-3">
                          {/* Context Size */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Context Size (tokens)</Label>
                            <Input
                              type="number"
                              placeholder="e.g., 128000"
                              value={model.contextSize ?? ''}
                              onChange={e => updateModelContextSize(model.id, e.target.value ? parseInt(e.target.value) : undefined)}
                              className="h-8 text-sm"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>

                          {/* Capabilities */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Capabilities</Label>
                            <div className="flex flex-wrap gap-2">
                              {CAPABILITIES.map(cap => {
                                const Icon = cap.icon;
                                const isSelected = model.capabilities.includes(cap.value);
                                return (
                                  <button
                                    key={cap.value}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleModelCapability(model.id, cap.value);
                                    }}
                                    className={cn(
                                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all",
                                      isSelected
                                        ? "bg-primary/15 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                  >
                                    <Icon className="h-3 w-3" />
                                    {cap.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {models.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No models added yet. You can also add models later from the provider settings.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded border">Esc</kbd> to cancel
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? 'Saving...' : 'Save Provider'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

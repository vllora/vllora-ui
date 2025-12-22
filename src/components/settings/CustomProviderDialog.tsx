import { useState, useCallback } from 'react';
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Info, Bot } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
} from '@/services/custom-providers-api';

const API_TYPES: { value: CustomInferenceApiType; label: string }[] = [
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'gemini', label: 'Google Gemini' },
];

const CAPABILITIES: { value: ModelCapability; label: string }[] = [
  { value: 'vision', label: 'Vision' },
  { value: 'function_calling', label: 'Function Calling' },
  { value: 'json_mode', label: 'JSON Mode' },
  { value: 'streaming', label: 'Streaming' },
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
  const [showAddModel, setShowAddModel] = useState(false);

  // New model form state
  const [newModelId, setNewModelId] = useState('');
  const [newModelContextSize, setNewModelContextSize] = useState<number | undefined>();
  const [newModelCapabilities, setNewModelCapabilities] = useState<ModelCapability[]>([]);
  const [showModelAdvanced, setShowModelAdvanced] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setProviderName('');
    setDescription('');
    setApiType('openai');
    setEndpoint('');
    setApiKey('');
    setShowApiKey(false);
    setModels([]);
    setShowAddModel(false);
    resetNewModelForm();
  }, []);

  const resetNewModelForm = useCallback(() => {
    setNewModelId('');
    setNewModelContextSize(undefined);
    setNewModelCapabilities([]);
    setShowModelAdvanced(false);
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
    setShowAddModel(false);
  }, [newModelId, newModelContextSize, newModelCapabilities, resetNewModelForm]);

  const handleRemoveModel = useCallback((id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
  }, []);

  const toggleNewModelCapability = useCallback((cap: ModelCapability) => {
    setNewModelCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
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

            {/* Models List */}
            {models.length > 0 && (
              <div className="border rounded-lg divide-y">
                {models.map(model => (
                  <div key={model.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <Bot className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-sm">{model.modelId}</div>
                        {model.contextSize && (
                          <div className="text-xs text-muted-foreground">
                            {(model.contextSize / 1000).toFixed(0)}K context
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveModel(model.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {models.length === 0 && !showAddModel && (
              <div className="border border-dashed rounded-lg p-4 text-center text-muted-foreground">
                No models added yet
              </div>
            )}

            {/* Add Model Form */}
            {showAddModel && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="text-sm font-medium">New Model</div>

                <div className="space-y-2">
                  <Label htmlFor="new-model-id">
                    Model ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-model-id"
                    placeholder="e.g., llama3.2:70b, gpt-4-turbo"
                    value={newModelId}
                    onChange={e => setNewModelId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The exact model identifier used in API calls
                  </p>
                </div>

                {/* Advanced Options Toggle */}
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowModelAdvanced(!showModelAdvanced)}
                >
                  {showModelAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Advanced Options
                </button>

                {showModelAdvanced && (
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-model-context">Context Size (tokens)</Label>
                      <Input
                        id="new-model-context"
                        type="number"
                        placeholder="e.g., 128000"
                        value={newModelContextSize ?? ''}
                        onChange={e => setNewModelContextSize(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Capabilities</Label>
                      <div className="flex flex-wrap gap-4">
                        {CAPABILITIES.map(cap => (
                          <div key={cap.value} className="flex items-center gap-2">
                            <Checkbox
                              id={`new-cap-${cap.value}`}
                              checked={newModelCapabilities.includes(cap.value)}
                              onCheckedChange={() => toggleNewModelCapability(cap.value)}
                            />
                            <Label htmlFor={`new-cap-${cap.value}`} className="font-normal cursor-pointer">
                              {cap.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetNewModelForm();
                      setShowAddModel(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddModelToList}>
                    Add to List
                  </Button>
                </div>
              </div>
            )}

            {/* Add Model Button */}
            {!showAddModel && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModel(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Model
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              You can also add models later from the provider settings
            </p>
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded border">Esc</kbd> to cancel
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Provider'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

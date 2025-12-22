import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import {
  createCustomModel,
  createCustomProvider,
  setCustomProviderCredentials,
  type ModelCapability,
} from '@/services/custom-providers-api';
import { ProviderSelector, type NewProviderFormData } from './ProviderSelector';

const CAPABILITIES: { value: ModelCapability; label: string }[] = [
  { value: 'vision', label: 'Vision' },
  { value: 'function_calling', label: 'Function Calling' },
  { value: 'json_mode', label: 'JSON Mode' },
  { value: 'streaming', label: 'Streaming' },
];

interface QuickAddModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function QuickAddModelDialog({
  open,
  onOpenChange,
  onSuccess,
}: QuickAddModelDialogProps) {
  const { providers, refetchProviders } = ProviderKeysConsumer();
  const { currentProjectId } = ProjectsConsumer();
  const { refetchModels } = ProjectModelsConsumer();

  // Model form state
  const [modelId, setModelId] = useState('');
  const [displayName, setDisplayName] = useState(''); // Optional, defaults to modelId
  const [contextSize, setContextSize] = useState<number | undefined>();
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([]);

  // Provider selection state
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [isCreatingNewProvider, setIsCreatingNewProvider] = useState(false);
  const [newProviderData, setNewProviderData] = useState<NewProviderFormData>({
    name: '',
    endpoint: '',
    apiType: 'openai',
    apiKey: '',
  });

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setModelId('');
    setDisplayName('');
    setContextSize(undefined);
    setCapabilities([]);
    setSelectedProvider('');
    setIsCreatingNewProvider(false);
    setNewProviderData({
      name: '',
      endpoint: '',
      apiType: 'openai',
      apiKey: '',
    });
    setShowAdvanced(false);
  }, []);

  const handleProviderChange = useCallback((providerName: string) => {
    setIsCreatingNewProvider(false);
    setSelectedProvider(providerName);
  }, []);

  const handleCreateNewClick = useCallback(() => {
    setIsCreatingNewProvider(true);
    setSelectedProvider('');
  }, []);

  const handleNewProviderDataChange = useCallback((data: Partial<NewProviderFormData>) => {
    setNewProviderData(prev => ({ ...prev, ...data }));
  }, []);

  const toggleCapability = useCallback((cap: ModelCapability) => {
    setCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validation
    if (!modelId.trim()) {
      toast.error('Please enter a model ID');
      return;
    }
    if (!selectedProvider && !isCreatingNewProvider) {
      toast.error('Please select a provider');
      return;
    }
    if (isCreatingNewProvider) {
      if (!newProviderData.name.trim()) {
        toast.error('Please enter a provider name');
        return;
      }
      if (!newProviderData.endpoint.trim()) {
        toast.error('Please enter an endpoint URL');
        return;
      }
    }

    setSaving(true);
    try {
      let providerName = selectedProvider;

      // Create new provider if needed
      if (isCreatingNewProvider) {
        await createCustomProvider({
          provider_name: newProviderData.name.trim(),
          endpoint: newProviderData.endpoint.trim(),
          custom_inference_api_type: newProviderData.apiType,
        }, currentProjectId);

        providerName = newProviderData.name.trim();

        // Set credentials if API key provided
        if (newProviderData.apiKey.trim()) {
          await setCustomProviderCredentials(
            providerName,
            { api_key: newProviderData.apiKey.trim() },
            currentProjectId
          );
        }
      }

      // Use displayName if provided, otherwise use modelId
      const finalDisplayName = displayName.trim() || modelId.trim();

      // Create the model
      await createCustomModel({
        model_name: finalDisplayName,
        provider_name: providerName,
        model_type: 'completions',
        model_name_in_provider: modelId.trim(),
        context_size: contextSize,
        capabilities: capabilities.length > 0 ? capabilities : undefined,
      }, currentProjectId);

      toast.success(`Model "${finalDisplayName}" added to ${providerName}`);

      // Refresh data
      await refetchProviders();
      refetchModels();

      // Close and reset
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add model');
    } finally {
      setSaving(false);
    }
  }, [
    modelId,
    displayName,
    selectedProvider,
    isCreatingNewProvider,
    newProviderData,
    contextSize,
    capabilities,
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
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Custom Model</DialogTitle>
          <DialogDescription>
            Add a custom model to an existing provider or create a new provider
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Model Information Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Model
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-id">
                Model ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="model-id"
                placeholder="e.g., llama-3.3-70b-versatile, gpt-4-turbo"
                value={modelId}
                onChange={e => setModelId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The exact model identifier used in API calls
              </p>
            </div>
          </div>

          {/* Provider Section */}
          <ProviderSelector
            providers={providers}
            selectedProvider={selectedProvider}
            isCreatingNewProvider={isCreatingNewProvider}
            newProviderData={newProviderData}
            onProviderChange={handleProviderChange}
            onCreateNewClick={handleCreateNewClick}
            onNewProviderDataChange={handleNewProviderDataChange}
          />

          {/* Advanced Options */}
          <div className="space-y-4">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span className="h-px flex-1 bg-border" />
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced (Optional)
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="h-px flex-1 bg-border" />
            </button>

            {showAdvanced && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="display-name">Display Name</Label>
                  <Input
                    id="display-name"
                    placeholder={modelId || 'Same as Model ID'}
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Custom name shown in the UI (defaults to Model ID)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="context-size">Context Size (tokens)</Label>
                  <Input
                    id="context-size"
                    type="number"
                    placeholder="e.g., 128000"
                    value={contextSize ?? ''}
                    onChange={e => setContextSize(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Capabilities</Label>
                  <div className="flex flex-wrap gap-4">
                    {CAPABILITIES.map(cap => (
                      <div key={cap.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`cap-${cap.value}`}
                          checked={capabilities.includes(cap.value)}
                          onCheckedChange={() => toggleCapability(cap.value)}
                        />
                        <Label htmlFor={`cap-${cap.value}`} className="font-normal cursor-pointer">
                          {cap.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
                {saving ? 'Adding...' : 'Add Model'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

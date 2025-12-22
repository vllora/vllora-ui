import { useState, useCallback } from 'react';
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
import { AdvancedModelOptions } from './AdvancedModelOptions';

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
  const [contextSize, setContextSize] = useState<number | undefined>();
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([]);
  const [modelEndpoint, setModelEndpoint] = useState('');

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
    setContextSize(undefined);
    setCapabilities([]);
    setModelEndpoint('');
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

      // Create the model
      await createCustomModel({
        model_name: modelId.trim(),
        provider_name: providerName,
        model_type: 'completions',
        model_name_in_provider: modelId.trim(),
        context_size: contextSize,
        capabilities: capabilities.length > 0 ? capabilities : undefined,
        endpoint: modelEndpoint.trim() || undefined,
      }, currentProjectId);

      toast.success(`Model "${modelId.trim()}" added to ${providerName}`);

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
    selectedProvider,
    isCreatingNewProvider,
    newProviderData,
    contextSize,
    capabilities,
    modelEndpoint,
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
          <AdvancedModelOptions
            isOpen={showAdvanced}
            onToggle={() => setShowAdvanced(!showAdvanced)}
            contextSize={contextSize}
            onContextSizeChange={setContextSize}
            capabilities={capabilities}
            onCapabilityToggle={toggleCapability}
            showEndpoint={true}
            endpoint={modelEndpoint}
            onEndpointChange={setModelEndpoint}
          />
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

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
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import {
  createCustomModel,
  type ModelCapability,
} from '@/services/custom-providers-api';
import { AdvancedModelOptions } from './AdvancedModelOptions';

interface AddCustomModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  onSuccess?: () => void;
}

export function AddCustomModelDialog({
  open,
  onOpenChange,
  providerName,
  onSuccess,
}: AddCustomModelDialogProps) {
  const { currentProjectId } = ProjectsConsumer();
  const { refetchModels } = ProjectModelsConsumer();

  // Model form state
  const [modelId, setModelId] = useState('');
  const [contextSize, setContextSize] = useState<number | undefined>();
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([]);
  const [endpoint, setEndpoint] = useState('');

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setModelId('');
    setContextSize(undefined);
    setCapabilities([]);
    setEndpoint('');
    setShowAdvanced(false);
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

    setSaving(true);
    try {
      await createCustomModel({
        model_name: modelId.trim(),
        provider_name: providerName,
        model_type: 'completions',
        model_name_in_provider: modelId.trim(),
        context_size: contextSize,
        capabilities: capabilities.length > 0 ? capabilities : undefined,
        endpoint: endpoint.trim() || undefined,
      }, currentProjectId);

      toast.success(`Model "${modelId}" added to ${providerName}`);

      // Refresh models
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
    providerName,
    contextSize,
    capabilities,
    endpoint,
    currentProjectId,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ProviderIcon provider_name={providerName} className="h-5 w-5" />
            Add Model to {providerName}
          </DialogTitle>
          <DialogDescription>
            Add a custom model to use with this provider
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="model-id" className="flex items-center gap-2">
              Model ID <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground font-normal">
                (The exact model identifier used in API calls)
              </span>
            </Label>
            <Input
              id="model-id"
              placeholder="e.g., gpt-4-turbo, claude-3-opus-20240229"
              value={modelId}
              onChange={e => setModelId(e.target.value)}
            />
          </div>

          <AdvancedModelOptions
            isOpen={showAdvanced}
            onToggle={() => setShowAdvanced(!showAdvanced)}
            contextSize={contextSize}
            onContextSizeChange={setContextSize}
            capabilities={capabilities}
            onCapabilityToggle={toggleCapability}
            endpoint={endpoint}
            onEndpointChange={setEndpoint}
            showEndpoint
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Adding...' : 'Add Model'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

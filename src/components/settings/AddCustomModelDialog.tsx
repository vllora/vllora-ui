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
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import {
  createCustomModel,
  type ModelCapability,
} from '@/services/custom-providers-api';

const CAPABILITIES: { value: ModelCapability; label: string }[] = [
  { value: 'vision', label: 'Vision' },
  { value: 'function_calling', label: 'Function Calling' },
  { value: 'json_mode', label: 'JSON Mode' },
  { value: 'streaming', label: 'Streaming' },
];

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
            <Label htmlFor="model-id">
              Model ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="model-id"
              placeholder="e.g., gpt-4-turbo, claude-3-opus-20240229"
              value={modelId}
              onChange={e => setModelId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The exact model identifier used in API calls
            </p>
          </div>

          {/* Advanced Options */}
          <button
            type="button"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
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
                <Label htmlFor="endpoint">Custom Endpoint (optional)</Label>
                <Input
                  id="endpoint"
                  placeholder="Override base URL for this model"
                  value={endpoint}
                  onChange={e => setEndpoint(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the provider's default endpoint
                </p>
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

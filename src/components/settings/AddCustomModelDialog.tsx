import { useState, useCallback } from 'react';
import { Plus, Trash2, Bot, ChevronDown, ChevronUp, Wrench, Brain, Globe } from 'lucide-react';
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
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import {
  createCustomModel,
  type ModelCapability,
} from '@/services/custom-providers-api';
import { ModelOptionsFields } from './ModelOptionsFields';

const CAPABILITIES: { value: ModelCapability; label: string; icon: typeof Wrench }[] = [
  { value: 'tools', label: 'Tools', icon: Wrench },
  { value: 'reasoning', label: 'Reasoning', icon: Brain },
];

interface PendingModel {
  id: string;
  modelId: string;
  contextSize?: number;
  capabilities: ModelCapability[];
  endpoint?: string;
}

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

  // Models state
  const [models, setModels] = useState<PendingModel[]>([]);

  // New model form state
  const [newModelId, setNewModelId] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setModels([]);
    setNewModelId('');
    setExpandedModelId(null);
  }, []);

  const handleAddModelToList = useCallback(() => {
    if (!newModelId.trim()) {
      toast.error('Please enter a model ID');
      return;
    }

    const newModel: PendingModel = {
      id: crypto.randomUUID(),
      modelId: newModelId.trim(),
      capabilities: [],
    };

    setModels(prev => [...prev, newModel]);
    setNewModelId('');
  }, [newModelId]);

  const handleRemoveModel = useCallback((id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
    if (expandedModelId === id) {
      setExpandedModelId(null);
    }
  }, [expandedModelId]);

  const updateModelContextSize = useCallback((id: string, contextSize: number | undefined) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, contextSize } : m));
  }, []);

  const updateModelEndpoint = useCallback((id: string, endpoint: string) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, endpoint: endpoint || undefined } : m));
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
    if (models.length === 0) {
      toast.error('Please add at least one model');
      return;
    }

    setSaving(true);
    try {
      // Create all models
      for (const model of models) {
        await createCustomModel({
          model_name: model.modelId,
          provider_name: providerName,
          model_type: 'completions',
          model_name_in_provider: model.modelId,
          context_size: model.contextSize,
          capabilities: model.capabilities.length > 0 ? model.capabilities : undefined,
          endpoint: model.endpoint,
        }, currentProjectId);
      }

      const modelCount = models.length;
      toast.success(
        modelCount > 1
          ? `${modelCount} models added to ${providerName}`
          : `Model "${models[0].modelId}" added to ${providerName}`
      );

      // Refresh models
      refetchModels();

      // Close and reset
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add models');
    } finally {
      setSaving(false);
    }
  }, [
    models,
    providerName,
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ProviderIcon provider_name={providerName} className="h-5 w-5" />
            Add Models to {providerName}
          </DialogTitle>
          <DialogDescription>
            Add one or more custom models to use with this provider
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
                            {model.endpoint && (
                              <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium flex items-center gap-0.5">
                                <Globe className="h-2.5 w-2.5" />
                                Custom URL
                              </span>
                            )}
                            {!model.contextSize && model.capabilities.length === 0 && !model.endpoint && (
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
                      <ModelOptionsFields
                        contextSize={model.contextSize}
                        onContextSizeChange={(value) => updateModelContextSize(model.id, value)}
                        capabilities={model.capabilities}
                        onCapabilityToggle={(cap) => toggleModelCapability(model.id, cap)}
                        endpoint={model.endpoint}
                        onEndpointChange={(value) => updateModelEndpoint(model.id, value)}
                        showEndpoint={true}
                        compact={true}
                        className="px-3 pb-3 pt-1 bg-muted/20"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {models.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No models added yet. Enter a model ID above and press Enter or click +
            </p>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              {models.length > 0 && `${models.length} model${models.length > 1 ? 's' : ''} to add`}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving || models.length === 0}>
                {saving ? 'Adding...' : models.length > 1 ? `Add ${models.length} Models` : 'Add Model'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

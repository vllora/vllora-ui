import { ChevronDown, ChevronUp, Settings2, Hash, Globe, Zap, Wrench, Brain } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type ModelCapability } from '@/services/custom-providers-api';
import { cn } from '@/lib/utils';

const CAPABILITIES: { value: ModelCapability; label: string; icon: typeof Wrench }[] = [
  { value: 'tools', label: 'Tools', icon: Wrench },
  { value: 'reasoning', label: 'Reasoning', icon: Brain },
];

interface AdvancedModelOptionsProps {
  isOpen: boolean;
  onToggle: () => void;
  // Context size
  contextSize?: number;
  onContextSizeChange: (value: number | undefined) => void;
  // Capabilities
  capabilities: ModelCapability[];
  onCapabilityToggle: (cap: ModelCapability) => void;
  // Optional endpoint (for AddCustomModelDialog)
  endpoint?: string;
  onEndpointChange?: (value: string) => void;
  showEndpoint?: boolean;
}

export function AdvancedModelOptions({
  isOpen,
  onToggle,
  contextSize,
  onContextSizeChange,
  capabilities,
  onCapabilityToggle,
  endpoint,
  onEndpointChange,
  showEndpoint = false,
}: AdvancedModelOptionsProps) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        onClick={onToggle}
      >
        <span className="h-px flex-1 bg-border" />
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        Advanced (Optional)
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <span className="h-px flex-1 bg-border" />
      </button>

      {isOpen && (
        <div className="border rounded-xl overflow-hidden bg-gradient-to-b from-muted/50 to-muted/20">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Settings2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-medium">Advanced Settings</div>
              <div className="text-xs text-muted-foreground">Fine-tune your model configuration</div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-4 space-y-4">
            {/* Context Size */}
            <div className="space-y-2">
              <Label htmlFor="context-size" className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                Context Size
                <span className="text-xs text-muted-foreground font-normal">(tokens)</span>
              </Label>
              <Input
                id="context-size"
                type="number"
                placeholder="e.g., 128000"
                value={contextSize ?? ''}
                onChange={e => onContextSizeChange(e.target.value ? parseInt(e.target.value) : undefined)}
                className="bg-background"
              />
            </div>

            {/* Custom Endpoint */}
            {showEndpoint && onEndpointChange && (
              <div className="space-y-2">
                <Label htmlFor="endpoint" className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  Custom Endpoint
                  <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="endpoint"
                  placeholder="Override base URL for this model"
                  value={endpoint || ''}
                  onChange={e => onEndpointChange(e.target.value)}
                  className="bg-background"
                />
              </div>
            )}

            {/* Capabilities */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Capabilities
              </Label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITIES.map(cap => {
                  const Icon = cap.icon;
                  const isSelected = capabilities.includes(cap.value);
                  return (
                    <button
                      key={cap.value}
                      type="button"
                      onClick={() => onCapabilityToggle(cap.value)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all",
                        isSelected
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {cap.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

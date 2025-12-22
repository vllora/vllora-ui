import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { type ModelCapability } from '@/services/custom-providers-api';

const CAPABILITIES: { value: ModelCapability; label: string }[] = [
  { value: 'vision', label: 'Vision' },
  { value: 'function_calling', label: 'Function Calling' },
  { value: 'json_mode', label: 'JSON Mode' },
  { value: 'streaming', label: 'Streaming' },
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
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="context-size">Context Size (tokens)</Label>
            <Input
              id="context-size"
              type="number"
              placeholder="e.g., 128000"
              value={contextSize ?? ''}
              onChange={e => onContextSizeChange(e.target.value ? parseInt(e.target.value) : undefined)}
            />
          </div>

          {showEndpoint && onEndpointChange && (
            <div className="space-y-2">
              <Label htmlFor="endpoint" className="flex items-center gap-2">
                Custom Endpoint
                <span className="text-xs text-muted-foreground font-normal">
                  (Leave empty to use provider's default)
                </span>
              </Label>
              <Input
                id="endpoint"
                placeholder="Override base URL for this model"
                value={endpoint || ''}
                onChange={e => onEndpointChange(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Capabilities</Label>
            <div className="flex flex-wrap gap-4">
              {CAPABILITIES.map(cap => (
                <div key={cap.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`cap-${cap.value}`}
                    checked={capabilities.includes(cap.value)}
                    onCheckedChange={() => onCapabilityToggle(cap.value)}
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
  );
}

import { Hash, Globe, Zap, Wrench, Brain } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type ModelCapability } from '@/services/custom-providers-api';
import { cn } from '@/lib/utils';

const CAPABILITIES: { value: ModelCapability; label: string; icon: typeof Wrench }[] = [
  { value: 'tools', label: 'Tools', icon: Wrench },
  { value: 'reasoning', label: 'Reasoning', icon: Brain },
];

interface ModelOptionsFieldsProps {
  // Context size
  contextSize?: number;
  onContextSizeChange: (value: number | undefined) => void;
  // Capabilities
  capabilities: ModelCapability[];
  onCapabilityToggle: (cap: ModelCapability) => void;
  // Optional endpoint
  endpoint?: string;
  onEndpointChange?: (value: string) => void;
  showEndpoint?: boolean;
  // Styling
  compact?: boolean;
  className?: string;
}

export function ModelOptionsFields({
  contextSize,
  onContextSizeChange,
  capabilities,
  onCapabilityToggle,
  endpoint,
  onEndpointChange,
  showEndpoint = false,
  compact = false,
  className,
}: ModelOptionsFieldsProps) {
  const inputSize = compact ? 'h-8 text-sm' : '';
  const labelSize = compact ? 'text-xs text-muted-foreground' : 'flex items-center gap-2';
  const capButtonSize = compact
    ? 'px-2.5 py-1 rounded-full text-xs'
    : 'px-3 py-1.5 rounded-full text-sm';

  return (
    <div className={cn('space-y-3', className)}>
      {/* Context Size */}
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <Label htmlFor="context-size" className={labelSize}>
          {!compact && <Hash className="h-3.5 w-3.5 text-muted-foreground" />}
          Context Size{compact ? ' (tokens)' : ''}
          {!compact && <span className="text-xs text-muted-foreground font-normal">(tokens)</span>}
        </Label>
        <Input
          id="context-size"
          type="number"
          placeholder="e.g., 128000"
          value={contextSize ?? ''}
          onChange={e => onContextSizeChange(e.target.value ? parseInt(e.target.value) : undefined)}
          className={cn(compact ? inputSize : 'bg-background')}
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Custom Endpoint */}
      {showEndpoint && onEndpointChange && (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          <Label htmlFor="endpoint" className={labelSize}>
            {!compact && <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
            Custom Endpoint
            <span className={compact ? 'font-normal' : 'text-xs text-muted-foreground font-normal'}>
              (override provider base URL for this model)
            </span>
          </Label>
          <Input
            id="endpoint"
            placeholder="https://api.example.com/v1"
            value={endpoint || ''}
            onChange={e => onEndpointChange(e.target.value)}
            className={cn(compact ? inputSize : 'bg-background')}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Capabilities */}
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <Label className={labelSize}>
          {!compact && <Zap className="h-3.5 w-3.5 text-muted-foreground" />}
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
                onClick={(e) => {
                  e.stopPropagation();
                  onCapabilityToggle(cap.value);
                }}
                className={cn(
                  'flex items-center gap-1.5 transition-all',
                  capButtonSize,
                  isSelected
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                {cap.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

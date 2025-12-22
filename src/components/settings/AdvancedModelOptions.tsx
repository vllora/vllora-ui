import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ModelCapability } from '@/services/custom-providers-api';
import { ModelOptionsFields } from './ModelOptionsFields';

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
          <ModelOptionsFields
            contextSize={contextSize}
            onContextSizeChange={onContextSizeChange}
            capabilities={capabilities}
            onCapabilityToggle={onCapabilityToggle}
            endpoint={endpoint}
            onEndpointChange={onEndpointChange}
            showEndpoint={showEndpoint}
            className="p-4 space-y-4"
          />
        </div>
      )}
    </div>
  );
}

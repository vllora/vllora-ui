import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TraceHeaderProps {
  loadingSpans: boolean;
  refreshSpans: () => void;
}

export const TraceHeader: React.FC<TraceHeaderProps> = ({
  loadingSpans,
  refreshSpans,
}) => {
  return (
    <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card/95 backdrop-blur-xl flex-shrink-0">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Traces</h2>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={refreshSpans}
        disabled={loadingSpans}
        className="h-8 w-8"
      >
        <RefreshCw
          className={`h-4 w-4 ${loadingSpans ? 'animate-spin' : ''}`}
        />
      </Button>
    </div>
  );
};

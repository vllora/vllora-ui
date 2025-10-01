import React from 'react';
import { Sparkles } from 'lucide-react';

export const TraceEmptyState: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <p className="text-sm text-muted-foreground font-medium">No traces yet</p>
      <p className="text-xs text-muted-foreground mt-1">
        Send a message to see traces
      </p>
    </div>
  );
};

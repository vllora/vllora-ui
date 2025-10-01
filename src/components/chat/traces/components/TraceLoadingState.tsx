import React from 'react';
import { Loader2 } from 'lucide-react';

export const TraceLoadingState: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground">Loading traces...</p>
    </div>
  );
};

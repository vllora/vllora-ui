import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
interface TraceListHeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
}

export const TraceListHeader: React.FC<TraceListHeaderProps> = ({ onRefresh, isLoading }) => {
  return (
    <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card/95 backdrop-blur-xl flex-shrink-0">
      <h2 className="text-sm font-semibold text-foreground">Traces</h2>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={isLoading}
        className="h-8 w-8"
      >
        <RefreshCw
          className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
        />
      </Button>
    </div>
  );
};
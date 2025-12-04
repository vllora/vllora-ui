import React from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router';

interface TraceListHeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
  threadId?: string;
}

export const TraceListHeader: React.FC<TraceListHeaderProps> = ({ onRefresh, isLoading, threadId }) => {
  const navigate = useNavigate();

  const handleViewInTracesTab = () => {
    if (threadId) {
      navigate(`/chat?tab=traces&thread_id=${threadId}`);
    }
  };

  return (
    <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card/95 backdrop-blur-xl flex-shrink-0">
      <h2 className="text-sm font-semibold text-foreground">Traces</h2>
      <div className="flex items-center gap-1">
        {threadId && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleViewInTracesTab}
                  className="h-8 w-8"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>View in traces tab</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
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
    </div>
  );
};
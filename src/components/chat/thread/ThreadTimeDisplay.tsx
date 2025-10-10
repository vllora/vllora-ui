import React, { useRef } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatThreadTime } from '@/utils/dateUtils';
import { useRelativeTime } from '@/hooks/useRelativeTime';

interface ThreadTimeDisplayProps {
  updatedAt: string;
}

// Not memoized - needs to re-render when time updates
export const ThreadTimeDisplay: React.FC<ThreadTimeDisplayProps> = ({ updatedAt }) => {
  const threadRowTimeRef = useRef<HTMLDivElement>(null);

  const updatedDateISOString = (() => {
    const result = new Date(updatedAt);
    const isValidDate = !isNaN(result.getTime());
    return isValidDate ? result.toISOString() : '';
  })();

  // Only update time display when visible and recent (24 hours = 86400 seconds)
  useRelativeTime(threadRowTimeRef, updatedDateISOString, 10000, 86400);

  // Recalculate on every render (triggered by useRelativeTime)
  const formattedRelativeUpdatedDate = formatThreadTime(updatedDateISOString);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={threadRowTimeRef}
            className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-help truncate"
          >
            <ClockIcon className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            <span className="font-mono">{formattedRelativeUpdatedDate}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs p-1.5">
          <div>
            Updated:{' '}
            {updatedDateISOString
              ? format(new Date(updatedDateISOString), 'yyyy-MM-dd HH:mm:ss')
              : 'Unknown'}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

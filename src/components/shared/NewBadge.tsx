import React from 'react';
import { Sparkles, Calendar, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NewBadgeProps {
  releaseDate?: string;
  daysAgo?: number;
  className?: string;
  showTooltip?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export const NewBadge: React.FC<NewBadgeProps> = ({
  releaseDate,
  daysAgo,
  className = '',
  showTooltip = true,
  size = 'sm'
}) => {
  const sizeConfig = {
    xs: {
      icon: 'w-2.5 h-2.5',
      text: 'text-[10px]',
      gap: 'gap-0.5',
      tooltipIcon: 'w-3 h-3'
    },
    sm: {
      icon: 'w-3 h-3',
      text: 'text-xs',
      gap: 'gap-1',
      tooltipIcon: 'w-3.5 h-3.5'
    },
    md: {
      icon: 'w-3.5 h-3.5',
      text: 'text-sm',
      gap: 'gap-1.5',
      tooltipIcon: 'w-4 h-4'
    }
  };

  const config = sizeConfig[size];

  const badgeContent = (
    <div className={`flex items-center ${config.gap} cursor-help ${className}`}>
      <Sparkles className={`${config.icon} text-blue-400`} />
      <span className={`${config.text} text-blue-400 font-medium`}>New</span>
    </div>
  );

  if (!showTooltip) {
    return badgeContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white max-w-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 border-b border-zinc-700 pb-1.5">
              <Sparkles className={`${config.tooltipIcon} text-blue-400`} />
              <p className="text-xs font-medium">Recently Added</p>
            </div>
            {(daysAgo !== undefined || releaseDate) && (
              <div className="space-y-1.5">
                {daysAgo !== undefined && (
                  <div className="flex items-start gap-1.5">
                    <Clock className="w-3 h-3 text-zinc-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <span className="text-zinc-300">Added </span>
                      <span className="text-white font-semibold">
                        {daysAgo === 0 ? 'today' :
                          daysAgo === 1 ? 'yesterday' :
                            `${daysAgo} days ago`}
                      </span>
                    </div>
                  </div>
                )}
                {releaseDate && (
                  <div className="flex items-start gap-1.5">
                    <Calendar className="w-3 h-3 text-zinc-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-zinc-400">
                      {new Date(releaseDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
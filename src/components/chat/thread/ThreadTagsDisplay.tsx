import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ThreadTagsDisplayProps {
  tags: string[];
}

export const ThreadTagsDisplay = ({ tags }: ThreadTagsDisplayProps) => {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex flex-row items-center flex-wrap gap-1 w-full">
      {tags.slice(0, 3).map((tag, index) => {
        const hasEquals = tag.includes('=');
        let left = tag;
        let right = tag;
        if (hasEquals) {
          left = tag.split('=')[0];
          right = tag.split('=')[1];
          if (right === '-') {
            right = '';
          }
        } else {
          left = tag;
          right = '';
        }

        const bgColor =
          index === 0
            ? 'bg-emerald-500 text-white'
            : index === 1
            ? 'bg-purple-500 text-white'
            : 'bg-blue-500 text-white';

        return (
          <TooltipProvider key={tag}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'text-[10px] font-medium inline-flex items-center cursor-help',
                    'border border-border rounded-sm',
                    'shadow-sm'
                  )}
                >
                  {left && right && (
                    <>
                      <span className="px-1 py-0.4 max-w-[50px] truncate bg-[#1a1a1a] rounded-l-sm">
                        {left}
                      </span>
                      <span
                        className={`px-1 py-0.4 max-w-[50px] truncate rounded-r-sm font-semibold ${bgColor}`}
                      >
                        {right}
                      </span>
                    </>
                  )}

                  {!left && right && (
                    <span className={`px-2 py-0.4 max-w-[100px] ${bgColor} rounded-sm`}>{right}</span>
                  )}
                  {left && !right && (
                    <span className={`px-2 py-0.4 max-w-[100px] ${bgColor} rounded-sm`}>{left}</span>
                  )}
                  {!left && !right && <></>}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{tag}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      {tags.length > 3 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs bg-[#1a1a1a] text-white rounded-md px-2 py-0.5 border border-border shadow-sm cursor-help">
                +{tags.length - 3}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="border border-border">
              <p>{tags.slice(3).join(', ')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

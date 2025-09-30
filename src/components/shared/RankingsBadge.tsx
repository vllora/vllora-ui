import React from 'react';
import { Trophy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RankingsBadgeProps {
  ranks: { category: string; rank: number }[];
  size?: 'sm' | 'md';
  className?: string;
  filterCategories?: string[];
}

const formatCategoryName = (category: string) => {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/Qa/g, 'Q&A')
    .replace(/Json/g, 'JSON')
    .replace(/Sql/g, 'SQL');
};

export const RankingsBadge: React.FC<RankingsBadgeProps> = ({
  ranks,
  size = 'sm',
  className = '',
  filterCategories
}) => {
  if (!ranks || ranks.length === 0) return null;

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const padding = size === 'sm' ? 'p-1' : 'p-1.5';

  const sortedRanks = [...ranks].sort((a, b) => a.rank - b.rank);

  const filteredRanks = filterCategories && filterCategories.length > 0
    ? ranks.filter(r => filterCategories.includes(r.category))
    : [];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={`${padding} rounded cursor-help hover:bg-zinc-800/30 transition-all duration-200 ${className}`}>
            {filteredRanks.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {filteredRanks.map((rank) => (
                  <div key={rank.category} className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-400">
                      {formatCategoryName(rank.category)}
                    </span>
                    <span className={`text-xs font-mono ${rank.rank <= 3 ? 'text-zinc-200 font-semibold' : 'text-zinc-500'}`}>
                      #{rank.rank}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Trophy className={`${iconSize} text-zinc-500`} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 text-white p-0 shadow-xl shadow-black/20 overflow-hidden max-w-xs"
        >
          <div>
            <div className="bg-gradient-to-r from-zinc-800/50 to-zinc-800/30 px-3 py-2 border-b border-zinc-700/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-zinc-300" />
                  Category Rankings
                </p>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {sortedRanks.map((ranking, index) => (
                <div
                  key={`${ranking.category}-${index}`}
                  className="flex items-center justify-between"
                >
                  <span className="text-xs text-zinc-400">
                    {formatCategoryName(ranking.category)}
                  </span>
                  <span className={`text-xs font-mono ${ranking.rank <= 3 ? 'text-zinc-200 font-semibold' : 'text-zinc-500'}`}>
                    #{ranking.rank}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
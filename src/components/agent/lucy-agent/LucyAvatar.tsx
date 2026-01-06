/**
 * LucyAvatar
 *
 * Avatar component for the Lucy AI assistant.
 * Uses custom lucy-avarta.png image.
 */

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LucyAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
  showBadge?: boolean;
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

const borderClasses = {
  sm: 'ring-[0.5px]',
  md: 'ring-1',
  lg: 'ring-[1.5px]',
};

const auraClasses = {
  sm: 'shadow-[0_0_8px_2px_rgba(16,185,129,0.4)]',
  md: 'shadow-[0_0_12px_3px_rgba(16,185,129,0.4)]',
  lg: 'shadow-[0_0_20px_5px_rgba(16,185,129,0.35)]',
};

const badgeSizeClasses = {
  sm: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
  md: 'w-3 h-3 -bottom-0.5 -right-0.5',
  lg: 'w-4 h-4 bottom-0 right-0',
};

const badgeIconClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export function LucyAvatar({ size = 'md', className, animated = false, showBadge = false }: LucyAvatarProps) {
  return (
    <div className={cn('relative inline-block', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden ring-emerald-500 bg-zinc-900',
          sizeClasses[size],
          borderClasses[size],
          auraClasses[size],
          animated && 'animate-pulse'
        )}
      >
        <img
          src="/lucy-avarta.png"
          alt="Lucy"
          className="w-full h-full object-cover object-top"
        />
      </div>
      {showBadge && (
        <div
          className={cn(
            'absolute flex items-center justify-center rounded-full bg-zinc-900 ring-1 ring-emerald-500',
            badgeSizeClasses[size]
          )}
        >
          <Zap className={cn('text-emerald-400 fill-emerald-400', badgeIconClasses[size])} />
        </div>
      )}
    </div>
  );
}

export default LucyAvatar;

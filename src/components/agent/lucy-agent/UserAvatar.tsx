/**
 * UserAvatar
 *
 * Theme-aware user avatar component.
 * Consistent sizing that matches LucyAvatar proportions.
 */

import { cn } from '@/lib/utils';

export interface UserAvatarProps {
  size?: 'sm' | 'md';
  name?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-6 h-6 text-xs',
};

function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0][0]?.toUpperCase() || 'U';
}

export function UserAvatar({ size = 'sm', name, className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white',
        'bg-gradient-to-br from-[rgba(var(--theme-400),1)] to-[rgba(var(--theme-600),1)]',
        sizeClasses[size],
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}

export default UserAvatar;

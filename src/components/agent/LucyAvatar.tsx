/**
 * LucyAvatar
 *
 * A polished, modern avatar component for the Lucy AI assistant.
 * Clean illustration style with theme color accents.
 */

import { cn } from '@/lib/utils';

interface LucyAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LucyAvatar({ size = 'md', className, animated = false }: LucyAvatarProps) {
  return (
    <div
      className={cn(
        'relative rounded-full flex items-center justify-center overflow-hidden',
        sizeClasses[size],
        animated && 'animate-pulse',
        className
      )}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
      >
        <defs>
          {/* Soft gradient background using theme */}
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(var(--theme-400))" />
            <stop offset="100%" stopColor="rgb(var(--theme-600))" />
          </linearGradient>

          {/* Warm skin tone */}
          <linearGradient id="skin" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FDEEE4" />
            <stop offset="100%" stopColor="#F5D6C6" />
          </linearGradient>

          {/* Rich brown hair */}
          <linearGradient id="hair" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6B5344" />
            <stop offset="50%" stopColor="#4A3728" />
            <stop offset="100%" stopColor="#3A2A1F" />
          </linearGradient>

          {/* Soft shadow */}
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15"/>
          </filter>
        </defs>

        {/* Background */}
        <circle cx="50" cy="50" r="50" fill="url(#bgGrad)" />

        {/* Hair back volume */}
        <ellipse cx="50" cy="42" rx="28" ry="30" fill="url(#hair)" />

        {/* Hair sides */}
        <ellipse cx="26" cy="52" rx="10" ry="18" fill="url(#hair)" />
        <ellipse cx="74" cy="52" rx="10" ry="18" fill="url(#hair)" />

        {/* Face */}
        <ellipse cx="50" cy="50" rx="18" ry="22" fill="url(#skin)" filter="url(#softShadow)" />

        {/* Hair front - soft waves */}
        <path
          d="M 28 38
             Q 32 28 42 30
             Q 50 26 58 30
             Q 68 28 72 38
             Q 68 34 60 36
             Q 50 32 40 36
             Q 32 34 28 38"
          fill="url(#hair)"
        />

        {/* Eyebrows - soft arches */}
        <path d="M 38 44 Q 42 42 46 44" fill="none" stroke="#8B7060" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M 54 44 Q 58 42 62 44" fill="none" stroke="#8B7060" strokeWidth="1.2" strokeLinecap="round" />

        {/* Eyes - almond shaped */}
        <ellipse cx="42" cy="50" rx="4" ry="3" fill="white" />
        <ellipse cx="58" cy="50" rx="4" ry="3" fill="white" />

        {/* Iris */}
        <circle cx="42" cy="50" r="2" fill="#5D4E42" />
        <circle cx="58" cy="50" r="2" fill="#5D4E42" />

        {/* Eye highlights */}
        <circle cx="43" cy="49" r="0.8" fill="white" />
        <circle cx="59" cy="49" r="0.8" fill="white" />

        {/* Nose - minimal */}
        <path d="M 50 52 L 50 56" fill="none" stroke="#E5C4B5" strokeWidth="1" strokeLinecap="round" />

        {/* Lips - soft smile */}
        <path
          d="M 44 62 Q 47 64 50 63 Q 53 64 56 62"
          fill="none"
          stroke="#D4938A"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Rosy cheeks */}
        <circle cx="34" cy="56" r="4" fill="#FFB5A8" opacity="0.25" />
        <circle cx="66" cy="56" r="4" fill="#FFB5A8" opacity="0.25" />

        {/* Neck */}
        <path d="M 44 71 L 44 78 Q 50 80 56 78 L 56 71" fill="url(#skin)" />

        {/* Clothing - clean collar */}
        <path
          d="M 25 92 Q 38 78 50 80 Q 62 78 75 92 L 78 100 L 22 100 Z"
          fill="white"
        />
        <path
          d="M 44 80 L 50 88 L 56 80"
          fill="none"
          stroke="#E8E8E8"
          strokeWidth="1"
        />

        {/* Subtle highlight on face */}
        <ellipse cx="45" cy="45" rx="8" ry="6" fill="white" opacity="0.08" />
      </svg>

      {/* Glass effect border */}
      <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/30" />
    </div>
  );
}

export default LucyAvatar;

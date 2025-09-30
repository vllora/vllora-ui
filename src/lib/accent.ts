/**
 * Accent color utility classes
 * Use these instead of hardcoded 'emerald-*' classes for easy customization
 *
 * To change the accent color:
 * 1. Edit /src/styles/accent.css
 * 2. Uncomment the desired color preset or define custom values
 * 3. All components using these utilities will update automatically
 */

export const accent = {
  // Text colors
  text: 'text-[rgb(var(--accent-600))] dark:text-[rgb(var(--accent-400))]',
  textMuted: 'text-[rgb(var(--accent-500))]',

  // Background colors
  bg: {
    subtle: 'bg-[rgb(var(--accent-500))]/10',
    light: 'bg-[rgb(var(--accent-500))]/15',
    medium: 'bg-[rgb(var(--accent-500))]/20',
    solid: 'bg-[rgb(var(--accent-500))]',
  },

  // Hover states
  hover: {
    bg: 'hover:bg-[rgb(var(--accent-500))]/10',
    text: 'hover:text-[rgb(var(--accent-500))]',
    border: 'hover:border-[rgb(var(--accent-500))]/30',
  },

  // Border colors
  border: {
    light: 'border-[rgb(var(--accent-500))]/20',
    medium: 'border-[rgb(var(--accent-500))]/30',
    strong: 'border-[rgb(var(--accent-500))]/50',
  },

  // Icon colors
  icon: 'text-[rgb(var(--accent-500))]',

  // Shadow colors
  shadow: {
    sm: 'shadow-[rgb(var(--accent-500))]/10',
    md: 'shadow-[rgb(var(--accent-500))]/20',
  },
} as const;

// Alternative: Use Tailwind's arbitrary values directly in JSX
// Example: className={`bg-[rgb(var(--accent-500))]/10 text-[rgb(var(--accent-600))]`}
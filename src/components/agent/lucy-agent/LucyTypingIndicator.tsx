/**
 * LucyTypingIndicator
 *
 * Custom typing indicator with Lucy-themed styling.
 * Shows animated dots with theme colors.
 */

export function LucyTypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-0 py-1">
      <div className="flex gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full bg-[rgba(var(--theme-500),0.7)] animate-bounce"
          style={{ animationDelay: '-0.3s', animationDuration: '0.6s' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-[rgba(var(--theme-500),0.7)] animate-bounce"
          style={{ animationDelay: '-0.15s', animationDuration: '0.6s' }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-[rgba(var(--theme-500),0.7)] animate-bounce"
          style={{ animationDuration: '0.6s' }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground/60">Lucy is typing...</span>
    </div>
  );
}

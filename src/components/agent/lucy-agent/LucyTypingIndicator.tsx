/**
 * LucyTypingIndicator
 *
 * Custom typing indicator with Lucy-themed styling.
 * Shows animated dots with theme colors.
 */

export function LucyTypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className="flex gap-0.5">
        <span
          className="w-1 h-1 rounded-full bg-[rgba(var(--theme-500),0.6)] animate-bounce"
          style={{ animationDelay: '-0.3s', animationDuration: '0.6s' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-[rgba(var(--theme-500),0.6)] animate-bounce"
          style={{ animationDelay: '-0.15s', animationDuration: '0.6s' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-[rgba(var(--theme-500),0.6)] animate-bounce"
          style={{ animationDuration: '0.6s' }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground/40">Lucy is typing...</span>
    </div>
  );
}

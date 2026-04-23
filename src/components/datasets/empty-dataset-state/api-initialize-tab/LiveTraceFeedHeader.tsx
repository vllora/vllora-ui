/**
 * LiveTraceFeedHeader
 *
 * Slim toolbar for the trace feed area — shows connection status
 * and clear button. Designed to sit inside the card body, not as
 * a duplicate card title.
 */

interface LiveTraceFeedHeaderProps {
  traceCount?: number;
  onClear?: () => void;
}

export function LiveTraceFeedHeader({ traceCount = 0, onClear }: LiveTraceFeedHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
      {/* Status indicator — always show listening */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[rgb(var(--theme-500))] opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[rgb(var(--theme-500))]" />
        </span>
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">
          Listening
        </span>
      </div>

      {/* Right side — count + clear */}
      <div className="flex items-center gap-2">
        {traceCount > 0 && (
          <span className="text-[10px] text-muted-foreground/40">
            {traceCount} trace{traceCount !== 1 ? "s" : ""}
          </span>
        )}
        {onClear && traceCount > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

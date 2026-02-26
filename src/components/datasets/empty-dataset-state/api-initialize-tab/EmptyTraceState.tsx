/**
 * EmptyTraceState
 *
 * Terminal-style waiting state — blinking cursor and dim prompt text.
 * Matches the log streaming aesthetic of the trace feed.
 */

export function EmptyTraceState() {
  return (
    <div className="flex-1 flex items-center justify-center py-8">
      <div className="font-mono text-[11px] text-muted-foreground/30">
        <span>waiting for traces</span>
        <span className="inline-block w-[5px] h-[13px] bg-muted-foreground/30 ml-1 align-middle animate-[pulse_1s_steps(1)_infinite]" />
      </div>
    </div>
  );
}

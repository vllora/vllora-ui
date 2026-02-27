/**
 * EpochProgressBar
 *
 * Compact epoch progress indicator: inline label + thin gradient bar + percentage.
 * Single-line layout keeps it minimal while clearly communicating what the bar represents.
 */

interface EpochProgressBarProps {
  currentEpoch: number;
  totalEpochs: number;
}

export function EpochProgressBar({ currentEpoch, totalEpochs }: EpochProgressBarProps) {
  const pct = Math.round((currentEpoch / totalEpochs) * 100);

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap shrink-0">
        Epoch {currentEpoch}/{totalEpochs}
      </span>
      <div className="h-1.5 flex-1 rounded-full bg-[#262626] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#10b981]/40 to-[#10b981] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono font-medium text-[#10b981] shrink-0">
        {pct}%
      </span>
    </div>
  );
}

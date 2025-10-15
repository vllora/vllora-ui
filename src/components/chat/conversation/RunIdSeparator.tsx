import React from 'react';
import { Play } from 'lucide-react';

interface RunIdSeparatorProps {
  runId: string;
  onClick?: (runId: string) => void;
}

/**
 * Visual separator showing run ID with lines on both sides
 * Clickable badge in the center with gradient lines extending left and right
 */
export const RunIdSeparator: React.FC<RunIdSeparatorProps> = ({ runId, onClick }) => {
  return (
    <div className="flex items-center gap-3 my-6">
      {/* Left gradient line */}
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/60 to-border/60" />

      {/* Run ID badge */}
      <button
        onClick={() => onClick?.(runId)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/40 hover:bg-muted hover:border-border transition-colors cursor-pointer group"
        title={`Click to view run: ${runId}`}
      >
        <Play className="w-3 h-3 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
        <span className="text-[11px] font-mono font-medium text-muted-foreground/90 group-hover:text-foreground tracking-wide transition-colors">
          Run: {runId.slice(0, 8)}
        </span>
      </button>

      {/* Right gradient line */}
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border/60 to-border/60" />
    </div>
  );
};

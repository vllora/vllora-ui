/**
 * LiveTracesCard
 *
 * Card 2 in the API initialize tab — wraps the LiveTraceFeed
 * with numbered badge, title, description, and the same
 * glowing border style as ObjectiveInputCard.
 */

import { Radio } from "lucide-react";
import { StepBadge } from "./StepBadge";
import { LiveTraceFeed, type Trace } from "./LiveTraceFeed";

interface LiveTracesCardProps {
  traces: Trace[];
  onClear?: () => void;
  className?: string;
}

export function LiveTracesCard({
  traces,
  onClear,
  className,
}: LiveTracesCardProps) {
  return (
    <div className={`group/card relative ${className || ""}`}>
      {/* Glow effect behind card (same as ObjectiveInputCard) */}
      <div
        className="absolute -inset-px rounded-2xl transition-opacity duration-500 opacity-0 group-hover/card:opacity-60"
        style={{
          background:
            "linear-gradient(135deg, rgba(var(--theme-500), 0.2), rgba(var(--theme-400), 0.05), rgba(var(--theme-500), 0.15))",
        }}
      />

      <div
        className="relative rounded-2xl border border-border/50 hover:border-border/80 transition-all duration-300 overflow-hidden flex flex-col h-full"
        style={{ background: "hsl(var(--card) / 0.9)" }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <StepBadge>2</StepBadge>
            <div>
              <h3 className="text-[13px] font-semibold text-foreground">
                Live Traces
              </h3>
              <p className="text-xs text-muted-foreground/60 leading-relaxed mt-0.5">
                Watch your API calls appear as they happen.
              </p>
            </div>
          </div>
          <Radio className="w-4 h-4 text-muted-foreground/30 shrink-0 self-start mt-1" />
        </div>

        {/* Embedded trace feed — no outer card styling, we ARE the card */}
        <div className="flex-1 border-t border-border/30 flex flex-col min-h-0">
          <LiveTraceFeed
            traces={traces}
            onClear={onClear}
            className="flex-1 rounded-none border-0"
          />
        </div>
      </div>
    </div>
  );
}

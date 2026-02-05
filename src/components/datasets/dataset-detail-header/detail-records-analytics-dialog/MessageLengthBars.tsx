/**
 * MessageLengthBars
 *
 * Visualizes average message lengths (system, user, assistant) as a stacked bar
 * with legend, matching the Overview Chart style.
 */

import { useMemo } from "react";

export interface MessageLengthBarsProps {
  system: number;
  user: number;
  assistant: number;
}

const ROLE_CONFIG = {
  system: { label: "System", color: "rgba(139, 92, 246, 0.7)", dotClass: "bg-violet-500" },
  user: { label: "User", color: "rgba(59, 130, 246, 0.7)", dotClass: "bg-blue-500" },
  assistant: { label: "Assistant", color: "rgba(16, 185, 129, 0.7)", dotClass: "bg-emerald-500" },
} as const;

export function MessageLengthBars({ system, user, assistant }: MessageLengthBarsProps) {
  const total = system + user + assistant;

  const segments = useMemo(() => {
    if (total === 0) return [];
    return [
      { role: "system" as const, value: system, percent: (system / total) * 100 },
      { role: "user" as const, value: user, percent: (user / total) * 100 },
      { role: "assistant" as const, value: assistant, percent: (assistant / total) * 100 },
    ].filter((s) => s.value > 0);
  }, [system, user, assistant, total]);

  if (total === 0) {
    return (
      <div className="text-xs text-muted-foreground">No message data available</div>
    );
  }

  return (
    <div>
      {/* Stacked Bar */}
      <div className="h-5 rounded-sm overflow-hidden flex mb-2">
        {segments.map((seg) => (
          <div
            key={seg.role}
            className="h-full transition-all"
            style={{
              width: `${seg.percent}%`,
              backgroundColor: ROLE_CONFIG[seg.role].color,
              minWidth: seg.percent > 0 ? "2px" : "0",
            }}
            title={`${ROLE_CONFIG[seg.role].label}: ${seg.value.toLocaleString()} chars (${Math.round(seg.percent)}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.role} className="flex items-center gap-1.5 text-xs">
            <div className={`w-2 h-2 rounded-sm shrink-0 ${ROLE_CONFIG[seg.role].dotClass}`} />
            <span className="text-muted-foreground">{ROLE_CONFIG[seg.role].label}</span>
            <span className="font-medium tabular-nums">{seg.value.toLocaleString()}</span>
            <span className="text-muted-foreground">({Math.round(seg.percent)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

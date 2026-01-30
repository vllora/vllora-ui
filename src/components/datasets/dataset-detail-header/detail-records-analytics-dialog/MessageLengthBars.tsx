/**
 * MessageLengthBars
 *
 * Visualizes average message lengths (system, user, assistant) as horizontal bars.
 */

export interface MessageLengthBarsProps {
  system: number;
  user: number;
  assistant: number;
}

export function MessageLengthBars({ system, user, assistant }: MessageLengthBarsProps) {
  const maxValue = Math.max(system, user, assistant, 1); // Prevent division by zero

  const bars = [
    { label: "System", value: system, color: "bg-violet-500" },
    { label: "User", value: user, color: "bg-blue-500" },
    { label: "Assistant", value: assistant, color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/30">
      {bars.map(({ label, value, color }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value.toLocaleString()} chars</span>
          </div>
          <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={`h-full ${color} rounded-full transition-all`}
              style={{ width: `${(value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

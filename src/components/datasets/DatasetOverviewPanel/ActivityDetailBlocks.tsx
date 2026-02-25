/**
 * ActivityDetailBlocks — Renders detail blocks (tag lists, metric grids,
 * distribution bars, KV lists, result footers) inside activity timeline entries.
 */

import { cn } from "@/lib/utils";
import type { ActivityDetailBlock } from "./types";
import { DETAIL_TONE_CLASS } from "./utils";

export function ActivityDetailBlocks({ blocks }: { blocks: ActivityDetailBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
      {blocks.map((block, idx) => {
        const sectionClass = cn("px-3 py-2.5", idx > 0 && "border-t border-border/40");

        if (block.type === "tag_list") {
          const maxVisible = block.maxVisible ?? 6;
          const visible = block.items.slice(0, maxVisible);
          const hiddenCount = Math.max(0, block.items.length - visible.length);
          return (
            <div key={idx} className={sectionClass}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                {block.title}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((item, i) => (
                  <span
                    key={`${item}-${i}`}
                    className="px-2 py-0.5 rounded-full bg-background/60 text-xs text-foreground/90 max-w-full truncate"
                    title={item}
                  >
                    {item}
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-background/50 text-xs text-muted-foreground">
                    +{hiddenCount} more
                  </span>
                )}
              </div>
            </div>
          );
        }

        if (block.type === "metric_grid") {
          return (
            <div key={idx} className={sectionClass}>
              {block.title && (
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                  {block.title}
                </div>
              )}
              <div className={cn("grid gap-x-4 gap-y-2", block.metrics.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                {block.metrics.map((metric, i) => (
                  <div key={`${metric.label}-${i}`} className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground/90">
                      {metric.label}
                    </div>
                    <div
                      className={cn(
                        "text-[11px] font-semibold truncate mt-0.5",
                        DETAIL_TONE_CLASS[metric.tone ?? "default"]
                      )}
                      title={metric.value}
                    >
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (block.type === "distribution_bars") {
          if (block.scoreStrip) {
            const total = block.bins.reduce((sum, bin) => sum + bin.value, 0);
            const max = Math.max(...block.bins.map((bin) => bin.value), 1);
            const meanPct =
              block.mean != null && Number.isFinite(block.mean)
                ? Math.max(0, Math.min(100, block.mean * 100))
                : undefined;
            const scorePalette = [
              "#ef4444", // red
              "#f97316", // orange
              "#eab308", // yellow
              "#84cc16", // lime
              "#10b981", // emerald
            ];

            return (
              <div key={idx} className={sectionClass}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                  {block.title}
                </div>

                <div className="space-y-1">
                  <div className="relative flex items-end h-9 gap-px rounded-md overflow-hidden bg-zinc-800/20 border border-border/40">
                    {block.bins.map((bin, i) => {
                      const heightPct = bin.value === 0 ? 0 : Math.max(15, (bin.value / max) * 100);
                      return (
                        <div key={`${bin.label}-${i}`} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                          <div
                            className="w-full rounded-t-sm relative"
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: scorePalette[i % scorePalette.length],
                              opacity: bin.value === 0 ? 0.12 : 0.88,
                            }}
                            title={`${bin.label}: ${bin.value}${total > 0 ? ` (${Math.round((bin.value / total) * 100)}%)` : ""}`}
                          >
                            {bin.value > 0 && (
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 drop-shadow-sm">
                                {bin.value}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {meanPct !== undefined && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-white/70"
                        style={{ left: `${meanPct}%` }}
                        title={`Mean ${Math.round((block.mean ?? 0) * 100)}%`}
                      >
                        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-white/80" />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between text-[9px] text-zinc-500 font-mono px-0.5">
                    <span>0.0</span>
                    <span>0.5</span>
                    <span>1.0</span>
                  </div>

                  {block.lowToHighLabels && (
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span>Low</span>
                      <span>High quality</span>
                    </div>
                  )}
                </div>

                {block.footer && (
                  <div className="mt-2 flex items-center justify-between gap-2 min-w-0">
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0">
                      Result
                    </span>
                    <span className="text-[10px] font-semibold text-[rgb(var(--theme-500))] truncate text-right" title={block.footer}>
                      {block.footer}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          const total = block.bins.reduce((sum, bin) => sum + bin.value, 0);
          const visibleBins = block.bins.slice(0, 5);
          const hiddenBins = block.bins.slice(5);
          const hiddenTotal = hiddenBins.reduce((sum, bin) => sum + bin.value, 0);
          const legendBins =
            hiddenBins.length > 0
              ? [...visibleBins.slice(0, 4), { label: `+${hiddenBins.length} more`, value: hiddenTotal }]
              : visibleBins;

          const palette = block.lowToHighLabels
            ? [
                "bg-red-500/70",
                "bg-orange-500/70",
                "bg-yellow-500/70",
                "bg-lime-500/70",
                "bg-emerald-500/70",
              ]
            : [
                "bg-slate-500/70",
                "bg-emerald-500/70",
                "bg-cyan-500/70",
                "bg-amber-500/70",
                "bg-blue-500/70",
              ];
          const dotPalette = block.lowToHighLabels
            ? [
                "bg-red-400",
                "bg-orange-400",
                "bg-yellow-400",
                "bg-lime-400",
                "bg-emerald-400",
              ]
            : [
                "bg-slate-400",
                "bg-emerald-400",
                "bg-cyan-400",
                "bg-amber-400",
                "bg-blue-400",
              ];

          return (
            <div key={idx} className={sectionClass}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                {block.title}
              </div>

              <div className="h-16 rounded-md border border-border/40 bg-background/50 p-2 flex flex-col justify-between">
                <div className="h-8 flex items-end gap-1">
                  {visibleBins.map((bin, i) => {
                    const pct = total > 0 ? (bin.value / total) * 100 : 0;
                    const height = bin.value > 0
                      ? Math.max(6, Math.round((pct / 100) * 28))
                      : 0;
                    return (
                      <div key={`${bin.label}-${i}`} className="flex-1 min-w-0 flex flex-col justify-end">
                        <div
                          className={cn("w-full rounded-sm", palette[i % palette.length])}
                          style={{ height: `${height}px` }}
                          title={`${bin.label}: ${bin.value}`}
                        />
                      </div>
                    );
                  })}
                </div>
                {block.lowToHighLabels && (
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                    <span>Low</span>
                    <span>High quality</span>
                  </div>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {legendBins.map((bin, i) => {
                  const pct = total > 0 ? Math.round((bin.value / total) * 100) : 0;
                  return (
                    <div key={`${bin.label}-${i}`} className="flex items-center gap-1 text-[10px]">
                      <span className={cn("w-1.5 h-1.5 rounded-sm", dotPalette[i % dotPalette.length])} />
                      <span className="text-muted-foreground truncate max-w-[92px]" title={bin.label}>
                        {bin.label}
                      </span>
                      <span className="text-foreground/80 tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
              </div>

              {block.footer && (
                <div className="mt-2 flex items-center justify-between gap-2 min-w-0">
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0">
                    Result
                  </span>
                  <span className="text-[10px] font-semibold text-[rgb(var(--theme-500))] truncate text-right" title={block.footer}>
                    {block.footer}
                  </span>
                </div>
              )}
            </div>
          );
        }

        if (block.type === "kv_list") {
          return (
            <div key={idx} className={sectionClass}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                {block.title}
              </div>
              <div className="divide-y divide-border/30">
                {block.rows.map((row, i) => (
                  <div
                    key={`${row.key}-${i}`}
                    className={cn(
                      "flex items-center justify-between gap-2",
                      i === 0 ? "pt-0 pb-1.5" : "py-1.5"
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground">{row.key}</span>
                    <span className="text-[10px] font-medium text-foreground truncate text-right max-w-[65%]" title={row.value}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div
            key={idx}
            className={sectionClass}
          >
            {block.title && (
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {block.title}
              </div>
            )}
            <div className={cn("text-xs font-medium", block.tone && DETAIL_TONE_CLASS[block.tone])}>
              {block.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

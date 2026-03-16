/**
 * DataFlowBanner
 *
 * Horizontal pipeline banner showing the data generation flow:
 * Documents → Extracted Parts → Topics → Records
 *
 * Matches the mockup design: equal-width stage cards with colored icon boxes,
 * large count numbers, detail text, and gradient flow arrows between stages.
 *
 * Three states:
 * - normal: real counts and details
 * - empty: all stages dimmed, first stage shows "No documents yet"
 * - extracting: documents stage active, extracted stage has shimmer, rest dimmed
 */

import { FileText, Layers, Tags, MessageSquare, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./dataset-detail-header/ViewModeToggle";

export type BannerState = "normal" | "empty" | "extracting";

interface FlowStageConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  viewMode?: ViewMode;
  /** Icon box colors: [bg, text] */
  colors: [string, string];
}

const FLOW_STAGES: FlowStageConfig[] = [
  {
    id: "documents",
    icon: <FileText className="w-4 h-4" />,
    label: "Documents",
    colors: ["bg-red-500/15", "text-red-400"],
  },
  {
    id: "extracted",
    icon: <Layers className="w-4 h-4" />,
    label: "Extracted",
    viewMode: "sources",
    colors: ["bg-amber-500/15", "text-amber-400"],
  },
  {
    id: "topics",
    icon: <Tags className="w-4 h-4" />,
    label: "Topics",
    viewMode: "canvas",
    colors: ["bg-[rgba(var(--theme-500),0.15)]", "text-[rgb(var(--theme-500))]"],
  },
  {
    id: "records",
    icon: <MessageSquare className="w-4 h-4" />,
    label: "Records",
    viewMode: "table",
    colors: ["bg-emerald-500/15", "text-emerald-400"],
  },
];

export interface DataFlowBannerProps {
  state: BannerState;
  activeViewMode: ViewMode;
  onNavigate: (mode: ViewMode) => void;
  documentCount: number;
  partCount: number;
  topicCount: number;
  recordCount: number;
  documentDetail?: string;
  partDetail?: string;
  topicDetail?: string;
  recordDetail?: string;
}

export function DataFlowBanner({
  state,
  activeViewMode,
  onNavigate,
  documentCount,
  partCount,
  topicCount,
  recordCount,
  documentDetail,
  partDetail,
  topicDetail,
  recordDetail,
}: DataFlowBannerProps) {
  const stageData: Record<string, { count: number; detail?: string }> = {
    documents: { count: documentCount, detail: documentDetail },
    extracted: { count: partCount, detail: partDetail },
    topics: { count: topicCount, detail: topicDetail },
    records: { count: recordCount, detail: recordDetail },
  };

  return (
    <div className="flex items-center px-6 py-4 border-b border-border/50 bg-card/50 shrink-0">
      {FLOW_STAGES.map((stage, index) => {
        const data = stageData[stage.id];
        const isActive = stage.viewMode === activeViewMode;
        const isDimmed = state === "empty" || (state === "extracting" && index > 1);
        const isExtracting = state === "extracting" && stage.id === "extracted";
        const isClickable = stage.viewMode !== undefined && state !== "empty";

        return (
          <div key={stage.id} className="flex items-center flex-1 min-w-0 last:flex-1">
            {/* Flow arrow between stages */}
            {index > 0 && <FlowArrow isDimmed={isDimmed} />}

            {/* Stage card */}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => { if (stage.viewMode) onNavigate(stage.viewMode); }}
              className={cn(
                "flex-1 flex flex-col gap-1.5 px-4 py-3 rounded-[10px] transition-all min-w-0",
                isActive && "bg-[rgba(var(--theme-500),0.08)]",
                !isActive && isClickable && "hover:bg-muted/50",
                isDimmed && "opacity-40",
                isExtracting && "animate-pulse",
                !isClickable && "cursor-default",
              )}
            >
              {/* Header: icon box + label */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  isDimmed ? "bg-muted/50 text-muted-foreground/50" : stage.colors[0],
                  !isDimmed && stage.colors[1],
                )}>
                  {stage.icon}
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {stage.label}
                  </span>
                  {/* Large count value */}
                  {state === "empty" && index === 0 ? (
                    <span className="text-lg font-semibold text-muted-foreground/50 leading-none">—</span>
                  ) : state === "empty" ? (
                    <span className="text-lg font-semibold text-muted-foreground/30 leading-none">—</span>
                  ) : isExtracting ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80 leading-none">
                      extracting
                    </span>
                  ) : (
                    <span className={cn(
                      "text-xl font-semibold leading-none tabular-nums",
                      isActive ? "text-[rgb(var(--theme-500))]" : "text-foreground",
                    )}>
                      {data.count}
                    </span>
                  )}
                </div>
              </div>

              {/* Detail line */}
              {state === "empty" && index === 0 ? (
                <span className="text-[11px] text-muted-foreground/50 truncate">No documents yet</span>
              ) : state === "empty" ? (
                <span className="text-[11px] text-muted-foreground/30 truncate">waiting</span>
              ) : data.detail ? (
                <span className="text-[11px] text-muted-foreground/70 truncate">{data.detail}</span>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Gradient flow arrow between stages */
function FlowArrow({ isDimmed }: { readonly isDimmed: boolean }) {
  return (
    <div className="w-10 shrink-0 flex items-center justify-center relative">
      {/* Gradient line */}
      <div className={cn(
        "absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 rounded-full",
        isDimmed
          ? "bg-gradient-to-r from-transparent via-border/30 to-transparent"
          : "bg-gradient-to-r from-transparent via-border to-transparent",
      )} />
      {/* Chevron */}
      <div className="relative z-10 bg-card/50 px-0.5">
        <ChevronRight className={cn(
          "w-4 h-4",
          isDimmed ? "text-muted-foreground/20" : "text-muted-foreground/50",
        )} />
      </div>
    </div>
  );
}

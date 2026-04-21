/**
 * PipelineStrip
 *
 * Five-stage clickable pipeline summary for the Overview tab. Mirrors the
 * design mock's dense `.pipestrip` — each stage carries label + count,
 * big-number value with unit subtitle, a sub-metric line, and a progress
 * bar. Counts come from already-loaded contexts (no extra fetches);
 * clicking a stage emits `vllora_switch_tab` to navigate.
 *
 * Tab routing:
 *   Sources → knowledge
 *   Knowledge parts → knowledge (same root)
 *   Topics → records
 *   Records → records
 *   Training → jobs
 */

import { Fragment } from "react";
import { ChevronRight, FileText, Layers, Tags, MessageSquare, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type StageId = "sources" | "parts" | "topics" | "records" | "training";

interface PipelineStripProps {
  workflowId: string;
  sourcesCount: number;
  partsCount: number;
  topicsCount: number;
  recordsCount: number;
  trainingCount: number;
  /** Extra signals that flesh out sub-metrics and progress bars. */
  docsCount?: number;
  servicesCount?: number;
  topicsWithPartsPercent?: number;
  reviewCount?: number;
  qualityPercent?: number;
  trainingActive?: boolean;
  trainingStatus?: string;
  trainingModel?: string;
  trainingProgress?: number;
  /** Optional active stage to highlight (e.g., when a tab is open). */
  activeStage?: StageId;
  onSwitchTab: (tab: string) => void;
}

interface StageInfo {
  id: StageId;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit: string;
  sub?: string;
  progressPercent: number;
  tab: string;
  tooltip: string;
}

function stageToneClasses(active: boolean): {
  container: string;
  label: string;
  icon: string;
} {
  if (active) {
    return {
      container: "border-emerald-500/30 bg-emerald-500/[0.08]",
      label: "text-emerald-300",
      icon: "text-emerald-300",
    };
  }
  return {
    container: "border-border/60 bg-card/40 hover:bg-card/60",
    label: "text-muted-foreground/70",
    icon: "text-muted-foreground/60",
  };
}

interface StageCardProps {
  info: StageInfo;
  active: boolean;
  pulse?: boolean;
  onClick: () => void;
}

function StageCard({ info, active, pulse, onClick }: StageCardProps) {
  const Icon = info.icon;
  const tones = stageToneClasses(active);
  const progress = Math.max(0, Math.min(100, info.progressPercent));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "group flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 rounded-md border px-3 py-2 text-left transition-colors",
            tones.container,
          )}
        >
          <div className="flex items-center gap-2">
            <Icon className={cn("h-3 w-3 shrink-0", tones.icon, pulse && "animate-pulse")} />
            <span
              className={cn(
                "truncate text-[9px] font-semibold uppercase tracking-[0.08em]",
                tones.label,
              )}
            >
              {info.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-[16px] font-semibold leading-none tabular-nums",
                info.progressPercent === 0 ? "text-muted-foreground/40" : "text-foreground",
              )}
            >
              {info.value}
            </span>
            <span className="truncate text-[9.5px] text-muted-foreground/70">{info.unit}</span>
          </div>
          {info.sub && (
            <div className="truncate text-[10px] text-muted-foreground/60">{info.sub}</div>
          )}
          <div className="mt-auto h-0.5 overflow-hidden rounded-full bg-muted/40">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                active ? "bg-emerald-400" : "bg-emerald-500/60",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px]">
        <p className="text-xs">{info.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function buildStages(props: PipelineStripProps): StageInfo[] {
  const {
    sourcesCount,
    partsCount,
    topicsCount,
    recordsCount,
    trainingCount,
    docsCount,
    servicesCount,
    topicsWithPartsPercent,
    reviewCount,
    qualityPercent,
    trainingStatus,
    trainingModel,
    trainingProgress,
  } = props;

  const docsLine =
    docsCount != null && servicesCount != null
      ? `${docsCount} docs · ${servicesCount} services`
      : docsCount != null
        ? `${docsCount} docs`
        : "documents + traces";

  return [
    {
      id: "sources",
      icon: FileText,
      label: "Sources",
      value: sourcesCount.toLocaleString(),
      unit: sourcesCount === 1 ? "source" : "sources",
      sub: docsLine,
      progressPercent: sourcesCount > 0 ? 100 : 0,
      tab: "knowledge",
      tooltip: "Knowledge sources (PDFs and OTel traces) attached to this workflow.",
    },
    {
      id: "parts",
      icon: Layers,
      label: "Knowledge parts",
      value: partsCount.toLocaleString(),
      unit: "extracted units",
      sub: partsCount > 0 ? "chunks · moments · traces" : undefined,
      progressPercent: partsCount > 0 ? 100 : 0,
      tab: "knowledge",
      tooltip: "Total extracted chunks (text, tables, images, OTel moments) across all sources.",
    },
    {
      id: "topics",
      icon: Tags,
      label: "Topics",
      value: topicsCount.toLocaleString(),
      unit: topicsCount === 1 ? "topic" : "topics",
      sub:
        topicsWithPartsPercent != null
          ? `${Math.round(topicsWithPartsPercent)}% have linked parts`
          : undefined,
      progressPercent: topicsWithPartsPercent ?? (topicsCount > 0 ? 100 : 0),
      tab: "records",
      tooltip: "Leaf topics in the curriculum hierarchy. Open the records canvas to inspect.",
    },
    {
      id: "records",
      icon: MessageSquare,
      label: "Records",
      value: recordsCount.toLocaleString(),
      unit: "training rows",
      sub:
        qualityPercent != null && reviewCount != null
          ? `${Math.round(qualityPercent)}% quality · ${reviewCount} need review`
          : undefined,
      progressPercent: qualityPercent ?? (recordsCount > 0 ? 100 : 0),
      tab: "records",
      tooltip: "Training records generated for this workflow.",
    },
    {
      id: "training",
      icon: Cpu,
      label: "Training",
      value: trainingCount.toLocaleString(),
      unit: trainingCount === 1 ? "job" : "jobs",
      sub:
        trainingStatus && trainingModel
          ? `${trainingStatus} · ${trainingModel}`
          : trainingStatus
            ? trainingStatus
            : trainingCount > 0
              ? "finetune runs recorded"
              : "not started yet",
      progressPercent: trainingProgress ?? (trainingCount > 0 ? 100 : 0),
      tab: "jobs",
      tooltip: "Finetune jobs launched against this workflow.",
    },
  ];
}

export function PipelineStrip(props: PipelineStripProps) {
  const stages = buildStages(props);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex items-stretch gap-1 border-b border-border bg-zinc-900/30 px-3 py-2">
        {stages.map((stage, i) => (
          <Fragment key={stage.id}>
            <StageCard
              info={stage}
              active={props.activeStage === stage.id}
              pulse={stage.id === "training" && props.trainingActive}
              onClick={() => props.onSwitchTab(stage.tab)}
            />
            {i < stages.length - 1 && (
              <div className="flex shrink-0 items-center px-1 text-muted-foreground/30">
                <ChevronRight className="h-3 w-3" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </TooltipProvider>
  );
}

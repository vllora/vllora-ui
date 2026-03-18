/**
 * Shared cell components used by both UnifiedRecordTable (grouped/hierarchy view)
 * and TopicDetailView (leaf topic flat table).
 *
 * Single source of truth for: ScorePill, TrendArrow, ScoreCell, JobColumnHeader,
 * SourcePartsCell, and getRecordSourceParts.
 */

import { useMemo } from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolvePartRef } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import type { KnowledgeSource } from "@/types/knowledge-types";
import type { DatasetRecord } from "@/types/dataset-types";
import type { JobColumn, RecordJobScore } from "./job-score-columns";
import { JobStatusBadge } from "../shared/JobStatusBadge";
import type { JobStatusType } from "../shared/JobStatusBadge";

// ─── Score Pill ───

export function ScorePill({ score }: { readonly score: number }) {
  const bg = score >= 0.8
    ? "bg-emerald-500/15 text-emerald-400"
    : score >= 0.6
      ? "bg-amber-500/15 text-amber-400"
      : "bg-red-500/15 text-red-400";

  return (
    <span className={cn("inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium font-mono tabular-nums", bg)}>
      {score.toFixed(2)}
    </span>
  );
}

export function FallbackScorePill({ score }: { readonly score?: number }) {
  if (score === undefined) return <span className="text-muted-foreground/30">—</span>;
  return <ScorePill score={score} />;
}

// ─── Trend Arrow ───

export function TrendArrow({ trend }: { readonly trend: number }) {
  if (trend > 0.005) return <span className="text-[9px] text-emerald-400 font-mono">↑</span>;
  if (trend < -0.005) return <span className="text-[9px] text-red-400 font-mono">↓</span>;
  return null;
}

// ─── Score Cell (per-job score with status) ───

export function ScoreCell({ jobScore }: { readonly jobScore?: RecordJobScore }) {
  if (!jobScore) return <span className="text-muted-foreground/20">—</span>;

  if (jobScore.status === "queued") {
    return <span className="text-[10px] text-muted-foreground/30 italic">queued</span>;
  }

  if (jobScore.status === "running") {
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="w-3 h-3 text-primary animate-spin" />
        {jobScore.score !== undefined ? (
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">
            {jobScore.score.toFixed(2)}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40 italic">pending</span>
        )}
      </span>
    );
  }

  if (jobScore.status === "failed") {
    return <span className="text-[10px] text-red-400/60">failed</span>;
  }

  if (jobScore.score === undefined) {
    return <span className="text-muted-foreground/20">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <ScorePill score={jobScore.score} />
      {jobScore.trend !== undefined && <TrendArrow trend={jobScore.trend} />}
    </span>
  );
}

// ─── Job Column Header ───

export function JobColumnHeader({ column }: { readonly column: JobColumn }) {
  const status = column.status as JobStatusType | undefined;
  const isActiveStatus = status === "running" || status === "queued";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium normal-case tracking-normal">{column.label}</span>
      {isActiveStatus && status ? (
        <JobStatusBadge status={status} />
      ) : (
        <span className="text-[8px] text-muted-foreground/40 normal-case tracking-normal">
          {column.type === "eval" ? "evaluation" : "finetune"}
        </span>
      )}
    </div>
  );
}

// ─── Source Parts ───

/** Extract source_parts from record metadata (checks both `source_parts` array and `sourceChunkRef` string) */
export function getRecordSourceParts(record: DatasetRecord): string[] {
  const meta = record.metadata as Record<string, unknown> | undefined;
  const parts = meta?.source_parts ?? meta?.sourceChunkRef;
  if (Array.isArray(parts)) return parts.filter((p): p is string => typeof p === "string");
  if (typeof parts === "string") return [parts];
  return [];
}

/** Clickable source badges — resolves refs to actual source/part names, navigates to Sources view on click */
export function SourcePartsCell({
  resolvedParts,
  unresolvedCount,
}: {
  readonly resolvedParts: readonly { source: { id: string; name: string }; part: { id: string; title?: string; extractionPath?: string } }[];
  readonly unresolvedCount: number;
}) {
  if (resolvedParts.length === 0 && unresolvedCount === 0) {
    return <span className="text-muted-foreground/20">—</span>;
  }

  if (resolvedParts.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
        <FileText className="w-3 h-3 shrink-0 opacity-40" />
        {unresolvedCount} part{unresolvedCount !== 1 ? "s" : ""}
      </span>
    );
  }

  // Group by source document to detect cross-document refs
  const bySource = new Map<string, string[]>();
  for (const r of resolvedParts) {
    const partLabel = r.part.title ?? r.part.extractionPath ?? "untitled";
    const existing = bySource.get(r.source.name);
    if (existing) {
      existing.push(partLabel);
    } else {
      bySource.set(r.source.name, [partLabel]);
    }
  }

  const sourceCount = bySource.size;
  const tooltip = [...bySource.entries()]
    .map(([doc, parts]) => `${doc}: ${parts.join(", ")}`)
    .join("\n");

  const label = sourceCount === 1
    ? resolvedParts.length === 1
      ? (resolvedParts[0].part.title ?? resolvedParts[0].source.name)
      : `${resolvedParts[0].part.title ?? resolvedParts[0].source.name} +${resolvedParts.length - 1}`
    : `${sourceCount} docs · ${resolvedParts.length} parts`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const first = resolvedParts[0];
    window.dispatchEvent(new CustomEvent("vllora_navigate_to_source", {
      detail: { sourceId: first.source.id, partId: first.part.id },
    }));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5 max-w-[160px] truncate hover:bg-primary/10 hover:text-foreground/80 transition-colors cursor-pointer"
      title={`${tooltip}\n\nClick to view in Sources`}
    >
      <FileText className="w-3 h-3 shrink-0 opacity-50" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Hook-like helper: resolve a record's source_parts refs against knowledge sources */
export function useResolvedSourceParts(
  record: DatasetRecord,
  sources: readonly KnowledgeSource[],
) {
  const partRefs = useMemo(() => getRecordSourceParts(record), [record]);
  const resolvedParts = useMemo(() => {
    if (partRefs.length === 0 || sources.length === 0) return [];
    return partRefs
      .map(ref => resolvePartRef(ref, sources))
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [partRefs, sources]);

  return { partRefs, resolvedParts };
}

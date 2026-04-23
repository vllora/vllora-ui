import { cn } from "@/lib/utils";

export type JobStatusType = "running" | "queued" | "completed" | "failed" | "cancelled";

const STATUS_CONFIG: Record<JobStatusType, { label: string; color: string }> = {
  running: { label: "running", color: "bg-blue-500/15 text-blue-400" },
  queued: { label: "queued", color: "bg-amber-500/15 text-amber-400" },
  completed: { label: "done", color: "bg-emerald-500/15 text-emerald-400" },
  failed: { label: "failed", color: "bg-red-500/15 text-red-400" },
  cancelled: { label: "cancelled", color: "bg-zinc-500/15 text-zinc-400" },
};

/**
 * Maps raw API status strings (eval/finetune) to normalized JobStatusType.
 * Eval: "running" | "completed" | "failed"
 * Finetune: "running" | "succeeded" | "failed" | "pending"
 */
export function normalizeJobStatus(status: string): JobStatusType {
  if (status === "running") return "running";
  if (status === "completed" || status === "succeeded") return "completed";
  if (status === "failed") return "failed";
  if (status === "pending" || status === "queued") return "queued";
  if (status === "cancelled") return "cancelled";
  return "queued"; // fallback for unknown statuses
}

export function JobStatusBadge({
  status,
  className,
}: {
  readonly status: JobStatusType;
  readonly className?: string;
}) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-px rounded-full font-medium shrink-0",
        config.color,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

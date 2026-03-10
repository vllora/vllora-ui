/**
 * EvaluatorVersionHistory
 *
 * Shows the version history of the JS evaluator/grader for a dataset.
 * Displays version list with timestamps and git-style diffs between versions.
 */

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  getEvaluatorVersions,
  type EvaluatorVersionResponse,
} from "@/services/finetune-api";

interface EvaluatorVersionHistoryProps {
  backendDatasetId: string;
  className?: string;
  /** Callback when a version is selected (e.g., for picking evaluator_version in training) */
  onVersionSelect?: (version: number) => void;
  /** Currently selected version (for highlighting) */
  selectedVersion?: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");

  return (
    <div className="mt-2 rounded border border-[#262626] bg-[#0a0a0a] overflow-x-auto">
      <pre className="text-[11px] font-mono leading-relaxed p-3">
        {lines.map((line, i) => {
          let lineClass = "text-slate-500";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            lineClass = "text-emerald-400 bg-emerald-500/5";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            lineClass = "text-red-400 bg-red-500/5";
          } else if (line.startsWith("@@")) {
            lineClass = "text-blue-400";
          } else if (line.startsWith("diff") || line.startsWith("---") || line.startsWith("+++")) {
            lineClass = "text-slate-400 font-bold";
          }

          return (
            <div key={i} className={cn("px-1", lineClass)}>
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

export function EvaluatorVersionHistory({
  backendDatasetId,
  className,
  onVersionSelect,
  selectedVersion,
}: EvaluatorVersionHistoryProps) {
  const [versions, setVersions] = useState<EvaluatorVersionResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [isSectionExpanded, setIsSectionExpanded] = useState(false);

  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getEvaluatorVersions(backendDatasetId);
      setVersions(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch versions");
    } finally {
      setIsLoading(false);
    }
  }, [backendDatasetId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-zinc-500 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading evaluator versions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-zinc-500">
        <span className="text-xs">{error.includes("404") ? "No evaluator versions found" : error}</span>
        <button
          onClick={fetchVersions}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  if (versions.length <= 1) {
    return null;
  }

  return (
    <div className={cn("rounded-lg bg-[#111] overflow-hidden", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsSectionExpanded((prev) => !prev)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsSectionExpanded((prev) => !prev); }}
        className="w-full px-4 py-3 border-b border-white/5 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {isSectionExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          )}
          <Code2 className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-300">
            Evaluator Versions ({versions.length})
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); fetchVersions(); }}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-white/5"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {isSectionExpanded && <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
        {versions.map((version) => {
          const isExpanded = expandedVersion === version.version;
          const isSelected = selectedVersion === version.version;
          const isLatest = version.version === versions[0]?.version;
          // Don't show diff for v1 (initial version) — it's just the full file as additions
          const hasMeaningfulDiff = version.diff != null && version.version > 1;

          return (
            <div key={version.id} className="group">
              <button
                onClick={() => {
                  if (hasMeaningfulDiff) {
                    setExpandedVersion(isExpanded ? null : version.version);
                  }
                  onVersionSelect?.(version.version);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors",
                  isSelected && "bg-emerald-500/5 border-l-2 border-emerald-500"
                )}
              >
                {hasMeaningfulDiff ? (
                  isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  )
                ) : (
                  <div className="w-3.5" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-slate-300">
                      v{version.version}
                    </span>
                    {isLatest && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                        latest
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {version.config.type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 shrink-0">
                  <Clock className="h-3 w-3" />
                  {formatDate(version.created_at)}
                </div>
              </button>

              {isExpanded && hasMeaningfulDiff && (
                <div className="px-4 pb-3">
                  <DiffView diff={version.diff!} />
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
}

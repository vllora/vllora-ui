/**
 * BaselineComparisonPanel
 *
 * Clean table-first comparison: baseline eval vs best training epoch.
 * Designed to answer: "Is my model good enough now? Which topics still need work?"
 *
 * No charts — the Score Trend and By Topic tabs already handle visualization.
 * This tab shows the decision-relevant comparison in a scannable table.
 */

import { useMemo, useState, useCallback } from "react";
import { useRequest } from "ahooks";
import { Loader2, AlertCircle, ArrowUp, ArrowDown } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import {
  getEvaluationResult,
  getFinetuneEvaluations,
} from "@/services/finetune-api";
import { cn } from "@/lib/utils";
import {
  buildRecordTopicMap,
  extractBaselineScores,
  extractEpochScores,
  computeTopicComparisons,
  sortComparisons,
} from "./baseline-comparison-helpers";
import type { SortField, SortDir } from "./baseline-comparison-helpers";

// ─── Score quality bands (same as eval results page) ─────────────────────────

function scoreBg(score: number): string {
  if (score >= 0.8) return "bg-emerald-500/15 text-emerald-400";
  if (score >= 0.6) return "bg-amber-500/10 text-amber-400";
  return "bg-red-500/10 text-red-400";
}

function changeIndicator(delta: number): { text: string; color: string } {
  if (delta > 0.005) return { text: `+${(delta * 100).toFixed(1)}`, color: "text-emerald-400" };
  if (delta < -0.005) return { text: `${(delta * 100).toFixed(1)}`, color: "text-red-400" };
  return { text: "—", color: "text-zinc-600" };
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface BaselineComparisonPanelProps {
  readonly workflowId: string;
  readonly baselineEvalId: string;
  readonly finetuneJobId: string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function BaselineComparisonPanel({
  workflowId,
  baselineEvalId,
  finetuneJobId,
}: BaselineComparisonPanelProps) {
  const { sortedRecords } = DatasetDetailConsumer();
  const [sortField, setSortField] = useState<SortField>("delta");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: baselineData, loading: bL, error: bE } = useRequest(
    () => getEvaluationResult(baselineEvalId), { refreshDeps: [baselineEvalId] },
  );
  const { data: finetuneData, loading: fL, error: fE } = useRequest(
    () => getFinetuneEvaluations(workflowId, finetuneJobId), { refreshDeps: [workflowId, finetuneJobId] },
  );

  const recordTopicMap = useMemo(() => buildRecordTopicMap(sortedRecords), [sortedRecords]);

  const comparisons = useMemo(() => {
    if (!baselineData?.results || !finetuneData?.results) return [];
    return computeTopicComparisons(
      extractBaselineScores(baselineData.results),
      extractEpochScores(finetuneData.results),
      recordTopicMap,
    );
  }, [baselineData, finetuneData, recordTopicMap]);

  const summary = useMemo(() => {
    if (comparisons.length === 0) return null;
    const totalW = comparisons.reduce((s, c) => s + c.baselineMean * c.baselineCount, 0);
    const totalN = comparisons.reduce((s, c) => s + c.baselineCount, 0);
    const bAvg = totalN > 0 ? totalW / totalN : 0;
    const bestW = comparisons.reduce((s, c) => s + c.bestEpochMean * c.baselineCount, 0);
    const bestAvg = totalN > 0 ? bestW / totalN : 0;
    const imp = comparisons.filter((c) => c.delta > 0.005).length;
    const reg = comparisons.filter((c) => c.delta < -0.005).length;
    const needsWork = comparisons.filter((c) => c.bestEpochMean < 0.6).length;
    return { bAvg, bestAvg, epoch: comparisons[0]?.bestEpoch ?? 0, imp, reg, total: comparisons.length, needsWork };
  }, [comparisons]);

  const sorted = useMemo(() => sortComparisons(comparisons, sortField, sortDir), [comparisons, sortField, sortDir]);

  const handleSort = useCallback((f: SortField) => {
    setSortField((prev) => {
      if (prev === f) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir("desc");
      return f;
    });
  }, []);

  if (bL || fL) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading comparison...</span>
      </div>
    );
  }

  if (bE || fE) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-red-400 bg-red-500/10 rounded-lg">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{(bE ?? fE) instanceof Error ? (bE ?? fE)!.message : "Failed to load comparison data"}</span>
      </div>
    );
  }

  if (!summary || comparisons.length === 0) return null;

  const overallDelta = summary.bestAvg - summary.bAvg;
  const isUp = overallDelta > 0.005;

  return (
    <div className="rounded-lg bg-[#0d0d0d] border border-white/[0.04] overflow-hidden">
      {/* ── Summary sentence — plain English ── */}
      <div className="px-4 py-3 border-b border-white/[0.04]">
        <p className="text-[13px] text-zinc-300">
          Overall score went from{" "}
          <span className="font-mono font-semibold">{summary.bAvg.toFixed(2)}</span>
          {" → "}
          <span className={cn("font-mono font-semibold", isUp ? "text-emerald-400" : "text-red-400")}>
            {summary.bestAvg.toFixed(2)}
          </span>
          {" "}at epoch {summary.epoch}.{" "}
          <span className="text-zinc-500">
            {summary.imp} improved, {summary.reg} regressed
            {summary.needsWork > 0 && <>, <span className="text-amber-400">{summary.needsWork} still below 0.6</span></>}
          </span>
        </p>
      </div>

      {/* ── Comparison table ── */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <ColHeader field="topic" label="Topic" cur={sortField} dir={sortDir} onSort={handleSort} align="left" />
            <ColHeader field="baselineMean" label="Before" cur={sortField} dir={sortDir} onSort={handleSort} />
            <ColHeader field="bestEpochMean" label="After" cur={sortField} dir={sortDir} onSort={handleSort} />
            <ColHeader field="delta" label="Change" cur={sortField} dir={sortDir} onSort={handleSort} />
            <th className="px-3 py-2 text-right text-[10px] text-zinc-600 font-medium w-[40px]">n</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const change = changeIndicator(c.delta);
            return (
              <tr key={c.topic} className="border-b border-white/[0.02] hover:bg-white/[0.015] transition-colors">
                {/* Topic name — full width, readable */}
                <td className="px-3 py-2 text-[12px] text-zinc-300 max-w-[260px]" title={c.topic}>
                  <span className="block truncate">{c.topic}</span>
                </td>
                {/* Before score — pill with quality color */}
                <td className="px-3 py-2 text-right">
                  <span className={cn("inline-block px-2 py-0.5 rounded font-mono text-[11px] font-medium", scoreBg(c.baselineMean))}>
                    {c.baselineMean.toFixed(2)}
                  </span>
                </td>
                {/* After score — pill with quality color */}
                <td className="px-3 py-2 text-right">
                  <span className={cn("inline-block px-2 py-0.5 rounded font-mono text-[11px] font-medium", scoreBg(c.bestEpochMean))}>
                    {c.bestEpochMean.toFixed(2)}
                  </span>
                </td>
                {/* Change — arrow + number */}
                <td className="px-3 py-2 text-right">
                  <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] font-medium", change.color)}>
                    {c.delta > 0.005 && <ArrowUp className="h-3 w-3" />}
                    {c.delta < -0.005 && <ArrowDown className="h-3 w-3" />}
                    {change.text}
                  </span>
                </td>
                {/* Count */}
                <td className="px-3 py-2 text-right text-[10px] text-zinc-600 tabular-nums">
                  {c.baselineCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Column header ───────────────────────────────────────────────────────────

function ColHeader({ field, label, cur, dir, onSort, align = "right" }: {
  readonly field: SortField;
  readonly label: string;
  readonly cur: SortField;
  readonly dir: SortDir;
  readonly onSort: (f: SortField) => void;
  readonly align?: "left" | "right";
}) {
  const active = cur === field;
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] font-medium cursor-pointer select-none hover:text-zinc-200 transition-colors",
        align === "left" ? "text-left" : "text-right",
        active ? "text-zinc-300" : "text-zinc-500",
      )}
      onClick={() => onSort(field)}
    >
      {label}
      {active && <span className="ml-0.5">{dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
    </th>
  );
}

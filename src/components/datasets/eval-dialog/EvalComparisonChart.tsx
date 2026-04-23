/**
 * EvalComparisonChart
 *
 * Shows avg score trend across multiple eval runs as an area chart.
 * X-axis: eval run labels, Y-axis: avg score (0-1) with score zones.
 */

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type { EvalJob } from "@/types/eval-job";
import { evalJobDisplayName } from "@/lib/job-display-name";

interface EvalComparisonChartProps {
  readonly jobs: readonly EvalJob[];
}

interface RunData {
  name: string;
  avgScore: number;
  samples: number;
  date: string;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RunData }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 shadow-lg space-y-0.5">
      <div className="text-[11px] text-zinc-200 font-medium">{d.name}</div>
      <div className="text-[11px] text-zinc-400">
        Score: <span className="font-mono font-semibold text-zinc-200">{d.avgScore.toFixed(3)}</span>
      </div>
      <div className="text-[11px] text-zinc-500">{d.samples} samples · {d.date}</div>
    </div>
  );
}

export function EvalComparisonChart({ jobs }: EvalComparisonChartProps) {
  const data = useMemo<RunData[]>(() => {
    return [...jobs]
      .filter((j) => j.status === "completed" && j.result)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((job) => ({
        name: evalJobDisplayName(job.id),
        avgScore: job.result!.statistics.mean,
        samples: job.result!.samplesEvaluated,
        date: new Date(job.createdAt).toLocaleDateString(),
      }));
  }, [jobs]);

  if (data.length < 2) return null;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="evalScoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 9, fill: "#52525b", fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            width={28}
            ticks={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
          />
          <RechartsTooltip content={<ChartTooltip />} />
          {/* Score zones */}
          <ReferenceArea y1={0.8} y2={1} fill="#10b981" fillOpacity={0.04} />
          <ReferenceArea y1={0.6} y2={0.8} fill="#eab308" fillOpacity={0.03} />
          <ReferenceArea y1={0} y2={0.6} fill="#ef4444" fillOpacity={0.03} />
          <ReferenceLine y={0.8} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.3} />
          <ReferenceLine y={0.6} stroke="#eab308" strokeDasharray="3 3" strokeOpacity={0.3} />
          <Area
            type="monotone"
            dataKey="avgScore"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#evalScoreGradient)"
            dot={{ r: 4, fill: "#10b981", stroke: "#0a0a0a", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "#10b981", stroke: "#0a0a0a", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

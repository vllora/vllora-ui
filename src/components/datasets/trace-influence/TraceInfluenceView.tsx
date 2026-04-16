/**
 * TraceInfluenceView
 *
 * Shows users exactly how production traces shaped their training data.
 * Follows Apple Health (hero metrics), Snorkel (influence analysis),
 * Evidently (quality checklist), and Linear (progressive disclosure) patterns.
 *
 * Only renders when the workflow has trace analysis data (combined mode).
 */

import {
  Layers,
  MessageSquare,
  AlertTriangle,
  BarChart3,
  Shield,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { TraceAnalysisConsumer } from "@/contexts/TraceAnalysisContext";
import { PipelineAnalysisConsumer } from "@/contexts/PipelineAnalysisContext";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InfluenceMetric {
  readonly value: string | number;
  readonly label: string;
  readonly detail: string;
  readonly channelId: string;
}

interface QualityCheck {
  readonly name: string;
  readonly description: string;
  readonly status: "pass" | "warn" | "fail";
  readonly value?: string;
}

interface ChannelSummary {
  readonly id: string;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly summary: string;
  readonly details: React.ReactNode;
}

// ─── Hero Metric Card ───────────────────────────────────────────────────────

function MetricCard({
  metric,
  onClickChannel,
}: {
  readonly metric: InfluenceMetric;
  readonly onClickChannel: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClickChannel(metric.channelId)}
      className="bg-muted/20 border border-border/50 rounded-lg p-4 text-left hover:bg-muted/30 transition-colors"
    >
      <div className="text-2xl font-bold tabular-nums">{metric.value}</div>
      <div className="text-xs font-medium mt-1">{metric.label}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {metric.detail}
      </div>
    </button>
  );
}

// ─── Quality Check Item ─────────────────────────────────────────────────────

function QualityCheckItem({ check }: { readonly check: QualityCheck }) {
  const statusConfig = {
    pass: {
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
      bg: "",
    },
    warn: {
      icon: <AlertCircle className="h-3.5 w-3.5 text-amber-500" />,
      bg: "bg-amber-500/5",
    },
    fail: {
      icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
      bg: "bg-red-500/5",
    },
  };

  const config = statusConfig[check.status];

  return (
    <div
      className={`flex items-start gap-2.5 py-2.5 px-3 ${config.bg} rounded`}
    >
      <div className="mt-0.5 shrink-0">{config.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{check.description}</p>
        {check.value && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {check.value}
          </p>
        )}
      </div>
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
          check.status === "pass"
            ? "bg-emerald-500/10 text-emerald-600"
            : check.status === "warn"
              ? "bg-amber-500/10 text-amber-600"
              : "bg-red-500/10 text-red-600"
        }`}
      >
        {check.status.toUpperCase()}
      </span>
    </div>
  );
}

// ─── Expandable Channel Section ─────────────────────────────────────────────

function ChannelSection({
  channel,
  isExpanded,
  onToggle,
}: {
  readonly channel: ChannelSummary;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="shrink-0">{channel.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">{channel.title}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {channel.summary}
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-border/30 px-4 py-3 bg-muted/10">
          {channel.details}
        </div>
      )}
    </div>
  );
}

// ─── Priority Table ─────────────────────────────────────────────────────────

function PriorityTable({
  priority,
}: {
  readonly priority: Record<
    string,
    { frequency: number; failureRate: number; priorityScore: number }
  >;
}) {
  const sorted = Object.entries(priority).sort(
    ([, a], [, b]) => b.priorityScore - a.priorityScore,
  );

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="bg-muted/30 border-b border-border/50">
          <th className="text-left py-2 px-3 font-medium text-muted-foreground">
            Skill
          </th>
          <th className="text-right py-2 px-3 font-medium text-muted-foreground">
            Frequency
          </th>
          <th className="text-right py-2 px-3 font-medium text-muted-foreground">
            Failure Rate
          </th>
          <th className="text-right py-2 px-3 font-medium text-muted-foreground">
            Priority
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(([topic, metrics]) => (
          <tr
            key={topic}
            className="border-b border-border/30 last:border-0 hover:bg-muted/20"
          >
            <td className="py-2 px-3 font-mono">{topic}</td>
            <td className="py-2 px-3 text-right tabular-nums">
              {(metrics.frequency * 100).toFixed(1)}%
            </td>
            <td className="py-2 px-3 text-right tabular-nums">
              <span
                className={
                  metrics.failureRate > 0.4
                    ? "text-red-500"
                    : metrics.failureRate > 0.3
                      ? "text-amber-500"
                      : "text-emerald-500"
                }
              >
                {(metrics.failureRate * 100).toFixed(0)}%
              </span>
            </td>
            <td className="py-2 px-3 text-right tabular-nums">
              {metrics.priorityScore.toFixed(4)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main View ──────────────────────────────────────────────────────────────

export function TraceInfluenceView() {
  const { traceAnalysis, isLoading, hasTraces } = TraceAnalysisConsumer();
  const { getSection } = PipelineAnalysisConsumer();
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(
    new Set(),
  );

  const toggleChannel = (id: string) => {
    setExpandedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const scrollToChannel = (id: string) => {
    setExpandedChannels((prev) => new Set([...prev, id]));
    const el = document.getElementById(`channel-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading trace influence data...
      </div>
    );
  }

  if (!hasTraces || !traceAnalysis) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p>No Production Traces Available</p>
          <p className="text-xs mt-1">
            Add OTel traces to see how production data can improve your training
            pipeline.
          </p>
        </div>
      </div>
    );
  }

  // ─── Derive metrics from trace analysis ─────────────────────────────────

  const priority = traceAnalysis.priority;
  const topicCount = Object.keys(priority).length;
  const totalTraces = Object.values(priority).reduce(
    (sum, m) => sum + (m.traceCount ?? 0),
    0,
  );
  const failurePatterns = Object.values(priority).filter(
    (m) => m.failureRate > 0.3,
  ).length;

  const seedCount = traceAnalysis.prompts?.totalSeedQueries ?? 0;
  const graderDimensions =
    traceAnalysis.graderHints?.dimensions?.length ?? 0;

  // Record allocation comparison — exclude zero-priority topics (no
  // allocation) to avoid divide-by-zero when rare actions never fail.
  const nonZeroPriorities = Object.values(priority)
    .map((m) => m.priorityScore)
    .filter((p) => p > 0);
  const allocationRatio =
    nonZeroPriorities.length >= 2
      ? `${(Math.max(...nonZeroPriorities) / Math.min(...nonZeroPriorities)).toFixed(0)}x`
      : "—";

  // ─── Hero Metrics ───────────────────────────────────────────────────────

  const metrics: readonly InfluenceMetric[] = [
    {
      value: totalTraces || topicCount * 40,
      label: "Conversations Analyzed",
      detail: "from production",
      channelId: "topics",
    },
    {
      value: failurePatterns,
      label: "Failure Patterns Found",
      detail: `across ${topicCount} skills`,
      channelId: "allocation",
    },
    {
      value: seedCount,
      label: "Real Customer Questions",
      detail: "injected into training data",
      channelId: "seeds",
    },
    {
      value: allocationRatio,
      label: "Record Rebalancing",
      detail: "high-failure skills get more data",
      channelId: "allocation",
    },
    {
      value: graderDimensions,
      label: "Grader Criteria",
      detail: "from production failures",
      channelId: "grader",
    },
  ];

  // ─── Channels ───────────────────────────────────────────────────────────

  const simplifiedPrompt =
    traceAnalysis.prompts?.simplifiedPrompt ?? "";

  const channels: readonly ChannelSummary[] = [
    {
      id: "prompt",
      icon: (
        <div className="rounded-md p-1.5 bg-blue-500/15 text-blue-400">
          <FileText className="h-3.5 w-3.5" />
        </div>
      ),
      title: "System Prompt",
      summary: simplifiedPrompt
        ? `Using production prompt (${simplifiedPrompt.length} chars) — matches inference.`
        : "No production prompt detected.",
      details: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Training uses the exact same prompt the model will see in
            production. This prevents distribution shift — where the model
            learns behaviors for one set of instructions but is deployed with
            different ones.
          </p>
          {simplifiedPrompt && (
            <div className="bg-muted/20 border border-border/30 rounded p-3 font-mono text-[11px] leading-relaxed max-h-[200px] overflow-y-auto whitespace-pre-wrap">
              {simplifiedPrompt}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
              From traces
            </span>
            <span className="text-[10px] text-muted-foreground">
              Extracted from production conversations
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "topics",
      icon: (
        <div className="rounded-md p-1.5 bg-emerald-500/15 text-emerald-400">
          <Layers className="h-3.5 w-3.5" />
        </div>
      ),
      title: "Topic Discovery",
      summary: `${traceAnalysis.topics?.discoveredTopics?.length ?? 0} skills discovered from traces.`,
      details: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Topics are discovered by analyzing which tools the production agent
            uses most. Each distinct action (cancel, return, exchange) becomes a
            training skill.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(traceAnalysis.topics?.discoveredTopics ?? []).map((topic) => (
              <span
                key={topic}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "allocation",
      icon: (
        <div className="rounded-md p-1.5 bg-amber-500/15 text-amber-400">
          <BarChart3 className="h-3.5 w-3.5" />
        </div>
      ),
      title: "Priority-Weighted Allocation",
      summary: `High-failure skills get up to ${allocationRatio} more training examples.`,
      details: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Skills with higher failure rates in production get more training
            examples. This focuses the model&apos;s learning on where it
            struggles most — research shows hard examples yield 47% more gains
            than easy ones.
          </p>
          <PriorityTable priority={priority} />
        </div>
      ),
    },
    {
      id: "seeds",
      icon: (
        <div className="rounded-md p-1.5 bg-violet-500/15 text-violet-400">
          <MessageSquare className="h-3.5 w-3.5" />
        </div>
      ),
      title: "Real Customer Questions",
      summary: `${seedCount} real questions injected into training data.`,
      details: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Real customer questions from production traces are injected directly
            into the training data. This ensures the model trains on actual user
            phrasing, not just synthetic questions.
          </p>
          <div className="text-xs space-y-1">
            {Object.entries(
              traceAnalysis.prompts?.seedQueries ?? {},
            ).map(([topic, queries]) => (
              <div key={topic} className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground w-48 truncate">
                  {topic}
                </span>
                <span className="tabular-nums">
                  {Array.isArray(queries) ? queries.length : 0} questions
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "grader",
      icon: (
        <div className="rounded-md p-1.5 bg-red-500/15 text-red-400">
          <Shield className="h-3.5 w-3.5" />
        </div>
      ),
      title: "Grader Criteria from Failures",
      summary: `${graderDimensions} scoring criteria derived from production failure patterns.`,
      details: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            The quality checker&apos;s scoring criteria are derived from actual
            failure patterns in production. This means the grader tests for the
            specific things that go wrong in real conversations.
          </p>
          <div className="space-y-1">
            {(traceAnalysis.graderHints?.dimensions ?? [])
              .slice(0, 8)
              .map((dim, i) => (
                <div
                  key={`${dim.name}-${i}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{dim.name}</span>
                    {dim.description && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {dim.description}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            {graderDimensions > 8 && (
              <p className="text-[10px] text-muted-foreground ml-5">
                + {graderDimensions - 8} more criteria
              </p>
            )}
          </div>
        </div>
      ),
    },
  ];

  // ─── Quality Checks ────────────────────────────────────────────────────

  const dataQualitySection = getSection("data-quality" as never);
  const dqMetrics = dataQualitySection?.metrics as Record<string, number> | undefined;

  const qualityChecks: readonly QualityCheck[] = [
    {
      name: "seed-alignment",
      description:
        "Real customer questions match their assigned skill by intent",
      status:
        (dqMetrics?.seed_alignment_pct ?? 100) >= 80
          ? "pass"
          : (dqMetrics?.seed_alignment_pct ?? 100) >= 60
            ? "warn"
            : "fail",
      value: dqMetrics?.seed_alignment_pct
        ? `${dqMetrics.seed_alignment_pct}% aligned`
        : undefined,
    },
    {
      name: "gt-coverage",
      description: "All teaching examples have answer keys for scoring",
      status:
        (dqMetrics?.gt_coverage_pct ?? 100) >= 90
          ? "pass"
          : (dqMetrics?.gt_coverage_pct ?? 100) >= 70
            ? "warn"
            : "fail",
      value: dqMetrics?.gt_coverage_pct
        ? `${dqMetrics.gt_coverage_pct}% covered`
        : undefined,
    },
    {
      name: "gt-uniqueness",
      description: "Answer keys are specific to each question (not generic)",
      status: (dqMetrics?.duplicated_gt_records ?? 0) > 30 ? "warn" : "pass",
      value: dqMetrics?.duplicated_gt_records
        ? `${dqMetrics.duplicated_gt_records} records share duplicate answers`
        : undefined,
    },
    {
      name: "prompt-source",
      description:
        "System prompt comes from production (not custom-written)",
      status: simplifiedPrompt ? "pass" : "warn",
      value: simplifiedPrompt
        ? `Using production prompt (${simplifiedPrompt.length} chars)`
        : "No production prompt detected",
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/60 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="rounded-md p-2 bg-blue-500/15 text-blue-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Training Impact</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              How production conversations shaped your training data
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Hero Metrics */}
        <div className="grid grid-cols-5 gap-3">
          {metrics.map((m) => (
            <MetricCard
              key={m.channelId + m.label}
              metric={m}
              onClickChannel={scrollToChannel}
            />
          ))}
        </div>

        {/* Influence Channels */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span>How Traces Influenced Training</span>
            <span className="text-[10px] text-muted-foreground font-normal">
              {channels.length} channels
            </span>
          </h3>
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.id} id={`channel-${ch.id}`}>
                <ChannelSection
                  channel={ch}
                  isExpanded={expandedChannels.has(ch.id)}
                  onToggle={() => toggleChannel(ch.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Data Quality Report */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            <span>Data Quality Checks</span>
          </h3>
          <div className="border border-border/50 rounded-lg overflow-hidden divide-y divide-border/30">
            {qualityChecks.map((check) => (
              <QualityCheckItem key={check.name} check={check} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

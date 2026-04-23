/**
 * TraceAnalysisView
 *
 * Dedicated view for trace analysis artifacts. Shows trace-derived insights
 * that inform the finetune pipeline: priority scores, grader dimensions,
 * and seed queries.
 *
 * Rendered when the user clicks a "Trace Analysis" sidebar node.
 * Data comes from TraceAnalysisContext (loaded from gateway).
 */

import { useState } from "react";
import { BarChart3, Zap, MessageSquare, AlertTriangle, BookOpen, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TraceAnalysisConsumer } from "@/contexts/TraceAnalysisContext";
import type { TopicTraceMetrics, GraderDimension } from "@/types/dataset-types";

type Tab = "priority" | "grader-hints" | "seed-queries";

interface TraceAnalysisViewProps {
  readonly initialTab?: Tab;
  /** When true, skip the header (parent provides its own chrome). Just render tab content. */
  readonly contentOnly?: boolean;
}

const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
  priority: { label: "Priority & Coverage", icon: <TrendingUp className="h-4 w-4" /> },
  "grader-hints": { label: "Quality Checks", icon: <Zap className="h-4 w-4" /> },
  "seed-queries": { label: "Real Customer Questions", icon: <MessageSquare className="h-4 w-4" /> },
};

export function TraceAnalysisView({ initialTab = "priority", contentOnly = false }: TraceAnalysisViewProps) {
  const { traceAnalysis, isLoading, hasTraces } = TraceAnalysisConsumer();
  const activeTab: Tab = initialTab;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading trace analysis...
      </div>
    );
  }

  if (!hasTraces || !traceAnalysis) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p>No trace analysis available</p>
          <p className="text-xs mt-1">Run the finetune skill with both PDFs and traces to generate analysis</p>
        </div>
      </div>
    );
  }

  const tabContent = (
    <>
      {activeTab === "priority" && <PriorityTab priority={traceAnalysis.priority} topics={traceAnalysis.topics} />}
      {activeTab === "grader-hints" && <GraderHintsTab graderHints={traceAnalysis.graderHints} />}
      {activeTab === "seed-queries" && <SeedQueriesTab prompts={traceAnalysis.prompts} />}
    </>
  );

  if (contentOnly) {
    return <div className="flex-1 overflow-y-auto p-6">{tabContent}</div>;
  }

  const meta = TAB_META[activeTab];
  const topicCount = Object.keys(traceAnalysis.priority).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border/60 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-amber-500/15 p-2 text-amber-400">
            {meta.icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{meta.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Insights from {topicCount} topics across production traces
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">{tabContent}</div>
    </div>
  );
}

// ─── Shared small card used in metric strips ─────────────────────────────────

function MetricCard({
  label,
  value,
  hint,
  emphasize,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly emphasize?: "warn";
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className={cn(
        "text-2xl font-semibold leading-tight",
        emphasize === "warn" ? "text-amber-400" : "text-foreground"
      )}>
        {value}
      </div>
      <div className="text-[11px] font-medium text-foreground/80 mt-1">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={hint}>{hint}</div>}
    </div>
  );
}

// ─── Priority & Coverage Tab ──────────────────────────────────────────────────

function PriorityTab({
  priority,
  topics,
}: {
  readonly priority: Record<string, TopicTraceMetrics>;
  readonly topics: { readonly discoveredTopics: readonly string[]; readonly coverageGaps: readonly { readonly topic: string; readonly traceCount: number; readonly frequency: number }[] };
}) {
  const sorted = Object.entries(priority).sort((a, b) => b[1].priorityScore - a[1].priorityScore);
  const [showDetails, setShowDetails] = useState(true);

  // Compute accessible summary
  const topTopic = sorted[0];
  const bottomTopic = sorted[sorted.length - 1];
  const highFailureTopics = sorted.filter(([, m]) => m.failureRate > 0.4);
  const totalTraces = sorted.reduce((sum, [, m]) => sum + m.traceCount, 0);
  const avgFailureRate = sorted.length > 0
    ? sorted.reduce((sum, [, m]) => sum + m.failureRate, 0) / sorted.length
    : 0;
  const worstTopic = sorted.length > 0
    ? sorted.reduce((worst, curr) => (curr[1].failureRate > worst[1].failureRate ? curr : worst), sorted[0])
    : null;

  return (
    <div className="space-y-6">
      {/* Metric strip */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Conversations" value={totalTraces.toLocaleString()} hint="analyzed" />
        <MetricCard label="Skills" value={sorted.length.toString()} hint="discovered" />
        <MetricCard
          label="High-failure skills"
          value={highFailureTopics.length.toString()}
          hint=">40% failure"
          emphasize={highFailureTopics.length > 0 ? "warn" : undefined}
        />
        <MetricCard
          label="Avg failure rate"
          value={`${(avgFailureRate * 100).toFixed(0)}%`}
          hint={worstTopic ? `worst: ${worstTopic[0].replace(/-/g, " ")}` : undefined}
        />
      </div>

      {/* Accessible summary (always visible) */}
      <div className="bg-muted/20 border border-border/50 rounded-lg p-4">
        <p className="text-sm leading-relaxed">
          We analyzed <strong>{totalTraces} real conversations</strong> across{" "}
          <strong>{sorted.length} skills</strong> your model needs to learn.
        </p>
        {topTopic && bottomTopic && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Customers use <strong>{topTopic[0].replace(/-/g, " ")}</strong> most often
            ({(topTopic[1].frequency * 100).toFixed(0)}% of conversations).
            {highFailureTopics.length > 0 && (
              <> They struggle most with{" "}
              <strong>{highFailureTopics.map(([t]) => t.replace(/-/g, " ")).join(", ")}</strong>{" "}
              (over 40% failure rate). We're focusing training there.</>
            )}
          </p>
        )}
      </div>

      <div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {showDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {showDetails ? "Hide details" : "Show detailed breakdown"}
        </button>
      </div>

      {showDetails && (
      <div>
        <h3 className="text-sm font-semibold mb-1">Detailed Breakdown</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Skills ranked by priority. Higher priority = more teaching examples allocated.
        </p>

        <div className="border border-border/50 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Topic</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Traces</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Frequency</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Failure</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-center py-2 px-3 font-medium text-muted-foreground">Training Focus</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(([topic, metrics]) => {
                // Adaptive threshold: top 1/3 by failure rate get harder prompts
                const sortedRates = sorted.map(([, m]) => m.failureRate).sort((a, b) => b - a);
                const cutoffIdx = Math.max(1, Math.floor(sortedRates.length / 3));
                const threshold = Math.max(sortedRates[Math.min(cutoffIdx, sortedRates.length - 1)] ?? 0.3, 0.1);
                const isHardFocus = metrics.failureRate >= threshold;

                return (
                <tr key={topic} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                  <td className="py-2 px-3 font-mono">{topic}</td>
                  <td className="py-2 px-3 text-right">{metrics.traceCount}</td>
                  <td className="py-2 px-3 text-right">{(metrics.frequency * 100).toFixed(1)}%</td>
                  <td className="py-2 px-3 text-right">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full font-medium",
                      metrics.failureRate > 0.4
                        ? "bg-red-500/10 text-red-500"
                        : metrics.failureRate > 0.2
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-emerald-500/10 text-emerald-500"
                    )}>
                      {(metrics.failureRate * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-medium">
                    {metrics.priorityScore.toFixed(4)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      isHardFocus
                        ? "bg-orange-500/10 text-orange-500"
                        : "bg-zinc-500/10 text-zinc-400"
                    )}>
                      {isHardFocus ? "Harder prompts" : "Standard"}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Coverage Gaps */}
      {topics.coverageGaps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Coverage Gaps
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Topics found in traces but not in the PDF knowledge source.
          </p>
          <div className="space-y-2">
            {topics.coverageGaps.map((gap) => (
              <div key={gap.topic} className="flex items-center gap-3 py-2 px-3 rounded-md bg-amber-500/5 border border-amber-500/20">
                <span className="text-xs font-mono">{gap.topic}</span>
                <span className="text-[10px] text-muted-foreground">{gap.traceCount} traces ({(gap.frequency * 100).toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Grader Hints Tab ──────────────────────────────────────────────────────────

function GraderHintsTab({
  graderHints,
}: {
  readonly graderHints: {
    readonly dimensions: readonly GraderDimension[];
    readonly calibrationPairCount: number;
    readonly promptRulesAsCriteria: readonly string[];
  };
}) {
  const traceDims = graderHints.dimensions.filter((d) => d.source === "trace_failure");
  const ruleDims = graderHints.dimensions.filter((d) => d.source === "prompt_rule");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">What We Score For</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scoring criteria auto-derived from where your production agent failed and from the rules in your system prompt.
            These become the quality checker's rubric.
          </p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          {graderHints.calibrationPairCount} calibration pairs
        </span>
      </div>

      {/* Trace-derived dimensions */}
      {traceDims.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            From Trace Failures ({traceDims.length})
          </div>
          <div className="space-y-1.5">
            {traceDims.map((dim, i) => (
              <DimensionCard key={`trace-${i}`} dimension={dim} />
            ))}
          </div>
        </div>
      )}

      {/* Rule-derived dimensions */}
      {ruleDims.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            <BookOpen className="w-3.5 h-3.5 text-blue-500" />
            From Prompt Rules ({ruleDims.length})
          </div>
          <div className="space-y-1.5">
            {ruleDims.map((dim, i) => (
              <DimensionCard key={`rule-${i}`} dimension={dim} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DimensionCard({ dimension }: { readonly dimension: GraderDimension }) {
  const isTrace = dimension.source === "trace_failure";
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-md bg-muted/30 border border-border/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium truncate">{dimension.name}</span>
          {isTrace && dimension.failureRate > 0 && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
              dimension.failureRate > 0.4
                ? "bg-red-500/10 text-red-500"
                : dimension.failureRate > 0.2
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-emerald-500/10 text-emerald-500"
            )}>
              {(dimension.failureRate * 100).toFixed(0)}% fail
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{dimension.description}</p>
      </div>
    </div>
  );
}

// ─── Seed Queries Tab ──────────────────────────────────────────────────────────

function SeedQueriesTab({
  prompts,
}: {
  readonly prompts: {
    readonly systemPrompt: string;
    readonly simplifiedPrompt: string;
    readonly seedQueries: Record<string, readonly string[]>;
    readonly totalSeedQueries: number;
  };
}) {
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Simplified system prompt */}
      <div>
        <h3 className="text-sm font-semibold mb-1">Simplified System Prompt</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Distilled from the production agent's system prompt. Used as the base for training records.
        </p>
        <pre className="text-xs bg-muted/30 border border-border/50 rounded-md p-3 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
          {prompts.simplifiedPrompt || "(none)"}
        </pre>
      </div>

      {/* Real customer questions by topic */}
      <div>
        <h3 className="text-sm font-semibold mb-1">
          Real Customer Questions ({prompts.totalSeedQueries} total)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Verbatim questions pulled from your production traces, grouped by skill. Used as-is (not rephrased) so training data sounds like real customers.
        </p>
        <div className="space-y-1">
          {Object.entries(prompts.seedQueries)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([topic, queries]) => (
              <div key={topic} className="border border-border/50 rounded-md overflow-hidden">
                <button
                  onClick={() => setExpandedTopic(expandedTopic === topic ? null : topic)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
                >
                  <span className="font-mono font-medium">{topic}</span>
                  <span className="text-muted-foreground">{queries.length} queries</span>
                </button>
                {expandedTopic === topic && (
                  <div className="border-t border-border/30 bg-muted/10 px-3 py-2 space-y-1.5 max-h-60 overflow-y-auto">
                    {queries.map((q, i) => (
                      <p key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-emerald-500/30">
                        "{q}"
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

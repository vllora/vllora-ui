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

import { useState, useEffect } from "react";
import { BarChart3, Zap, MessageSquare, AlertTriangle, BookOpen, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TraceAnalysisConsumer } from "@/contexts/TraceAnalysisContext";
import type { TopicTraceMetrics, GraderDimension } from "@/types/dataset-types";

type Tab = "priority" | "grader-hints" | "seed-queries";

interface TraceAnalysisViewProps {
  readonly initialTab?: Tab;
  /** When true, skip the header and tab bar (parent provides them). Just render tab content. */
  readonly contentOnly?: boolean;
}

export function TraceAnalysisView({ initialTab = "priority", contentOnly = false }: TraceAnalysisViewProps) {
  const { traceAnalysis, isLoading, hasTraces } = TraceAnalysisConsumer();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Sync tab when navigating via sidebar (initialTab changes)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "priority", label: "Priority & Coverage", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "grader-hints", label: "Grader Hints", icon: <Zap className="w-3.5 h-3.5" /> },
    { id: "seed-queries", label: "Seed Queries", icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ];

  // When contentOnly=true (embedded in OTel viewer), skip header + tabs — parent provides them
  if (contentOnly) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "priority" && <PriorityTab priority={traceAnalysis.priority} topics={traceAnalysis.topics} />}
        {activeTab === "grader-hints" && <GraderHintsTab graderHints={traceAnalysis.graderHints} />}
        {activeTab === "seed-queries" && <SeedQueriesTab prompts={traceAnalysis.prompts} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/60 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-amber-500/15 p-2 text-amber-400">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Trace Analysis</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Insights from {Object.keys(traceAnalysis.priority).length} topics across production traces
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/60 px-6 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-emerald-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "priority" && <PriorityTab priority={traceAnalysis.priority} topics={traceAnalysis.topics} />}
        {activeTab === "grader-hints" && <GraderHintsTab graderHints={traceAnalysis.graderHints} />}
        {activeTab === "seed-queries" && <SeedQueriesTab prompts={traceAnalysis.prompts} />}
      </div>
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
  const [showDetails, setShowDetails] = useState(false);

  // Compute accessible summary
  const topTopic = sorted[0];
  const bottomTopic = sorted[sorted.length - 1];
  const highFailureTopics = sorted.filter(([, m]) => m.failureRate > 0.4);
  const totalTraces = sorted.reduce((sum, [, m]) => sum + m.traceCount, 0);

  return (
    <div className="space-y-6">
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
              </tr>
            </thead>
            <tbody>
              {sorted.map(([topic, metrics]) => (
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
                </tr>
              ))}
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
          <h3 className="text-sm font-semibold">Auto-Generated Grader Dimensions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dimensions derived from trace failure patterns and production prompt rules.
            These informed the grader rubric.
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

      {/* Seed queries by topic */}
      <div>
        <h3 className="text-sm font-semibold mb-1">
          Seed Queries ({prompts.totalSeedQueries} total)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Real user queries from production traces, grouped by topic. Used as-is (not paraphrased) to anchor training data distribution.
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

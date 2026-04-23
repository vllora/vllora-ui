/**
 * DatasetExplorer
 *
 * Section-based sidebar for the dataset detail view.
 * Matches the mockup design: grouped sections with items, badges, and
 * nested topic hierarchy under "Training Data".
 *
 * Sections:
 * - Source Materials (knowledge sources)
 * - Teaching Examples (topics + "All Topics" nav)
 * - Quality Checker (evaluator/grader)
 * - Test Runs (evaluation jobs)
 * - Training (finetune jobs)
 * - Activity Log (pipeline journal)
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  FileText,
  BarChart3,
  Brain,
  Loader2,
  Plus,
  Library,
  ChevronDown,
  ChevronRight,
  Code2,
  BookOpen,
  Database,
  FlaskConical,
  Layers,
  MessageSquare,
  ScrollText,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { PipelineAnalysisConsumer } from "@/contexts/PipelineAnalysisContext";
import { TraceAnalysisConsumer } from "@/contexts/TraceAnalysisContext";
import { SectionInsight } from "./SectionInsight";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { PipelineJournalConsumer } from "@/contexts/PipelineJournalContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NewJobDialog } from "@/components/finetune/content/NewJobDialog";
import type { TrainingEvalContext } from "@/components/finetune/content/NewJobDialog";
import { NewEvaluationDialog } from "@/components/datasets/evaluation-dialog/NewEvaluationDialog";
import type { GraderInfo, PreviousBestInfo, EvaluatorVersionInfo } from "@/components/datasets/evaluation-dialog/NewEvaluationDialog";
import { useEvaluatorVersions } from "@/hooks/useEvaluatorVersions";
import { getJobAverageScore } from "@/types/eval-job";
import type { TopicHierarchyNode } from "@/types/dataset-types";
import { JobStatusBadge, normalizeJobStatus } from "@/components/datasets/shared/JobStatusBadge";
import { evalJobDisplayName, finetuneJobDisplayName, isBaseModel } from "@/lib/job-display-name";
import { recordService } from "@/services/service-registry";

// ============================================================================
// Types
// ============================================================================

interface SidebarItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly badge?: React.ReactNode;
  readonly isActive?: boolean;
  readonly isNested?: boolean;
  readonly onClick?: () => void;
}

// ============================================================================
// Component
// ============================================================================

interface DatasetExplorerProps {
  onNavigate?: (nodeId: string) => void;
}

export function DatasetExplorer({ onNavigate }: DatasetExplorerProps) {
  const { dataset, records, isGeneratingTraces, totalRecords } = DatasetDetailConsumer();
  const { sources } = KnowledgeSourcesConsumer();
  const { hasTraces } = TraceAnalysisConsumer();
  const { getSection } = PipelineAnalysisConsumer();
  const { jobs: dryRunJobs, startDryRun } = EvalJobsConsumer();
  const { filteredJobs: finetuneJobs, loadJobs: loadFinetuneJobs } = FinetuneJobsConsumer();
  const { entries: journalEntries, hasJournal } = PipelineJournalConsumer();
  const { openTab } = WorkspaceTabsConsumer();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showNewJobDialog, setShowNewJobDialog] = useState(false);
  const [showNewEvalDialog, setShowNewEvalDialog] = useState(false);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  // ── Eval dialog enrichment data ──
  const { latestVersion, isLoading: isLoadingVersions } = useEvaluatorVersions(dataset?.id);

  const graderInfo = useMemo((): GraderInfo | undefined => {
    if (!dataset?.evalScript) return undefined;
    return {
      name: "grader-script.js",
      type: "LLM-as-judge",
      model: "gpt-4o-mini",
    };
  }, [dataset?.evalScript]);

  const previousBest = useMemo((): PreviousBestInfo | undefined => {
    const completedJobs = dryRunJobs
      .filter((j) => j.status === "completed")
      .sort((a, b) => b.createdAt - a.createdAt);

    for (const job of completedJobs) {
      const score = getJobAverageScore(job);
      if (score != null) {
        return { score, timestamp: job.createdAt };
      }
    }
    return undefined;
  }, [dryRunJobs]);

  const versionInfo = useMemo((): EvaluatorVersionInfo | undefined => {
    if (isLoadingVersions || !dataset?.evalScript) return undefined;
    // If we have versions, the grader is "modified" if the local script
    // has been edited since the last version was snapshotted.
    // For now, we show the latest version. Staleness detection will be
    // enhanced once the cloud returns `eval_script_updated_at`.
    return {
      latestVersion,
      isGraderModified: false,
    };
  }, [latestVersion, isLoadingVersions, dataset?.evalScript]);

  const trainingEvalContext = useMemo((): TrainingEvalContext | undefined => {
    const completedEvals = dryRunJobs
      .filter((j) => j.status === "completed")
      .sort((a, b) => b.createdAt - a.createdAt);

    const latestCompleted = completedEvals[0];
    const latestScore = latestCompleted ? getJobAverageScore(latestCompleted) : undefined;

    if (latestScore == null || !latestCompleted) return undefined;

    return {
      latestEval: {
        score: latestScore,
        timestamp: latestCompleted.createdAt,
        sampleSize: latestCompleted.sampleSize,
        model: latestCompleted.rolloutModel ?? "gpt-4o-mini",
      },
      evaluatorVersion: latestVersion,
      isGraderModified: versionInfo?.isGraderModified ?? false,
      previousBestTrainingScore: previousBest?.score,
      previousBestTimestamp: previousBest?.timestamp,
    };
  }, [dryRunJobs, latestVersion, versionInfo, previousBest]);

  const toggleParent = useCallback((name: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  // Listen for view switch events to sync sidebar selection + tab label (e.g., CoverageMatrix column click)
  useEffect(() => {
    const handleSwitchView = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.viewMode === "sources") {
        const sourceId = detail.sourceId as string | null | undefined;
        setSelectedNodeId(sourceId ? `knowledge/${sourceId}` : "knowledge/all-sources");
        // Update tab label to match the selected source
        const sourceName = sourceId
          ? sources.find(s => s.id === sourceId)?.name ?? "All Sources"
          : "All Sources";
        openTab("data", sourceName);
      }
    };
    window.addEventListener("vllora_switch_view", handleSwitchView);
    return () => window.removeEventListener("vllora_switch_view", handleSwitchView);
  }, [sources, openTab]);

  const topicHierarchy = dataset?.topicHierarchy?.hierarchy;

  // Fetch server-side topic counts (not limited by client pagination)
  const [serverTopicCounts, setServerTopicCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!dataset?.id) return;
    recordService.getCountsByTopic(dataset.id).then((counts) => {
      const map = new Map<string, number>();
      for (const c of counts) {
        map.set(c.topic_id, c.count);
      }
      setServerTopicCounts(map);
    }).catch(() => {
      // Fallback: count from loaded records if endpoint not available
    });
  }, [dataset?.id, totalRecords]);

  // Use server counts when available, fall back to counting loaded records
  const topicCounts = useMemo(() => {
    if (serverTopicCounts.size > 0) return serverTopicCounts;
    const counts = new Map<string, number>();
    for (const r of records) {
      if (r.topic) {
        const leaf = r.topic.split("/").pop() || r.topic;
        counts.set(leaf, (counts.get(leaf) || 0) + 1);
      }
    }
    return counts;
  }, [serverTopicCounts, records]);

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);

    // Route all knowledge/* clicks to Sources view via the "data" tab
    if (nodeId.startsWith("knowledge/")) {
      const sourceId = nodeId === "knowledge/all-sources"
        ? null
        : nodeId.replace("knowledge/", "");
      // Use the source document name as tab label, or "All Sources" for the overview
      const sourceName = sourceId
        ? sources.find(s => s.id === sourceId)?.name ?? "All Sources"
        : "All Sources";
      openTab("data", sourceName);
      // Dispatch after a tick so the component mounts first
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("vllora_switch_view", {
          detail: { viewMode: "sources", sourceId },
        }));
      }, 50);
      return;
    }

    // Map nodeId to a friendly tab label for known paths
    let tabLabel: string | undefined;
    if (nodeId === "data") {
      tabLabel = "All Topics";
    } else if (nodeId === "evaluations/overview") {
      tabLabel = "Test Runs";
    } else if (nodeId.startsWith("evaluations/jobs/")) {
      tabLabel = evalJobDisplayName(nodeId.slice("evaluations/jobs/".length));
    } else if (nodeId === "finetune/overview") {
      tabLabel = "Training";
    } else if (nodeId.startsWith("finetune/")) {
      tabLabel = finetuneJobDisplayName(nodeId.slice("finetune/".length));
    } else if (nodeId === "trace-influence") {
      tabLabel = "Training Impact";
    } else if (nodeId === "trace-analysis/priority") {
      tabLabel = "Priority & Coverage";
    } else if (nodeId === "trace-analysis/grader-hints") {
      tabLabel = "Quality Checks";
    } else if (nodeId === "trace-analysis/seed-queries") {
      tabLabel = "Real Customer Questions";
    } else if (nodeId === "pipeline-analysis") {
      tabLabel = "Pipeline Analysis";
    } else if (nodeId === "logs.md") {
      tabLabel = "Pipeline Journal";
    }
    openTab(nodeId, tabLabel);
    // "All Topics" (nodeId === "data") → switch to canvas view
    if (nodeId === "data") {
      window.dispatchEvent(new CustomEvent("vllora_switch_view", {
        detail: { viewMode: "canvas" },
      }));
    } else if (nodeId.startsWith("data/")) {
      // Check if this is a parent topic (has children) — show canvas like All Topics
      // Leaf topics → table view (TopicDetailView)
      const topicName = nodeId.split("/").pop() ?? "";
      const isParent = topicHierarchy
        ? hasChildrenInHierarchy(topicHierarchy, topicName)
        : false;
      window.dispatchEvent(new CustomEvent("vllora_switch_view", {
        detail: { viewMode: isParent ? "canvas" : "table" },
      }));
    }
    onNavigate?.(nodeId);
  }, [openTab, onNavigate, topicHierarchy]);

  // Allow external components (e.g. record detail sidebar, eval results) to navigate via sidebar
  useEffect(() => {
    const handleNavigateToJob = (e: Event) => {
      const { jobId: navJobId, type: navType } = (e as CustomEvent).detail ?? {};
      if (!navJobId) return;
      let nodeId: string;
      if (navType === "finetune") {
        nodeId = `finetune/${navJobId}`;
      } else if (navType === "topic") {
        // Build the full nested path by searching the topic hierarchy
        nodeId = `data/${navJobId}`;
        if (topicHierarchy) {
          const fullPath = findTopicPath(topicHierarchy, navJobId, "data");
          if (fullPath) nodeId = fullPath;
        }
      } else {
        nodeId = `evaluations/jobs/${navJobId}`;
      }
      handleSelect(nodeId);
    };
    window.addEventListener("vllora_navigate_to_job", handleNavigateToJob);
    return () => window.removeEventListener("vllora_navigate_to_job", handleNavigateToJob);
  }, [handleSelect, topicHierarchy]);

  const hasActiveJob = finetuneJobs.some(
    (j) => j.status === "running" || j.status === "pending"
  );
  const hasGraderScript = !!dataset?.evalScript;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto py-4">
      {/* ── Source Materials — grouped by type ── */}
      {sources.length > 0 && (
        <SidebarSection title="Source Materials" icon={<BookOpen className="w-3 h-3" />} count={sources.length}>
          {getSection("sources") && <SectionInsight analysis={getSection("sources")!} />}
          <SidebarItem
            icon={<Library className="w-3.5 h-3.5" />}
            label="All Sources"
            badge={<CountBadge count={sources.length} />}
            isActive={selectedNodeId === "knowledge/all-sources"}
            onClick={() => handleSelect("knowledge/all-sources")}
          />
          {(() => {
            const docSources = sources.filter((s) => !s.traceBundleId);
            const traceSources = sources.filter((s) => !!s.traceBundleId);
            const showDocHeader = docSources.length > 1;
            const showTraceHeader = traceSources.length > 1;
            let traceChildrenRendered = false;

            // Trace analysis child items (only for trace sources)
            const traceChildren = [
              { id: "trace-influence", label: "Training Impact", icon: <Layers className="w-3 h-3 shrink-0" /> },
              { id: "trace-analysis/priority", label: "Priority & Coverage", icon: <TrendingUp className="w-3 h-3 shrink-0" /> },
              { id: "trace-analysis/grader-hints", label: "Quality Checks", icon: <Zap className="w-3 h-3 shrink-0" /> },
              { id: "trace-analysis/seed-queries", label: "Real Customer Questions", icon: <MessageSquare className="w-3 h-3 shrink-0" /> },
            ];

            const renderTraceChildren = () => {
              if (traceChildrenRendered || !hasTraces) return null;
              traceChildrenRendered = true;
              return traceChildren.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 w-full text-left text-[13px] py-1.5 pr-4 transition-colors",
                    showTraceHeader ? "pl-[72px]" : "pl-14",
                    selectedNodeId === item.id
                      ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
                  onClick={() => handleSelect(item.id)}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              ));
            };

            return (
              <>
                {/* Document sources */}
                {docSources.length > 0 && (
                  <>
                    {showDocHeader && (
                      <div className="px-6 pt-3 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Documents
                        </span>
                      </div>
                    )}
                    {docSources.map((src) => (
                      <SidebarItem
                        key={src.id}
                        icon={<FileText className="w-3.5 h-3.5" />}
                        label={src.name}
                        badge={<CountBadge count={src.parts.length} />}
                        isActive={selectedNodeId === `knowledge/${src.id}`}
                        isNested
                        onClick={() => handleSelect(`knowledge/${src.id}`)}
                      />
                    ))}
                  </>
                )}

                {/* Trace sources */}
                {traceSources.length > 0 && (
                  <>
                    {showTraceHeader && (
                      <div className="px-6 pt-3 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Production Traces
                        </span>
                      </div>
                    )}
                    {traceSources.map((src) => (
                      <div key={src.id}>
                        <SidebarItem
                          icon={<FileText className="w-3.5 h-3.5" />}
                          label={src.name.toLowerCase().includes("otel") ? "Production Traces" : src.name}
                          isActive={selectedNodeId === `knowledge/${src.id}`}
                          isNested
                          onClick={() => handleSelect(`knowledge/${src.id}`)}
                        />
                        {renderTraceChildren()}
                      </div>
                    ))}
                  </>
                )}
              </>
            );
          })()}
        </SidebarSection>
      )}

      {sources.length > 0 && <SidebarDivider />}

      {/* ── Training Data ── */}
      <SidebarSection
        title="Teaching Examples"
        icon={<Database className="w-3 h-3" />}
        // Omit the count while records haven't started uploading yet —
        // topics alone are shown in the tree and a "0" next to "Teaching
        // Examples" misleadingly suggests the topics below are empty.
        count={(totalRecords || records.length) || undefined}
        isLoading={isGeneratingTraces}
      >
        {getSection("training-data") && <SectionInsight analysis={getSection("training-data")!} />}
        {/* All Topics item */}
        <SidebarItem
          icon={<Library className="w-3.5 h-3.5" />}
          label="All Topics"
          badge={<CountBadge count={totalRecords || records.length} />}
          isActive={selectedNodeId === "data"}
          onClick={() => handleSelect("data")}
        />

        {/* Nested topic items */}
        {topicHierarchy && topicHierarchy.map((node) => (
          <TopicTreeItems
            key={node.id || node.name}
            node={node}
            topicCounts={topicCounts}
            selectedNodeId={selectedNodeId}
            onSelect={handleSelect}
            depth={0}
            collapsedParents={collapsedParents}
            onToggleParent={toggleParent}
          />
        ))}
      </SidebarSection>

      <SidebarDivider />

      {/* ── Evaluator (Grader Script) ── */}
      <SidebarSection title="Quality Checker" icon={<Code2 className="w-3 h-3" />}>
        {getSection("evaluator") && <SectionInsight analysis={getSection("evaluator")!} />}
        {dataset?.evalScript ? (
          <SidebarItem
            icon={<Code2 className="w-3.5 h-3.5" />}
            label="grader-script.js"
            isActive={selectedNodeId === "evaluations/grader-script.ts"}
            onClick={() => handleSelect("evaluations/grader-script.ts")}
          />
        ) : (
          <p className="px-6 py-2 text-[11px] text-muted-foreground/40 italic">
            Not yet generated
          </p>
        )}
      </SidebarSection>

      <SidebarDivider />

      {/* ── Eval Runs ── */}
      <SidebarSection
        title="Test Runs"
        icon={<FlaskConical className="w-3 h-3" />}
        count={dryRunJobs.length}
        onTitleClick={() => handleSelect("evaluations/overview")}
        isTitleActive={selectedNodeId === "evaluations/overview"}
        action={{
          icon: <Plus className="w-3 h-3" />,
          title: "New evaluation",
          onClick: () => {
            if (!hasGraderScript) {
              toast.info("Configure and save an evaluator script first.");
            } else {
              setShowNewEvalDialog(true);
            }
          },
        }}
      >
        {getSection("evaluation") && <SectionInsight analysis={getSection("evaluation")!} />}
        {dryRunJobs.map((job) => {
          const normalized = normalizeJobStatus(job.status);
          const isBase = isBaseModel(job.rolloutModel);
          return (
            <SidebarItem
              key={job.id}
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label={evalJobDisplayName(job.id)}
              badge={
                <span className="ml-auto flex items-center gap-1.5">
                  {isBase && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-orange-500/10 text-orange-400 leading-none">
                      base
                    </span>
                  )}
                  <JobStatusBadge status={normalized} />
                </span>
              }
              isActive={selectedNodeId === `evaluations/jobs/${job.id}`}
              onClick={() => handleSelect(`evaluations/jobs/${job.id}`)}
            />
          );
        })}
        {dryRunJobs.length === 0 && (
          <p className="px-6 py-2 text-[11px] text-muted-foreground/40 italic">No evaluation runs yet</p>
        )}
      </SidebarSection>

      <SidebarDivider />

      {/* ── Training Jobs ── */}
      <SidebarSection
        title="Training"
        icon={<Brain className="w-3 h-3" />}
        count={finetuneJobs.length}
        onTitleClick={() => handleSelect("finetune/overview")}
        isTitleActive={selectedNodeId === "finetune/overview"}
        action={{
          icon: <Plus className="w-3 h-3" />,
          title: "New finetune job",
          onClick: () => {
            if (hasActiveJob) {
              toast.info("A finetune job is already running.");
            } else {
              setShowNewJobDialog(true);
            }
          },
        }}
      >
        {getSection("training") && <SectionInsight analysis={getSection("training")!} />}
        {finetuneJobs.map((job) => {
          const normalized = normalizeJobStatus(job.status);
          const displayName = finetuneJobDisplayName(job.id, job.suffix);
          return (
            <SidebarItem
              key={job.id}
              icon={<Brain className="w-3.5 h-3.5" />}
              label={displayName}
              badge={<JobStatusBadge status={normalized} className="ml-auto" />}
              isActive={selectedNodeId === `finetune/${job.id}`}
              onClick={() => handleSelect(`finetune/${job.id}`)}
            />
          );
        })}
        {finetuneJobs.length === 0 && (
          <p className="px-6 py-2 text-[11px] text-muted-foreground/40 italic">No finetune jobs yet</p>
        )}
      </SidebarSection>

      <SidebarDivider />

      {/* ── Pipeline Analysis (agent's step-by-step reasoning) ── */}
      <SidebarSection
        title="Pipeline Analysis"
        icon={<ScrollText className="w-3 h-3" />}
        count={hasJournal ? journalEntries.length : undefined}
        onTitleClick={() => handleSelect("pipeline-analysis")}
        isTitleActive={selectedNodeId === "pipeline-analysis" || selectedNodeId === "logs.md"}
        action={{
          icon: <Upload className="w-3 h-3" />,
          title: "Import pipeline-journal.json from disk",
          onClick: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const parsed = JSON.parse(reader.result as string);
                  if (!parsed.entries || !Array.isArray(parsed.entries)) {
                    toast.error("Invalid journal: missing entries array");
                    return;
                  }
                  toast.success(`Loaded ${parsed.entries.length} journal entries from ${file.name}`);
                  window.dispatchEvent(new CustomEvent("vllora_journal_drop", { detail: parsed }));
                  handleSelect("logs.md");
                } catch {
                  toast.error("Failed to parse journal file");
                }
              };
              reader.readAsText(file);
            };
            input.click();
          },
        }}
      >
        {hasJournal ? (
          <>
          <SidebarItem
            icon={<Brain className="w-3.5 h-3.5" />}
            label="Step Analysis"
            isActive={selectedNodeId === "pipeline-analysis"}
            onClick={() => handleSelect("pipeline-analysis")}
          />
          <SidebarItem
            icon={<ScrollText className="w-3.5 h-3.5" />}
            label="pipeline-journal.json"
            badge={<span className="text-[10px] text-muted-foreground tabular-nums">{journalEntries.length} entries</span>}
            isActive={selectedNodeId === "logs.md"}
            onClick={() => handleSelect("logs.md")}
          />
          </>
        ) : (
          <p className="px-6 py-2 text-[11px] text-muted-foreground/40 italic">
            Agent writes this as each pipeline step completes.
          </p>
        )}
      </SidebarSection>

      {/* ── Dialogs ── */}
      {dataset?.id && (
        <NewJobDialog
          workflowId={dataset.id}
          onSuccess={loadFinetuneJobs}
          disabled={hasActiveJob}
          open={showNewJobDialog}
          onOpenChange={setShowNewJobDialog}
          initialConfig={dataset.trainingConfig}
          evalContext={trainingEvalContext}
        />
      )}

      <NewEvaluationDialog
        recordCount={records.length}
        open={showNewEvalDialog}
        onOpenChange={setShowNewEvalDialog}
        graderInfo={graderInfo}
        previousBest={previousBest}
        versionInfo={versionInfo}
        onEditGrader={() => {
          setShowNewEvalDialog(false);
          const nodePath = "grader";
          setSelectedNodeId(nodePath);
          openTab(nodePath);
          onNavigate?.(nodePath);
        }}
        onRun={async (sampleSize, rolloutModel) => {
          const jobId = await startDryRun(sampleSize, rolloutModel);
          toast.success(`Evaluation started with ${sampleSize} samples.`);
          const nodePath = `evaluations/jobs/${jobId}`;
          setSelectedNodeId(nodePath);
          openTab(nodePath);
          onNavigate?.(nodePath);
        }}
      />
    </div>
  );
}

// ============================================================================
// Section & Item Components
// ============================================================================

function SidebarSection({
  title,
  icon,
  count,
  isLoading,
  action,
  children,
  onTitleClick,
  isTitleActive,
}: {
  readonly title: string;
  readonly icon?: React.ReactNode;
  readonly count?: number;
  readonly isLoading?: boolean;
  readonly action?: { icon: React.ReactNode; title: string; onClick: () => void };
  readonly children: React.ReactNode;
  readonly onTitleClick?: () => void;
  readonly isTitleActive?: boolean;
}) {
  const titleContent = (
    <>
      {icon && <span className="opacity-50">{icon}</span>}
      {title}
      {count !== undefined && (
        <span className="ml-1.5 text-muted-foreground/40 font-normal">{count}</span>
      )}
    </>
  );

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-4 py-1.5">
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] hover:text-foreground transition-colors cursor-pointer",
              isTitleActive ? "text-[rgb(var(--theme-500))]" : "text-muted-foreground",
            )}
          >
            {titleContent}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {titleContent}
          </span>
        )}
        <div className="flex items-center gap-1">
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-[rgb(var(--theme-500))]" />}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              title={action.title}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
            >
              {action.icon}
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function SidebarItem({ icon, label, badge, isActive, isNested, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 text-[13px] transition-colors text-left",
        isNested ? "py-1.5 pl-10 pr-4" : "py-1.5 pl-6 pr-4",
        isActive
          ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="opacity-50 shrink-0">{icon}</span>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex-1 truncate min-w-0">{label}</span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {badge}
    </button>
  );
}

function SidebarDivider() {
  return <div className="h-px bg-border/50 mx-4 my-2" />;
}

// ============================================================================
// Badge Components
// ============================================================================

function CountBadge({ count }: { readonly count: number }) {
  if (count === 0) {
    // Show explicit 0 with muted style so users see the topic exists but is
    // empty — hiding the badge made it look inconsistent with sibling topics.
    return (
      <span className="ml-auto text-[10px] text-muted-foreground/30 bg-muted/20 px-1.5 py-px rounded-full tabular-nums shrink-0">
        0
      </span>
    );
  }
  return (
    <span className="ml-auto text-[10px] text-muted-foreground/50 bg-muted/50 px-1.5 py-px rounded-full tabular-nums shrink-0">
      {count}
    </span>
  );
}


// ============================================================================
// Topic Tree Items (recursive, nested under Training Data)
// ============================================================================

function TopicTreeItems({
  node,
  topicCounts,
  selectedNodeId,
  onSelect,
  depth,
  collapsedParents,
  onToggleParent,
  parentPath = "data",
}: {
  readonly node: TopicHierarchyNode;
  readonly topicCounts: Map<string, number>;
  readonly selectedNodeId: string | null;
  readonly onSelect: (nodeId: string) => void;
  readonly depth: number;
  readonly collapsedParents: Set<string>;
  readonly onToggleParent: (name: string) => void;
  readonly parentPath?: string;
}) {
  const nodeId = `${parentPath}/${node.name}`;
  const count = getTopicRecordCount(node, topicCounts);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = collapsedParents.has(node.name);
  const paddingLeft = 24 + depth * 16;

  if (hasChildren) {
    // Parent node — collapsible with chevron
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;
    return (
      <>
        <div
          className={cn(
            "w-full flex items-center gap-0 text-[13px] py-1.5 pr-4 transition-colors text-left",
            selectedNodeId === nodeId
              ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          style={{ paddingLeft }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleParent(node.name); }}
            className="p-0.5 shrink-0 hover:bg-muted/50 rounded"
          >
            <Chevron className="w-3 h-3 opacity-50" />
          </button>
          <button
            type="button"
            onClick={() => onSelect(nodeId)}
            className="flex-1 flex items-center gap-1.5 min-w-0 text-left ml-1"
          >
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1 truncate min-w-0 font-medium">{node.name}</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  {node.name}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <CountBadge count={count} />
          </button>
        </div>
        {!isCollapsed && node.children!.map((child) => (
          <TopicTreeItems
            key={child.id || child.name}
            node={child}
            topicCounts={topicCounts}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            depth={depth + 1}
            collapsedParents={collapsedParents}
            onToggleParent={onToggleParent}
            parentPath={nodeId}
          />
        ))}
      </>
    );
  }

  // Leaf node — clickable, indented
  // Topics with 0 records and no children are likely category labels
  // that lost their hierarchy (flat upload). Show them dimmer.
  const isEmptyCategory = count === 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(nodeId)}
      className={cn(
        "w-full flex items-center gap-2 text-[13px] py-1.5 pr-4 transition-colors text-left",
        selectedNodeId === nodeId
          ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
          : isEmptyCategory
            ? "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      style={{ paddingLeft: paddingLeft + 14 }}
    >
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("flex-1 truncate min-w-0", isEmptyCategory && "italic")}>{node.name}</span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            {isEmptyCategory ? `${node.name} (category — no records)` : node.name}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <CountBadge count={count} />
    </button>
  );
}

function getTopicRecordCount(node: TopicHierarchyNode, topicCounts: Map<string, number>): number {
  let total = topicCounts.get(node.name) || 0;
  if (node.children) {
    for (const child of node.children) {
      total += getTopicRecordCount(child, topicCounts);
    }
  }
  return total;
}

/** Find the full nested path for a topic name (e.g., "data/Chess Fundamentals/Board Setup & Notation") */
function findTopicPath(nodes: TopicHierarchyNode[], targetName: string, parentPath: string): string | null {
  for (const node of nodes) {
    const nodePath = `${parentPath}/${node.name}`;
    if (node.name === targetName) return nodePath;
    if (node.children) {
      const found = findTopicPath(node.children, targetName, nodePath);
      if (found) return found;
    }
  }
  return null;
}

/** Check if a topic name corresponds to a parent node (has children) in the hierarchy */
function hasChildrenInHierarchy(nodes: TopicHierarchyNode[], name: string): boolean {
  for (const node of nodes) {
    if (node.name === name) return (node.children?.length ?? 0) > 0;
    if (node.children && hasChildrenInHierarchy(node.children, name)) return true;
  }
  return false;
}

// ============================================================================
// Status helpers
// ============================================================================


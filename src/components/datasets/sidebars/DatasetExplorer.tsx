/**
 * DatasetExplorer
 *
 * Section-based sidebar for the dataset detail view.
 * Matches the mockup design: grouped sections with items, badges, and
 * nested topic hierarchy under "Training Data".
 *
 * Sections:
 * - Source Documents (knowledge sources)
 * - Training Data (topics + "All Topics" nav)
 * - Eval Runs (evaluation jobs)
 * - Training Jobs (finetune jobs)
 */

import { useState, useMemo, useCallback } from "react";
import {
  FileText,
  BarChart3,
  Brain,
  Loader2,
  Plus,
  Library,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NewJobDialog } from "@/components/finetune/content/NewJobDialog";
import { NewEvaluationDialog } from "@/components/datasets/evaluation-dialog/NewEvaluationDialog";
import type { TopicHierarchyNode } from "@/types/dataset-types";

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
  const { dataset, records, isGeneratingTraces } = DatasetDetailConsumer();
  const { sources } = KnowledgeSourcesConsumer();
  const { jobs: dryRunJobs, runningJob: runningEval, startDryRun } = EvalJobsConsumer();
  const { filteredJobs: finetuneJobs, loadJobs: loadFinetuneJobs } = FinetuneJobsConsumer();
  const { openTab } = WorkspaceTabsConsumer();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showNewJobDialog, setShowNewJobDialog] = useState(false);
  const [showNewEvalDialog, setShowNewEvalDialog] = useState(false);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

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

  // Build topic counts map from records
  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      if (r.topic) {
        const leaf = r.topic.split("/").pop() || r.topic;
        counts.set(leaf, (counts.get(leaf) || 0) + 1);
      }
    }
    return counts;
  }, [records]);

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);

    // Route all knowledge/* clicks to Sources view via the "data" tab
    if (nodeId.startsWith("knowledge/")) {
      const sourceId = nodeId === "knowledge/all-sources"
        ? null
        : nodeId.replace("knowledge/", "");
      // Open "data" tab first so DatasetMainContent mounts and can catch the view switch
      openTab("data");
      // Dispatch after a tick so the component mounts first
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("vllora_switch_view", {
          detail: { viewMode: "sources", sourceId },
        }));
      }, 50);
      return;
    }

    openTab(nodeId);
    // "All Topics" (nodeId === "data") → switch to canvas view
    if (nodeId === "data") {
      window.dispatchEvent(new CustomEvent("vllora_switch_view", {
        detail: { viewMode: "canvas" },
      }));
    } else if (nodeId.startsWith("data/")) {
      // Specific topic → always switch to table view (TopicDetailView)
      window.dispatchEvent(new CustomEvent("vllora_switch_view", {
        detail: { viewMode: "table" },
      }));
    }
    onNavigate?.(nodeId);
  }, [openTab, onNavigate]);

  const hasActiveJob = finetuneJobs.some(
    (j) => j.status === "running" || j.status === "pending"
  );
  const hasGraderScript = !!dataset?.evalScript;
  const topicHierarchy = dataset?.topicHierarchy?.hierarchy;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto py-4">
      {/* ── Source Documents ── */}
      {sources.length > 0 && (
        <SidebarSection title="Source Documents" count={sources.length}>
          <SidebarItem
            icon={<Library className="w-3.5 h-3.5" />}
            label="All Sources"
            badge={<CountBadge count={sources.length} />}
            isActive={selectedNodeId === "knowledge/all-sources"}
            onClick={() => handleSelect("knowledge/all-sources")}
          />
          {sources.map((src) => (
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
        </SidebarSection>
      )}

      {sources.length > 0 && <SidebarDivider />}

      {/* ── Training Data ── */}
      <SidebarSection
        title="Training Data"
        count={records.length}
        isLoading={isGeneratingTraces}
      >
        {/* All Topics item */}
        <SidebarItem
          icon={<Library className="w-3.5 h-3.5" />}
          label="All Topics"
          badge={<CountBadge count={records.length} />}
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

      {/* ── Eval Runs ── */}
      <SidebarSection
        title="Eval Runs"
        count={dryRunJobs.length}
        action={{
          icon: <Plus className="w-3 h-3" />,
          title: "New evaluation",
          onClick: () => {
            if (!hasGraderScript) {
              toast.info("Configure and save a grader script first.");
            } else if (runningEval) {
              toast.info("An evaluation is already running.");
            } else {
              setShowNewEvalDialog(true);
            }
          },
        }}
      >
        {dryRunJobs.map((job) => {
          const statusInfo = getEvalJobStatus(job.status);
          return (
            <SidebarItem
              key={job.id}
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label={`eval-${job.id.slice(0, 6)}`}
              badge={<StatusBadge {...statusInfo} />}
              isActive={selectedNodeId === `evaluations/jobs/${job.id}`}
              onClick={() => handleSelect(`evaluations/jobs/${job.id}`)}
            />
          );
        })}
        {dryRunJobs.length === 0 && (
          <p className="px-6 py-2 text-[11px] text-muted-foreground/40 italic">No evaluation runs yet</p>
        )}
      </SidebarSection>

      {/* ── Training Jobs ── */}
      <SidebarSection
        title="Training Jobs"
        count={finetuneJobs.length}
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
        {finetuneJobs.map((job) => {
          const statusInfo = getFinetuneJobStatus(job.status);
          const displayName = job.suffix || `ft-${job.id.slice(0, 6)}`;
          return (
            <SidebarItem
              key={job.id}
              icon={<Brain className="w-3.5 h-3.5" />}
              label={displayName}
              badge={<StatusBadge {...statusInfo} />}
              isActive={selectedNodeId === `finetune/${job.id}`}
              onClick={() => handleSelect(`finetune/${job.id}`)}
            />
          );
        })}
        {finetuneJobs.length === 0 && (
          <p className="px-6 py-2 text-[11px] text-muted-foreground/40 italic">No finetune jobs yet</p>
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
        />
      )}

      <NewEvaluationDialog
        recordCount={records.length}
        open={showNewEvalDialog}
        onOpenChange={setShowNewEvalDialog}
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
  count,
  isLoading,
  action,
  children,
}: {
  readonly title: string;
  readonly count?: number;
  readonly isLoading?: boolean;
  readonly action?: { icon: React.ReactNode; title: string; onClick: () => void };
  readonly children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 text-muted-foreground/40 font-normal">{count}</span>
          )}
        </span>
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
      <span className="flex-1 truncate min-w-0">{label}</span>
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
  if (count === 0) return null;
  return (
    <span className="ml-auto text-[10px] text-muted-foreground/50 bg-muted/50 px-1.5 py-px rounded-full tabular-nums shrink-0">
      {count}
    </span>
  );
}

function StatusBadge({ label, color }: { readonly label: string; readonly color: string }) {
  return (
    <span className={cn(
      "ml-auto text-[10px] px-1.5 py-px rounded-full shrink-0 font-medium",
      color,
    )}>
      {label}
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
}: {
  readonly node: TopicHierarchyNode;
  readonly topicCounts: Map<string, number>;
  readonly selectedNodeId: string | null;
  readonly onSelect: (nodeId: string) => void;
  readonly depth: number;
  readonly collapsedParents: Set<string>;
  readonly onToggleParent: (name: string) => void;
}) {
  const nodeId = `data/${node.name}`;
  const count = getTopicRecordCount(node, topicCounts);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = collapsedParents.has(node.name);
  const paddingLeft = 24 + depth * 16;

  if (hasChildren) {
    // Parent node — collapsible with chevron
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;
    return (
      <>
        <button
          type="button"
          onClick={() => onToggleParent(node.name)}
          className={cn(
            "w-full flex items-center gap-1.5 text-[13px] py-1.5 pr-4 transition-colors text-left",
            selectedNodeId === nodeId
              ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          style={{ paddingLeft }}
        >
          <Chevron className="w-3 h-3 shrink-0 opacity-50" />
          <span className="flex-1 truncate min-w-0 font-medium">{node.name}</span>
          <CountBadge count={count} />
        </button>
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
          />
        ))}
      </>
    );
  }

  // Leaf node — clickable, indented
  return (
    <button
      type="button"
      onClick={() => onSelect(nodeId)}
      className={cn(
        "w-full flex items-center gap-2 text-[13px] py-1.5 pr-4 transition-colors text-left",
        selectedNodeId === nodeId
          ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      style={{ paddingLeft: paddingLeft + 14 }}
    >
      <span className="flex-1 truncate min-w-0">{node.name}</span>
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

// ============================================================================
// Status helpers
// ============================================================================

function getEvalJobStatus(status: string): { label: string; color: string } {
  if (status === "running") return { label: "running", color: "bg-blue-500/15 text-blue-400" };
  if (status === "completed") return { label: "done", color: "bg-emerald-500/15 text-emerald-400" };
  if (status === "failed") return { label: "failed", color: "bg-red-500/15 text-red-400" };
  return { label: status, color: "bg-muted/50 text-muted-foreground" };
}

function getFinetuneJobStatus(status: string): { label: string; color: string } {
  if (status === "running") return { label: "running", color: "bg-blue-500/15 text-blue-400" };
  if (status === "succeeded") return { label: "done", color: "bg-emerald-500/15 text-emerald-400" };
  if (status === "failed") return { label: "failed", color: "bg-red-500/15 text-red-400" };
  if (status === "pending") return { label: "queued", color: "bg-amber-500/15 text-amber-400" };
  return { label: status, color: "bg-muted/50 text-muted-foreground" };
}

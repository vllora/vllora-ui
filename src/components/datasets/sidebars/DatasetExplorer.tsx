/**
 * DatasetExplorer
 *
 * VS Code-style file tree for the dataset sidebar.
 * Consumes 5+ React contexts to build a virtual file tree representing
 * the dataset's structure: readme, plan, tasks, logs, documents, topics,
 * evaluations, finetune jobs, and quick stats.
 *
 * Each "file" maps to real data in IndexedDB/contexts.
 * Clicking a node navigates to the appropriate workspace section.
 */

import { useState, useMemo, useCallback } from "react";
import {
  FileText,
  FolderOpen,
  Folder,
  FileCode,
  ClipboardCheck,
  Brain,
  BarChart3,
  ScrollText,
  ListChecks,
  BookOpen,
  Sparkles,
  Plus,
} from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { PlanConsumer } from "@/contexts/PlanContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { useChatStateStore } from "@distri/react";
import { toast } from "sonner";
import { FileTreeItem } from "./FileTreeItem";
import { NewJobDialog } from "@/components/finetune/content/NewJobDialog";
import type { FileTreeNode, FileTreeBadge } from "./types";
import type { TopicHierarchyNode } from "@/types/dataset-types";

// ============================================================================
// Icon helpers (consistent sizing for tree items)
// ============================================================================

const ICON_CLS = "w-4 h-4";

function folderIcon(expandedSet: Set<string>, id: string) {
  return expandedSet.has(id)
    ? <FolderOpen className={`${ICON_CLS} text-amber-500`} />
    : <Folder className={`${ICON_CLS} text-amber-500`} />;
}

// ============================================================================
// Tree builders
// ============================================================================

function buildTopicChildren(
  nodes: TopicHierarchyNode[],
  parentPath: string,
  topicCounts: Map<string, number>,
  expandedNodes: Set<string>,
): FileTreeNode[] {
  return nodes.map((node) => {
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;
    const nodeId = `data/${path}`;
    const count = getTopicRecordCount(node, topicCounts);
    const hasChildren = node.children && node.children.length > 0;

    return {
      id: nodeId,
      name: node.name,
      type: hasChildren ? "folder" : "file",
      icon: hasChildren
        ? folderIcon(expandedNodes, nodeId)
        : <FileText className={`${ICON_CLS} text-muted-foreground`} />,
      badge: count > 0 ? { label: String(count), variant: "count" as const } : undefined,
      children: hasChildren
        ? buildTopicChildren(node.children!, path, topicCounts, expandedNodes)
        : undefined,
    };
  });
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
// Component
// ============================================================================

interface DatasetExplorerProps {
  onNavigate?: (nodeId: string) => void;
}

export function DatasetExplorer({ onNavigate }: DatasetExplorerProps) {
  const { dataset, records } = DatasetDetailConsumer();
  const { sources } = KnowledgeSourcesConsumer();
  const { jobs: dryRunJobs } = DryRunJobsConsumer();
  const { filteredJobs: finetuneJobs, loadJobs: loadFinetuneJobs } = FinetuneJobsConsumer();
  const { proposedPlan, planStatus, hasPlanProposed } = PlanConsumer();
  const { openTab } = WorkspaceTabsConsumer();
  const todos = useChatStateStore((s) => s.todos);

  // Expanded/selected state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    () => new Set(["documents", "data", "evaluations", "finetune"])
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // New finetune job dialog
  const [showNewJobDialog, setShowNewJobDialog] = useState(false);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Build topic counts map from records
  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      if (r.topic) {
        // Use the leaf topic name (last segment of path)
        const leaf = r.topic.split("/").pop() || r.topic;
        counts.set(leaf, (counts.get(leaf) || 0) + 1);
      }
    }
    return counts;
  }, [records]);

  // ============================================================================
  // Build the virtual file tree
  // ============================================================================

  const tree = useMemo((): FileTreeNode[] => {
    const nodes: FileTreeNode[] = [];

    // --- Top-level files ---

    // readme.md
    nodes.push({
      id: "readme.md",
      name: "readme.md",
      type: "file",
      icon: <BookOpen className={`${ICON_CLS} text-blue-500`} />,
      badge: dataset?.readme ? undefined : { label: "empty", variant: "default" },
    });

    // plan.md
    const planBadge: FileTreeBadge | undefined = (() => {
      if (planStatus === "executing") return { label: "executing", variant: "loading" };
      if (planStatus === "completed") return { label: "done", variant: "success" };
      if (planStatus === "failed") return { label: "failed", variant: "error" };
      if (hasPlanProposed) return { label: "proposed", variant: "warning" };
      return { label: "empty", variant: "default" };
    })();

    nodes.push({
      id: "plan.md",
      name: "plan.md",
      type: "file",
      icon: <ScrollText className={`${ICON_CLS} text-[rgb(var(--theme-500))]`} />,
      badge: planBadge,
    });

    // tasks.md — only shown when there are active tasks
    const activeTodos = todos.filter((t) => t.status !== "done");
    if (activeTodos.length > 0) {
      nodes.push({
        id: "tasks.md",
        name: "tasks.md",
        type: "file",
        icon: <ListChecks className={`${ICON_CLS} text-orange-500`} />,
        badge: { label: String(activeTodos.length), variant: "count" },
      });
    }

    // logs.md — only shown when there's activity to display
    const hasLogs = sources.length > 0 || dryRunJobs.length > 0 ||
      finetuneJobs.length > 0 || !!dataset?.topicHierarchy?.generatedAt;
    if (hasLogs) {
      nodes.push({
        id: "logs.md",
        name: "logs.md",
        type: "file",
        icon: <FileText className={`${ICON_CLS} text-muted-foreground`} />,
      });
    }

    // --- documents/ (only shown when there are knowledge sources) ---
    if (sources.length > 0) {
      const docChildren: FileTreeNode[] = sources.map((src) => {
        const statusBadge: FileTreeBadge | undefined = (() => {
          if (src.status === "processing") return { label: "loading", variant: "loading" };
          if (src.status === "ready") return { label: "done", variant: "success" };
          if (src.status === "failed") return { label: "error", variant: "error" };
          if (src.status === "pending") return { label: "pending", variant: "default" };
          return undefined;
        })();

        return {
          id: `documents/${src.id}`,
          name: src.name,
          type: "file" as const,
          icon: <FileText className={`${ICON_CLS} text-blue-400`} />,
          badge: statusBadge,
        };
      });

      nodes.push({
        id: "documents",
        name: "documents",
        type: "folder",
        icon: folderIcon(expandedNodes, "documents"),
        badge: { label: String(sources.length), variant: "count" },
        children: docChildren,
        isExpandable: true,
      });
    }

    // --- topics/ (only shown when dataset has records or a topic hierarchy) ---
    const topicHierarchy = dataset?.topicHierarchy?.hierarchy;
    const topicChildren = topicHierarchy
      ? buildTopicChildren(topicHierarchy, "", topicCounts, expandedNodes)
      : [];

    if (records.length > 0 || topicChildren.length > 0) {
      nodes.push({
        id: "data",
        name: "data",
        type: "folder",
        icon: folderIcon(expandedNodes, "data"),
        badge: records.length > 0
          ? { label: String(records.length), variant: "count" }
          : undefined,
        children: topicChildren,
        isExpandable: true,
      });
    }

    // --- evaluations/ (only shown when grader script exists or dry-run jobs exist) ---
    const hasEvalContent = !!dataset?.evalScript || dryRunJobs.length > 0;
    if (hasEvalContent) {
      const evalChildren: FileTreeNode[] = [];

      // grader-script.ts
      evalChildren.push({
        id: "evaluations/grader-script.ts",
        name: "grader-script.ts",
        type: "file",
        icon: <FileCode className={`${ICON_CLS} text-yellow-500`} />,
        badge: dataset?.evalScript
          ? undefined
          : { label: "empty", variant: "default" },
      });

      // evaluations/jobs/
      if (dryRunJobs.length > 0) {
        const jobChildren: FileTreeNode[] = dryRunJobs.map((job) => {
          const statusBadge: FileTreeBadge | undefined = (() => {
            if (job.status === "running") return { label: "running", variant: "loading" };
            if (job.status === "completed") return { label: "pass", variant: "success" };
            if (job.status === "failed") return { label: "fail", variant: "error" };
            return { label: job.status, variant: "default" };
          })();

          return {
            id: `evaluations/jobs/${job.id}`,
            name: `eval-${job.id.slice(0, 6)}`,
            type: "file" as const,
            icon: <ClipboardCheck className={`${ICON_CLS} text-violet-500`} />,
            badge: statusBadge,
          };
        });

        evalChildren.push({
          id: "evaluations/jobs",
          name: "jobs",
          type: "folder",
          icon: folderIcon(expandedNodes, "evaluations/jobs"),
          children: jobChildren,
          isExpandable: true,
        });
      }

      nodes.push({
        id: "evaluations",
        name: "evaluations",
        type: "folder",
        icon: <ClipboardCheck className={`${ICON_CLS} text-violet-500`} />,
        children: evalChildren,
        isExpandable: true,
      });
    }

    // --- finetune/ (always shown — users need access to start training manually) ---
    {
      const finetuneChildren: FileTreeNode[] = finetuneJobs.map((job) => {
        const statusBadge: FileTreeBadge | undefined = (() => {
          if (job.status === "running") return { label: "running", variant: "loading" };
          if (job.status === "succeeded") return { label: "done", variant: "success" };
          if (job.status === "failed") return { label: "failed", variant: "error" };
          if (job.status === "pending") return { label: "queued", variant: "default" };
          return { label: job.status, variant: "default" };
        })();

        const displayName = job.suffix || job.provider_job_id.slice(0, 12);

        return {
          id: `finetune/${job.id}`,
          name: displayName,
          type: "file" as const,
          icon: <Sparkles className={`${ICON_CLS} text-[rgb(var(--theme-500))]`} />,
          badge: statusBadge,
        };
      });

      const hasActiveJob = finetuneJobs.some(
        (j) => j.status === "running" || j.status === "pending"
      );

      nodes.push({
        id: "finetune",
        name: "finetune",
        type: "folder",
        icon: <Brain className={`${ICON_CLS} text-orange-500`} />,
        badge: finetuneJobs.length > 0
          ? { label: String(finetuneJobs.length), variant: "count" }
          : undefined,
        children: finetuneChildren,
        isExpandable: true,
        actions: [
          {
            key: "new-job",
            icon: <Plus className="w-3.5 h-3.5" />,
            title: "New finetune job",
            onClick: () => {
              if (hasActiveJob) {
                toast.info("A finetune job is already running. Wait for it to finish before starting a new one.");
              } else {
                setShowNewJobDialog(true);
              }
            },
          },
        ],
      });
    }

    // --- insights/ (only shown when dataset has records to report on) ---
    if (records.length > 0) {
      const statsChildren: FileTreeNode[] = [
        {
          id: "insights/coverage.md",
          name: "coverage.md",
          type: "file",
          icon: <BarChart3 className={`${ICON_CLS} text-cyan-500`} />,
        },
        {
          id: "insights/balance.md",
          name: "balance.md",
          type: "file",
          icon: <BarChart3 className={`${ICON_CLS} text-cyan-500`} />,
        },
        {
          id: "insights/quality-scores.md",
          name: "quality-scores.md",
          type: "file",
          icon: <Sparkles className={`${ICON_CLS} text-cyan-500`} />,
        },
      ];

      nodes.push({
        id: "insights",
        name: "insights",
        type: "folder",
        icon: folderIcon(expandedNodes, "insights"),
        children: statsChildren,
        isExpandable: true,
      });
    }

    return nodes;
  }, [
    dataset, records, sources, dryRunJobs, finetuneJobs,
    proposedPlan, planStatus, hasPlanProposed, todos,
    topicCounts, expandedNodes,
  ]);

  // ============================================================================
  // Navigation: map tree node click → existing section navigation
  // ============================================================================

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);

    // Open a workspace tab for this node.
    // Single-click = preview tab (italic, replaced by next preview).
    // The WorkspaceTabBridge in DatasetDetailContentV2 syncs
    // activeTabPath → contentSection for rendering.
    openTab(nodeId);

    onNavigate?.(nodeId);
  }, [openTab, onNavigate]);

  // ============================================================================
  // Render
  // ============================================================================

  const hasActiveJob = finetuneJobs.some(
    (j) => j.status === "running" || j.status === "pending"
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => (
          <FileTreeItem
            key={node.id}
            node={node}
            level={0}
            expandedNodes={expandedNodes}
            selectedNodeId={selectedNodeId}
            onToggle={toggleExpand}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* New finetune job dialog (triggered from finetune folder "+" action) */}
      {dataset?.id && (
        <NewJobDialog
          datasetId={dataset.id}
          onSuccess={loadFinetuneJobs}
          disabled={hasActiveJob}
          open={showNewJobDialog}
          onOpenChange={setShowNewJobDialog}
          initialConfig={dataset.trainingConfig}
        />
      )}
    </div>
  );
}

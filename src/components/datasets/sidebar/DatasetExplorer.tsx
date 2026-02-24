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
  FlaskConical,
  Rocket,
  BarChart3,
  ScrollText,
  ListChecks,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { PlanConsumer } from "@/contexts/PlanContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { useChatStateStore } from "@distri/react";
import { FileTreeItem } from "./FileTreeItem";
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
    const nodeId = `topics/${path}`;
    const count = getTopicRecordCount(node, topicCounts);
    const hasChildren = node.children && node.children.length > 0;

    return {
      id: nodeId,
      name: hasChildren ? `${node.name}/` : node.name,
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
  const { filteredJobs: finetuneJobs } = FinetuneJobsConsumer();
  const { proposedPlan, planStatus, hasPlanProposed } = PlanConsumer();
  const { openTab } = WorkspaceTabsConsumer();
  const todos = useChatStateStore((s) => s.todos);

  // Expanded/selected state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    () => new Set(["documents", "topics", "evaluations", "finetune"])
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
      if (planStatus === "executing") return { label: "running", variant: "loading" };
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

    // tasks.md
    const activeTodos = todos.filter((t) => t.status !== "done");
    nodes.push({
      id: "tasks.md",
      name: "tasks.md",
      type: "file",
      icon: <ListChecks className={`${ICON_CLS} text-orange-500`} />,
      badge: activeTodos.length > 0
        ? { label: String(activeTodos.length), variant: "count" }
        : { label: "empty", variant: "default" },
    });

    // logs.md
    nodes.push({
      id: "logs.md",
      name: "logs.md",
      type: "file",
      icon: <FileText className={`${ICON_CLS} text-muted-foreground`} />,
    });

    // --- documents/ ---
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
      name: "documents/",
      type: "folder",
      icon: folderIcon(expandedNodes, "documents"),
      badge: sources.length > 0 ? { label: String(sources.length), variant: "count" } : undefined,
      children: docChildren,
      isExpandable: true,
    });

    // --- topics/ ---
    const topicHierarchy = dataset?.topicHierarchy?.hierarchy;
    const topicChildren = topicHierarchy
      ? buildTopicChildren(topicHierarchy, "", topicCounts, expandedNodes)
      : [];

    nodes.push({
      id: "topics",
      name: "topics/",
      type: "folder",
      icon: folderIcon(expandedNodes, "topics"),
      badge: records.length > 0
        ? { label: String(records.length), variant: "count" }
        : undefined,
      children: topicChildren,
      isExpandable: true,
    });

    // --- evaluations/ ---
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
          name: `dry-run-${job.id.slice(0, 6)}.json`,
          type: "file" as const,
          icon: <FlaskConical className={`${ICON_CLS} text-violet-500`} />,
          badge: statusBadge,
        };
      });

      evalChildren.push({
        id: "evaluations/jobs",
        name: "jobs/",
        type: "folder",
        icon: folderIcon(expandedNodes, "evaluations/jobs"),
        children: jobChildren,
        isExpandable: true,
      });
    }

    nodes.push({
      id: "evaluations",
      name: "evaluations/",
      type: "folder",
      icon: folderIcon(expandedNodes, "evaluations"),
      children: evalChildren,
      isExpandable: true,
    });

    // --- finetune/ ---
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
        name: `${displayName}.json`,
        type: "file" as const,
        icon: <Rocket className={`${ICON_CLS} text-[rgb(var(--theme-500))]`} />,
        badge: statusBadge,
      };
    });

    nodes.push({
      id: "finetune",
      name: "finetune/",
      type: "folder",
      icon: folderIcon(expandedNodes, "finetune"),
      badge: finetuneJobs.length > 0
        ? { label: String(finetuneJobs.length), variant: "count" }
        : undefined,
      children: finetuneChildren,
      isExpandable: true,
    });

    // --- quick-stats/ ---
    const statsChildren: FileTreeNode[] = [
      {
        id: "quick-stats/coverage.md",
        name: "coverage.md",
        type: "file",
        icon: <BarChart3 className={`${ICON_CLS} text-cyan-500`} />,
      },
      {
        id: "quick-stats/balance.md",
        name: "balance.md",
        type: "file",
        icon: <BarChart3 className={`${ICON_CLS} text-cyan-500`} />,
      },
      {
        id: "quick-stats/quality-scores.md",
        name: "quality-scores.md",
        type: "file",
        icon: <Sparkles className={`${ICON_CLS} text-cyan-500`} />,
      },
    ];

    nodes.push({
      id: "quick-stats",
      name: "quick-stats/",
      type: "folder",
      icon: folderIcon(expandedNodes, "quick-stats"),
      children: statsChildren,
      isExpandable: true,
    });

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

  // Project header
  const datasetName = dataset?.name || "Untitled Dataset";
  const stepLabel = dataset?.topicHierarchy ? "In Fine-tune" : "Setup";
  const recordLabel = records.length > 0 ? `${records.length} record${records.length !== 1 ? "s" : ""}` : "No records";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Project header */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wide truncate">
          {datasetName}
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {stepLabel} &middot; {recordLabel}
        </p>
      </div>

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
    </div>
  );
}

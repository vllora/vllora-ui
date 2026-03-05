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
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  AlertTriangle,
  Circle,
  Package,
  Download,
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
import { NewEvaluationDialog } from "@/components/datasets/evaluation-dialog/NewEvaluationDialog";
import type { FileTreeNode, FileTreeBadge } from "./types";
import type { TopicHierarchyNode } from "@/types/dataset-types";
import { computeSourceRecordStats } from "@/lib/distri-finetune-tools/steps/shared/source-record-counts";
import {
  assembleSkillPackageFiles,
} from "@/lib/distri-finetune-tools/steps/generate-skill-package";

// ============================================================================
// Icon helpers (consistent sizing for tree items)
// ============================================================================

const ICON_CLS = "w-4 h-4";
const BADGE_CLS = "w-3.5 h-3.5";

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

/** Slugify a single segment for skill example file paths */
function slugifySegment(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Build hierarchical skill examples tree from topic hierarchy.
 * Non-leaf nodes → folders, leaf nodes → .jsonl files with record count badge.
 */
function buildSkillExamplesChildren(
  nodes: readonly TopicHierarchyNode[],
  parentSlug: string,
  topicCounts: Map<string, number>,
  expandedNodes: Set<string>,
): FileTreeNode[] {
  return nodes.map((node) => {
    const slug = slugifySegment(node.name);
    const slugPath = parentSlug ? `${parentSlug}/${slug}` : slug;
    const hasChildren = node.children && node.children.length > 0;
    const count = getTopicRecordCount(node, topicCounts);

    if (hasChildren) {
      const folderId = `skill/examples/${slugPath}`;
      return {
        id: folderId,
        name: slug,
        type: "folder" as const,
        icon: folderIcon(expandedNodes, folderId),
        isExpandable: true,
        expandOnly: true,
        badge: count > 0 ? { label: String(count), variant: "count" as const } : undefined,
        children: buildSkillExamplesChildren(node.children!, slugPath, topicCounts, expandedNodes),
      };
    }

    return {
      id: `skill/examples/${slugPath}.jsonl`,
      name: `${slug}.jsonl`,
      type: "file" as const,
      icon: <FileCode className={`${ICON_CLS} text-purple-400`} />,
      badge: count > 0 ? { label: String(count), variant: "count" as const } : undefined,
    };
  });
}

/**
 * Build a mapping from skill leaf node IDs to their corresponding data/ paths.
 * Both trees share the same TopicHierarchyNode hierarchy — this builds
 * the lookup by walking nodes in parallel with both naming conventions.
 */
function buildSkillToDataMap(
  nodes: readonly TopicHierarchyNode[],
  parentSlug: string,
  parentDataPath: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    const slug = slugifySegment(node.name);
    const slugPath = parentSlug ? `${parentSlug}/${slug}` : slug;
    const dataPath = parentDataPath ? `${parentDataPath}/${node.name}` : node.name;
    if (node.children?.length) {
      for (const [k, v] of buildSkillToDataMap(node.children, slugPath, dataPath)) {
        map.set(k, v);
      }
    } else {
      map.set(`skill/examples/${slugPath}.jsonl`, `data/${dataPath}`);
    }
  }
  return map;
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
  const { jobs: dryRunJobs, runningJob: runningEval, startDryRun } = DryRunJobsConsumer();
  const { filteredJobs: finetuneJobs, loadJobs: loadFinetuneJobs } = FinetuneJobsConsumer();
  const { proposedPlan, planStatus, hasPlanProposed } = PlanConsumer();
  const { openTab } = WorkspaceTabsConsumer();
  const todos = useChatStateStore((s) => s.todos);

  // Expanded/selected state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    () => new Set(["documents", "data", "evaluations", "finetune", "skill", "skill/examples", "insights"])
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Per-source record counts for document node badges
  const sourceRecordStats = useMemo(
    () => computeSourceRecordStats(records, dataset?.knowledgeCoverageStats),
    [records, dataset?.knowledgeCoverageStats],
  );

  // New finetune job dialog
  const [showNewJobDialog, setShowNewJobDialog] = useState(false);
  // New evaluation dialog
  const [showNewEvalDialog, setShowNewEvalDialog] = useState(false);

  // Download skill package ZIP
  const handleDownloadSkillZip = useCallback(async () => {
    if (!dataset?.id) return;
    try {
      const files = await assembleSkillPackageFiles(dataset.id);
      if (!files) {
        toast.error("No data available to download");
        return;
      }
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const root = zip.folder(files.skillSlug)!;
      root.file("SKILL.md", files.skillMd);
      root.file("examples/index.md", files.examplesIndex);
      for (const [slug, jsonl] of files.topicFiles) {
        root.file(`examples/${slug}.jsonl`, jsonl);
      }
      if (files.knowledgeDoc) {
        root.file("knowledge/domain-knowledge.md", files.knowledgeDoc);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${files.skillSlug}.zip`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 100);
      toast.success("Skill package downloaded");
    } catch {
      toast.error("Failed to download skill package");
    }
  }, [dataset?.id]);

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

  // Map skill .jsonl leaf node IDs → corresponding data/ paths
  // so clicking a .jsonl in the Explorer opens the records view instead
  const skillToDataMap = useMemo(() => {
    const hierarchy = dataset?.topicHierarchy?.hierarchy;
    if (!hierarchy?.length) {
      // Flat fallback: no hierarchy, map from slug to topic name
      const map = new Map<string, string>();
      for (const [topicName] of topicCounts) {
        const slug = slugifySegment(topicName);
        map.set(`skill/examples/${slug}.jsonl`, `data/${topicName}`);
      }
      return map;
    }
    return buildSkillToDataMap(hierarchy, "", "");
  }, [dataset?.topicHierarchy?.hierarchy, topicCounts]);

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
      badge: dataset?.readme ? undefined : {
        label: "empty", variant: "default",
        icon: <Circle className={`${BADGE_CLS} opacity-40`} />,
        tooltip: "No content yet",
      },
    });

    // plan.md
    const planBadge: FileTreeBadge | undefined = (() => {
      if (planStatus === "executing") return {
        label: "executing", variant: "loading" as const,
        icon: <Loader2 className={`${BADGE_CLS} animate-spin`} />,
        tooltip: "Plan executing",
      };
      if (planStatus === "completed") return {
        label: "done", variant: "success" as const,
        icon: <CheckCircle2 className={BADGE_CLS} />,
        tooltip: "Plan completed",
      };
      if (planStatus === "failed") return {
        label: "failed", variant: "error" as const,
        icon: <XCircle className={BADGE_CLS} />,
        tooltip: "Plan failed",
      };
      if (hasPlanProposed) return {
        label: "proposed", variant: "warning" as const,
        icon: <AlertTriangle className={BADGE_CLS} />,
        tooltip: "Plan proposed — review needed",
      };
      return {
        label: "empty", variant: "default" as const,
        icon: <Circle className={`${BADGE_CLS} opacity-40`} />,
        tooltip: "No plan yet",
      };
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
          if (src.status === "processing") return {
            label: "loading", variant: "loading" as const,
            icon: <Loader2 className={`${BADGE_CLS} animate-spin`} />,
            tooltip: "Processing document",
          };
          if (src.status === "ready") {
            const recCount = sourceRecordStats.get(src.id)?.recordCount;
            if (recCount && recCount > 0) {
              return {
                label: `${recCount} rec`, variant: "count" as const,
                tooltip: `${recCount} record${recCount !== 1 ? "s" : ""} generated from this document`,
              };
            }
            return {
              label: "done", variant: "success" as const,
              icon: <CheckCircle2 className={BADGE_CLS} />,
              tooltip: "Document ready",
            };
          }
          if (src.status === "failed") return {
            label: "error", variant: "error" as const,
            icon: <XCircle className={BADGE_CLS} />,
            tooltip: "Processing failed",
          };
          if (src.status === "pending") return {
            label: "pending", variant: "default" as const,
            icon: <Clock className={BADGE_CLS} />,
            tooltip: "Waiting to process",
          };
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
        badge: { label: String(sources.length), variant: "count" },
        children: docChildren,
        isExpandable: true,
        isSection: true,
      });
    }

    // --- data/ (always shown) ---
    const topicHierarchy = dataset?.topicHierarchy?.hierarchy;
    const topicChildren = topicHierarchy
      ? buildTopicChildren(topicHierarchy, "", topicCounts, expandedNodes)
      : [];

    const dataBadge: FileTreeBadge | undefined = isGeneratingTraces
      ? {
        label: "generating", variant: "loading" as const,
        icon: <Loader2 className={`${BADGE_CLS} animate-spin`} />,
        tooltip: "Generating training data",
      }
      : records.length > 0
        ? { label: String(records.length), variant: "count" }
        : undefined;

    nodes.push({
      id: "data",
      name: "data",
      type: "folder",
      badge: dataBadge,
      children: topicChildren,
      isExpandable: topicChildren.length > 0,
      isSection: true,
      emptyText: "No training data yet",
    });

    // --- evaluations/ (always shown) ---
    {
      const evalChildren: FileTreeNode[] = [];

      // grader-script.ts
      evalChildren.push({
        id: "evaluations/grader-script.ts",
        name: "grader-script.ts",
        type: "file",
        icon: <FileCode className={`${ICON_CLS} text-yellow-500`} />,
        badge: dataset?.evalScript
          ? undefined
          : {
            label: "configure", variant: "warning" as const,
            icon: <AlertTriangle className={BADGE_CLS} />,
            tooltip: "Required — configure a grader script to run evaluations",
          },
      });

      // evaluations/jobs/ (always shown so "+" action is accessible)
      const hasGraderScript = !!dataset?.evalScript;
      const jobChildren: FileTreeNode[] = dryRunJobs.map((job) => {
        const statusBadge: FileTreeBadge | undefined = (() => {
          if (job.status === "running") return {
            label: "running", variant: "loading" as const,
            icon: <Loader2 className={`${BADGE_CLS} animate-spin`} />,
            tooltip: "Evaluation running",
          };
          if (job.status === "completed") return {
            label: "pass", variant: "success" as const,
            icon: <CheckCircle2 className={BADGE_CLS} />,
            tooltip: "Evaluation completed",
          };
          if (job.status === "failed") return {
            label: "fail", variant: "error" as const,
            icon: <XCircle className={BADGE_CLS} />,
            tooltip: "Evaluation failed",
          };
          return {
            label: job.status, variant: "default" as const,
            icon: <Clock className={BADGE_CLS} />,
            tooltip: `Status: ${job.status}`,
          };
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
        emptyText: "No evaluation runs yet",
        actions: [
          {
            key: "run-eval",
            icon: <Plus className="w-3.5 h-3.5" />,
            title: "New evaluation",
            onClick: () => {
              if (!hasGraderScript) {
                toast.info("Configure and save a grader script first.");
              } else if (runningEval) {
                toast.info("An evaluation is already running. Wait for it to finish.");
              } else {
                setShowNewEvalDialog(true);
              }
            },
          },
        ],
      });

      const evalSectionBadge: FileTreeBadge | undefined = runningEval
        ? {
          label: "running", variant: "loading" as const,
          icon: <Loader2 className={`${BADGE_CLS} animate-spin`} />,
          tooltip: "Evaluation running",
        }
        : undefined;

      nodes.push({
        id: "evaluations",
        name: "evaluations",
        type: "folder",
        badge: evalSectionBadge,
        children: evalChildren,
        isExpandable: true,
        isSection: true,
        emptyText: "No evaluations run yet",
      });
    }

    // --- finetune/ (always shown — users need access to start training manually) ---
    {
      const finetuneChildren: FileTreeNode[] = finetuneJobs.map((job) => {
        const statusBadge: FileTreeBadge | undefined = (() => {
          if (job.status === "running") return {
            label: "running", variant: "loading" as const,
            icon: <Loader2 className={`${BADGE_CLS} animate-spin`} />,
            tooltip: "Training in progress",
          };
          if (job.status === "succeeded") return {
            label: "done", variant: "success" as const,
            icon: <CheckCircle2 className={BADGE_CLS} />,
            tooltip: "Training completed",
          };
          if (job.status === "failed") return {
            label: "failed", variant: "error" as const,
            icon: <XCircle className={BADGE_CLS} />,
            tooltip: "Training failed",
          };
          if (job.status === "pending") return {
            label: "queued", variant: "default" as const,
            icon: <Clock className={BADGE_CLS} />,
            tooltip: "Queued — waiting to start",
          };
          return {
            label: job.status, variant: "default" as const,
            icon: <Clock className={BADGE_CLS} />,
            tooltip: `Status: ${job.status}`,
          };
        })();

        const displayName = job.suffix || `ft-${job.id.slice(0, 6)}`;

        return {
          id: `finetune/${job.id}`,
          name: displayName,
          type: "file" as const,
          icon: <Brain className={`${ICON_CLS} text-orange-500`} />,
          badge: statusBadge,
        };
      });

      const hasActiveJob = finetuneJobs.some(
        (j) => j.status === "running" || j.status === "pending"
      );

      const finetuneSectionBadge: FileTreeBadge | undefined = hasActiveJob
        ? {
          label: "training", variant: "loading" as const,
          icon: <Loader2 className={`${BADGE_CLS} animate-spin`} />,
          tooltip: "Finetune job in progress",
        }
        : finetuneJobs.length > 0
          ? { label: String(finetuneJobs.length), variant: "count" }
          : undefined;

      nodes.push({
        id: "finetune",
        name: "finetune",
        type: "folder",
        badge: finetuneSectionBadge,
        children: finetuneChildren,
        isExpandable: true,
        isSection: true,
        emptyText: "No finetune jobs yet",
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

    // --- skill/ (always shown — empty state when no records) ---
    {
      const skillChildren: FileTreeNode[] = [];

      if (records.length > 0) {
        // SKILL.md
        skillChildren.push({
          id: "skill/SKILL.md",
          name: "SKILL.md",
          type: "file",
          icon: <FileText className={`${ICON_CLS} text-purple-400`} />,
        });

        // examples/ — build hierarchical tree from topic hierarchy (or flat fallback)
        const exampleChildren: FileTreeNode[] = [
          {
            id: "skill/examples/index.md",
            name: "index.md",
            type: "file",
            icon: <FileText className={`${ICON_CLS} text-purple-400`} />,
          },
        ];

        const hierarchy = dataset?.topicHierarchy?.hierarchy;
        if (hierarchy && hierarchy.length > 0) {
          // Hierarchical: mirror topic tree as nested folders/files
          exampleChildren.push(
            ...buildSkillExamplesChildren(hierarchy, "", topicCounts, expandedNodes),
          );
        } else {
          // Flat fallback: no hierarchy available
          const sortedTopics = [...topicCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
          for (const [topicName, count] of sortedTopics) {
            const slug = slugifySegment(topicName);
            exampleChildren.push({
              id: `skill/examples/${slug}.jsonl`,
              name: `${slug}.jsonl`,
              type: "file",
              icon: <FileCode className={`${ICON_CLS} text-purple-400`} />,
              badge: count > 0 ? { label: String(count), variant: "count" } : undefined,
            });
          }
        }

        skillChildren.push({
          id: "skill/examples",
          name: "examples",
          type: "folder",
          icon: folderIcon(expandedNodes, "skill/examples"),
          isExpandable: true,
          children: exampleChildren,
        });

        // knowledge/ — only if knowledge sources exist
        const hasReadySources = sources.some((s) => s.status === "ready");
        if (hasReadySources) {
          skillChildren.push({
            id: "skill/knowledge",
            name: "knowledge",
            type: "folder",
            icon: folderIcon(expandedNodes, "skill/knowledge"),
            isExpandable: true,
            children: [
              {
                id: "skill/knowledge/domain-knowledge.md",
                name: "domain-knowledge.md",
                type: "file",
                icon: <FileText className={`${ICON_CLS} text-purple-400`} />,
              },
            ],
          });
        }
      }

      nodes.push({
        id: "skill",
        name: "skill",
        type: "folder",
        icon: <Package className={`${ICON_CLS} text-purple-500`} />,
        children: skillChildren,
        isExpandable: skillChildren.length > 0,
        isSection: true,
        emptyText: "Training data will be packaged as a skill folder you can deploy to your own agent",
        actions: skillChildren.length > 0
          ? [{
              key: "download-zip",
              icon: <Download className="w-3.5 h-3.5" />,
              title: "Download skill package ZIP",
              onClick: handleDownloadSkillZip,
            }]
          : undefined,
      });
    }

    // --- insights/ (always shown, children are data-driven) ---
    {
      const statsChildren: FileTreeNode[] = [];

      // coverage.md — shown when there are records with topics (coverage can be computed)
      const hasCoverage = records.length > 0 && !!dataset?.topicHierarchy?.hierarchy;
      if (hasCoverage) {
        statsChildren.push({
          id: "insights/coverage.md",
          name: "coverage.md",
          type: "file",
          icon: <BarChart3 className={`${ICON_CLS} text-cyan-500`} />,
          badge: dataset?.coverageStats
            ? { label: "ready", variant: "success" as const, icon: <CheckCircle2 className={BADGE_CLS} />, tooltip: "Coverage analysis available" }
            : { label: "pending", variant: "default" as const, icon: <Circle className={`${BADGE_CLS} opacity-40`} />, tooltip: "Run coverage analysis to populate" },
        });
      }

      // balance.md — shown when coverage stats exist (balance score is computed)
      if (dataset?.coverageStats?.balanceScore != null) {
        statsChildren.push({
          id: "insights/balance.md",
          name: "balance.md",
          type: "file",
          icon: <BarChart3 className={`${ICON_CLS} text-cyan-500`} />,
        });
      }

      // quality-scores.md — shown when evaluations have been completed
      const hasCompletedEval = dryRunJobs.some((j) => j.status === "completed");
      if (hasCompletedEval) {
        statsChildren.push({
          id: "insights/quality-scores.md",
          name: "quality-scores.md",
          type: "file",
          icon: <Sparkles className={`${ICON_CLS} text-cyan-500`} />,
        });
      }

      nodes.push({
        id: "insights",
        name: "insights",
        type: "folder",
        children: statsChildren,
        isExpandable: true,
        isSection: true,
        emptyText: "Insights will appear as you progress",
      });
    }

    return nodes;
  }, [
    dataset, records, sources, dryRunJobs, finetuneJobs,
    proposedPlan, planStatus, hasPlanProposed, todos,
    topicCounts, expandedNodes, isGeneratingTraces, handleDownloadSkillZip,
  ]);

  // ============================================================================
  // Navigation: map tree node click → existing section navigation
  // ============================================================================

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);

    // Redirect skill example .jsonl files to the data records view
    // so both Explorer paths show the same full-featured records table.
    const dataPath = skillToDataMap.get(nodeId);
    if (dataPath) {
      openTab(dataPath);
    } else {
      openTab(nodeId);
    }

    onNavigate?.(nodeId);
  }, [openTab, onNavigate, skillToDataMap]);

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

      {/* New evaluation dialog (triggered from jobs folder "+" action) */}
      <NewEvaluationDialog
        recordCount={records.length}
        open={showNewEvalDialog}
        onOpenChange={setShowNewEvalDialog}
        onRun={async (sampleSize, rolloutModel) => {
          await startDryRun(sampleSize, rolloutModel);
          toast.success(`Evaluation started with ${sampleSize} samples.`);
        }}
      />
    </div>
  );
}

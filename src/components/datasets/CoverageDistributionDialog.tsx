/**
 * CoverageDistributionDialog
 *
 * Full-screen dialog showing topic coverage distribution with hierarchical tree view.
 * Shows the topic hierarchy structure with counts and coverage metrics.
 */

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  FolderTree,
  BarChart3,
  Info,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { TopicHierarchyNode } from "@/types/dataset-types";

interface CoverageDistributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Map of topic name to record count */
  topicCounts: Record<string, number>;
  /** Total number of records */
  totalRecords: number;
  /** Topic hierarchy tree structure */
  topicHierarchy?: TopicHierarchyNode[];
}

interface TreeNodeData {
  id: string;
  name: string;
  count: number;
  percentage: number;
  isLeaf: boolean;
  depth: number;
  children?: TreeNodeData[];
}

/**
 * Calculate balance score (0-1) based on how evenly distributed topics are.
 */
function calculateBalanceScore(percentages: number[]): number {
  if (percentages.length === 0) return 0;
  if (percentages.length === 1) return 1;

  const min = Math.min(...percentages);
  const max = Math.max(...percentages);

  if (max === 0) return 0;
  return min / max;
}

/**
 * Get balance status label and color
 */
function getBalanceStatus(score: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (score >= 0.7) {
    return {
      label: "Good",
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    };
  } else if (score >= 0.4) {
    return {
      label: "Fair",
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    };
  } else {
    return {
      label: "Poor",
      color: "text-red-600",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    };
  }
}

/**
 * Build tree data with counts from hierarchy
 */
function buildTreeData(
  nodes: TopicHierarchyNode[] | undefined,
  topicCounts: Record<string, number>,
  totalRecords: number,
  depth: number = 0
): TreeNodeData[] {
  if (!nodes || nodes.length === 0) return [];

  return nodes.map((node) => {
    const isLeaf = !node.children || node.children.length === 0;
    const children = isLeaf
      ? undefined
      : buildTreeData(node.children, topicCounts, totalRecords, depth + 1);

    // For leaf nodes, use the count directly
    // For parent nodes, aggregate children counts
    const count = isLeaf
      ? topicCounts[node.name] || 0
      : children?.reduce((sum, child) => sum + child.count, 0) || 0;

    const percentage = totalRecords > 0 ? (count / totalRecords) * 100 : 0;

    return {
      id: node.id,
      name: node.name,
      count,
      percentage,
      isLeaf,
      depth,
      children,
    };
  });
}

/**
 * Count leaf topics in hierarchy
 */
function countLeafTopics(nodes: TopicHierarchyNode[] | undefined): number {
  if (!nodes || nodes.length === 0) return 0;

  return nodes.reduce((sum, node) => {
    if (!node.children || node.children.length === 0) {
      return sum + 1;
    }
    return sum + countLeafTopics(node.children);
  }, 0);
}

/**
 * Get all leaf percentages for balance calculation
 */
function getLeafPercentages(nodes: TreeNodeData[]): number[] {
  const percentages: number[] = [];

  function traverse(items: TreeNodeData[]) {
    for (const item of items) {
      if (item.isLeaf) {
        percentages.push(item.percentage);
      } else if (item.children) {
        traverse(item.children);
      }
    }
  }

  traverse(nodes);
  return percentages;
}

/**
 * Tree node component for rendering hierarchy
 */
function TreeNode({
  node,
  selectedTopic,
  onSelect,
  avgPercentage,
  expandedNodes,
  onToggleExpand,
}: {
  node: TreeNodeData;
  selectedTopic: string | null;
  onSelect: (name: string) => void;
  avgPercentage: number;
  expandedNodes: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedTopic === node.name;
  const isUnderRepresented = node.percentage < avgPercentage * 0.5;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/10 border border-primary/30"
            : "hover:bg-muted/50"
        )}
        style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
        onClick={() => onSelect(node.name)}
      >
        {/* Expand/collapse button for parent nodes */}
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-5" /> // Spacer for leaf nodes
        )}

        {/* Topic name */}
        <span
          className={cn(
            "flex-1 text-sm",
            node.isLeaf ? "font-medium" : "font-semibold text-muted-foreground"
          )}
        >
          {node.name}
          {!node.isLeaf && (
            <span className="ml-1 text-xs text-muted-foreground font-normal">
              ({node.children?.length} subtopics)
            </span>
          )}
        </span>

        {/* Count badge */}
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            node.count === 0
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : isUnderRepresented
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-muted text-foreground"
          )}
        >
          {node.count.toLocaleString()}
        </span>

        {/* Progress bar */}
        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              node.count === 0
                ? "bg-red-500"
                : isUnderRepresented
                ? "bg-amber-500"
                : "bg-primary"
            )}
            style={{ width: `${Math.min(node.percentage, 100)}%` }}
          />
        </div>

        {/* Percentage */}
        <span className="text-xs text-muted-foreground w-12 text-right">
          {node.percentage.toFixed(1)}%
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedTopic={selectedTopic}
              onSelect={onSelect}
              avgPercentage={avgPercentage}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CoverageDistributionDialog({
  open,
  onOpenChange,
  topicCounts,
  totalRecords,
  topicHierarchy,
}: CoverageDistributionDialogProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Build tree data with counts
  const treeData = useMemo(
    () => buildTreeData(topicHierarchy, topicCounts, totalRecords),
    [topicHierarchy, topicCounts, totalRecords]
  );

  // Expand all nodes by default when dialog opens
  useEffect(() => {
    if (open && treeData.length > 0) {
      const allIds = new Set<string>();
      function collectIds(nodes: TreeNodeData[]) {
        for (const node of nodes) {
          if (node.children && node.children.length > 0) {
            allIds.add(node.id);
            collectIds(node.children);
          }
        }
      }
      collectIds(treeData);
      setExpandedNodes(allIds);
    }
  }, [open, treeData]);

  // Calculate statistics
  const { balanceScore, totalLeafTopics, coveredTopics, avgPercentage } = useMemo(() => {
    const percentages = getLeafPercentages(treeData);
    const score = calculateBalanceScore(percentages);
    const total = countLeafTopics(topicHierarchy);
    const covered = Object.values(topicCounts).filter((c) => c > 0).length;
    const avg = percentages.length > 0 ? 100 / percentages.length : 0;

    return {
      balanceScore: score,
      totalLeafTopics: total,
      coveredTopics: covered,
      avgPercentage: avg,
    };
  }, [treeData, topicHierarchy, topicCounts]);

  const balanceStatus = getBalanceStatus(balanceScore);
  const coveragePercentage = totalLeafTopics > 0 ? (coveredTopics / totalLeafTopics) * 100 : 0;

  // Get under-represented topics
  const underRepresented = useMemo(() => {
    const threshold = avgPercentage * 0.5;
    return Object.entries(topicCounts)
      .filter(([, count]) => {
        const pct = totalRecords > 0 ? (count / totalRecords) * 100 : 0;
        return pct < threshold;
      })
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalRecords > 0 ? (count / totalRecords) * 100 : 0,
      }))
      .sort((a, b) => a.count - b.count);
  }, [topicCounts, totalRecords, avgPercentage]);

  // Prepare chart data for leaf topics (sorted by count descending)
  const chartData = useMemo(() => {
    return Object.entries(topicCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalRecords > 0 ? (count / totalRecords) * 100 : 0,
        isUnderRepresented: totalRecords > 0 ? (count / totalRecords) * 100 < avgPercentage * 0.5 : false,
      }))
      .sort((a, b) => b.count - a.count);
  }, [topicCounts, totalRecords, avgPercentage]);

  const handleToggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const allIds = new Set<string>();
    function collectIds(nodes: TreeNodeData[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          allIds.add(node.id);
          collectIds(node.children);
        }
      }
    }
    collectIds(treeData);
    setExpandedNodes(allIds);
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Topic Coverage Distribution
          </DialogTitle>
          <DialogDescription>
            View how records are distributed across your topic hierarchy. Click on a topic to select it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Coverage</p>
              <p className="text-2xl font-bold">
                {coveredTopics}/{totalLeafTopics}
              </p>
              <p className="text-xs text-muted-foreground">
                topics with data ({coveragePercentage.toFixed(0)}%)
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Total Records</p>
              <p className="text-2xl font-bold">{totalRecords.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                across all topics
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Balance Score</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">{(balanceScore * 100).toFixed(0)}%</p>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium",
                    balanceStatus.bgColor,
                    balanceStatus.color
                  )}
                >
                  {balanceStatus.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                min/max ratio
              </p>
            </div>
          </div>

          {/* Balance Score Explanation */}
          <div className="rounded-md bg-muted/30 border p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">What makes a good distribution?</p>
                <p>Balance Score measures how evenly records are spread across topics (min topic % ÷ max topic %).</p>
                <div className="flex gap-4 mt-1">
                  <span><strong className="text-green-600">Good (≥70%)</strong>: Even distribution</span>
                  <span><strong className="text-amber-600">Fair (40-70%)</strong>: Some imbalance</span>
                  <span><strong className="text-red-600">Poor (&lt;40%)</strong>: Large gaps</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs for Distribution Chart and Topic Hierarchy */}
          <Tabs defaultValue="chart" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chart" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Distribution Chart
              </TabsTrigger>
              <TabsTrigger value="hierarchy" className="flex items-center gap-2">
                <FolderTree className="h-4 w-4" />
                Topic Hierarchy
              </TabsTrigger>
            </TabsList>

            {/* Distribution Chart Tab */}
            <TabsContent value="chart" className="mt-4">
              {chartData.length > 0 ? (
                <div className="rounded-lg border bg-card p-4">
                  {/* Legend */}
                  <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-primary" />
                      <span>Normal</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-amber-500" />
                      <span>Under-represented (&lt;50% of average)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-red-500" />
                      <span>No data</span>
                    </div>
                  </div>

                  {/* Horizontal Bar Chart */}
                  <div style={{ height: Math.max(200, chartData.length * 32) }} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 5, right: 80, left: 0, bottom: 5 }}
                      >
                        <XAxis
                          type="number"
                          domain={[0, "dataMax"]}
                          tickFormatter={(value) => value.toLocaleString()}
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover border rounded-md shadow-md p-2 text-xs">
                                <p className="font-medium">{data.name}</p>
                                <p className="text-muted-foreground">
                                  {data.count.toLocaleString()} records ({data.percentage.toFixed(1)}%)
                                </p>
                                {data.isUnderRepresented && (
                                  <p className="text-amber-600 mt-1">⚠️ Under-represented</p>
                                )}
                              </div>
                            );
                          }}
                        />
                        {avgPercentage > 0 && (
                          <ReferenceLine
                            x={(avgPercentage / 100) * totalRecords}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="3 3"
                            strokeOpacity={0.5}
                          />
                        )}
                        <Bar
                          dataKey="count"
                          radius={[0, 4, 4, 0]}
                          maxBarSize={24}
                          onClick={(data) => {
                            const name = data.name as string | undefined;
                            if (name) {
                              setSelectedTopic(selectedTopic === name ? null : name);
                            }
                          }}
                          cursor="pointer"
                        >
                          {chartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                entry.count === 0
                                  ? "hsl(0 84% 60%)"
                                  : entry.isUnderRepresented
                                  ? "hsl(38 92% 50%)"
                                  : "hsl(var(--primary))"
                              }
                              fillOpacity={selectedTopic === entry.name ? 1 : 0.7}
                              stroke={selectedTopic === entry.name ? "hsl(var(--primary))" : "transparent"}
                              strokeWidth={selectedTopic === entry.name ? 2 : 0}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
                  No topic data available
                </div>
              )}
            </TabsContent>

            {/* Topic Hierarchy Tab */}
            <TabsContent value="hierarchy" className="mt-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-primary" />
                      <span>Normal</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-amber-500" />
                      <span>Under-represented</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-red-500" />
                      <span>No data</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleExpandAll}>
                      Expand All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCollapseAll}>
                      Collapse All
                    </Button>
                  </div>
                </div>

                {/* Tree */}
                <div className="max-h-[350px] overflow-y-auto border rounded-md p-2 bg-muted/20">
                  {treeData.length > 0 ? (
                    treeData.map((node) => (
                      <TreeNode
                        key={node.id}
                        node={node}
                        selectedTopic={selectedTopic}
                        onSelect={setSelectedTopic}
                        avgPercentage={avgPercentage}
                        expandedNodes={expandedNodes}
                        onToggleExpand={handleToggleExpand}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No topic hierarchy configured
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Under-represented warnings */}
          {underRepresented.length > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {underRepresented.length} under-represented topic{underRepresented.length !== 1 ? "s" : ""}
                  </p>
                  <div className="text-sm text-amber-600/80 dark:text-amber-400/80 space-y-1">
                    {underRepresented.slice(0, 5).map((topic) => {
                      const needed = Math.ceil(
                        (avgPercentage / 100) * totalRecords - topic.count
                      );
                      return (
                        <div key={topic.name} className="flex items-center justify-between">
                          <span>
                            <strong>{topic.name}</strong>: {topic.count} records ({topic.percentage.toFixed(1)}%)
                          </span>
                          {needed > 0 && (
                            <span className="text-xs">
                              Need ~{needed.toLocaleString()} more
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {underRepresented.length > 5 && (
                      <p className="text-xs opacity-70">
                        +{underRepresented.length - 5} more under-represented topics
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

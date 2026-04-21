/**
 * DatasetOverviewPanel
 *
 * Overview tab layout:
 * - Top: 4 stat cards (Data Coverage, Topic Diversity, Eval Health, Finetune Status)
 * - Bottom dual-pane: Left 60% README viewer | Right 40% Activity Timeline
 */

import { useState, useEffect, useMemo } from "react";
import { DatasetReadmeViewer } from "@/components/datasets/readme-viewer";
import { StructuredOverviewPane } from "@/components/datasets/overview-left-pane/StructuredOverviewPane";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlanConsumer } from "@/contexts/PlanContext";
import { EvalJobsConsumer } from "@/contexts/EvalJobsContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { getStoredPlan } from "@/lib/distri-finetune-tools/steps/proposed-plan-store";
import { computeDatasetInsights, getLeafTopicsFromHierarchy } from "@/components/datasets/record-utils";
import { getJobCompletedRows, getJobTotalRows } from "@/types/eval-job";
import { emitter, setPendingHighlight } from "@/utils/eventEmitter";
import type { ExecutionProgress } from "@/lib/distri-finetune-tools/steps/execute-plan";
import type { Dataset } from "@/types/dataset-types";

import type { DatasetOverviewPanelProps, ActivityEntry, ActivityEntryStatus, ActivityEntryType } from "./types";
import {
  asRecord,
  asString,
  getStepCategoryBadge,
  getStepDetails,
  getEvaluationDetails,
  getFinetuneDetails,
  getEvalStatsForStep,
  getFinetuneJobForStep,
  navigateToEvalJob,
  navigateToFinetuneJob,
} from "./utils";
import { ActivityTimeline } from "./ActivityTimeline";
import { PipelineStrip } from "./PipelineStrip";
import { HealthRow } from "./HealthRow";
import { HierarchyInspector } from "./HierarchyInspector";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";

export function DatasetOverviewPanel({
  readme,
  readmeUpdatedAt,
  onExport,
  workflowId,
  onOverviewClick: _onOverviewClick,
}: DatasetOverviewPanelProps) {
  // Dataset data for stats cards
  const { sortedRecords, dataset } = DatasetDetailConsumer();

  const insights = useMemo(
    () => computeDatasetInsights(sortedRecords),
    [sortedRecords]
  );

  const leafTopicCount = useMemo(
    () =>
      getLeafTopicsFromHierarchy(dataset?.topicHierarchy?.hierarchy).length,
    [dataset]
  );

  // Plan execution steps — from PlanContext (live) or IndexedDB fallback
  const { executionProgress, isExecuting, planStatus, proposedPlan } =
    PlanConsumer();
  const [historicalProgress, setHistoricalProgress] =
    useState<ExecutionProgress | null>(null);
  const [historicalPlanTime, setHistoricalPlanTime] = useState<number | null>(
    null
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const stored = await getStoredPlan(workflowId);
      if (!cancelled && stored?.executionProgress) {
        setHistoricalProgress(stored.executionProgress);
        setHistoricalPlanTime(stored.updatedAt);
      }
      if (!cancelled) setIsLoadingHistory(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [workflowId, planStatus]);

  const activeProgress = executionProgress ?? historicalProgress;
  const planTimestamp = isExecuting ? Date.now() : historicalPlanTime;

  // Job/activity context used by multiple timeline entry types
  const { jobs: dryRunJobs } = EvalJobsConsumer();
  const { filteredJobs, latestJob } = FinetuneJobsConsumer();

  // Step entries
  const stepEntries: ActivityEntry[] = useMemo(
    () =>
      (activeProgress?.steps ?? [])
        .filter((s) => s.status !== "pending")
        .map((s) => {
          const stepResult = asRecord(s.result);
          const matchedDryRun =
            s.id === "dryrun"
              ? getEvalStatsForStep(stepResult, dryRunJobs, dataset?.evalStats)
              : undefined;
          const dryRunJobId =
            s.id === "dryrun"
              ? asString(stepResult?.dry_run_job_id) ?? matchedDryRun?.job?.id
              : undefined;

          const matchedFinetuneJob =
            s.id === "finetune"
              ? getFinetuneJobForStep(stepResult, filteredJobs)
              : undefined;
          const finetuneJobId =
            s.id === "finetune"
              ? asString(stepResult?.jobId) ??
                asString(stepResult?.job_id) ??
                asString(stepResult?.id) ??
                matchedFinetuneJob?.id
              : undefined;

          return {
            id: `step-${s.id}`,
            type: "step" as ActivityEntryType,
            label: s.name,
            categoryBadge: getStepCategoryBadge(s.id),
            status: s.status as ActivityEntryStatus,
            detail: s.message ?? undefined,
            secondaryDetail: s.error ?? undefined,
            timestamp: planTimestamp ?? undefined,
            progress: s.progress,
            details: getStepDetails({
              stepId: s.id,
              stepResult: s.result,
              plan: proposedPlan,
              dataset: (dataset as Dataset | null | undefined) ?? null,
              dryRunJobs,
              finetuneJobs: filteredJobs,
            }),
            action: dryRunJobId
              ? {
                  title: "Open evaluation job",
                  onClick: () => navigateToEvalJob(workflowId, dryRunJobId),
                }
              : finetuneJobId
              ? {
                  title: "Open fine-tune job",
                  onClick: () => navigateToFinetuneJob(workflowId, finetuneJobId),
                }
              : undefined,
          };
        }),
    [activeProgress, planTimestamp, proposedPlan, dataset, dryRunJobs, filteredJobs]
  );

  // Dry run evaluations
  const evalEntries: ActivityEntry[] = useMemo(
    () =>
      dryRunJobs
        .filter((j) => j.status !== "pending")
        .map((j) => {
          const completedRows = getJobCompletedRows(j);
          const totalRows = getJobTotalRows(j);
          const evalStatus: ActivityEntryStatus =
            j.status === "cancelled"
              ? "cancelled"
              : j.status === "running"
              ? "running"
              : j.status === "failed"
              ? "failed"
              : "completed";
          return {
            id: `eval-${j.id}`,
            type: "evaluation" as ActivityEntryType,
            label: "Evaluation Run",
            status: evalStatus,
            detail:
              j.result?.statistics.mean != null
                ? `${Math.round(j.result.statistics.mean * 100)}% avg score · ${j.sampleSize} samples`
                : `${j.sampleSize} samples`,
            secondaryDetail: j.rolloutModel
              ? `Model: ${j.rolloutModel}`
              : undefined,
            timestamp: j.completedAt ?? j.createdAt,
            progress:
              j.status === "running" && totalRows > 0
                ? Math.round((completedRows / totalRows) * 100)
                : undefined,
            details: getEvaluationDetails(j, dataset?.evalStats),
            action: {
              title: "Open evaluation job",
              onClick: () => navigateToEvalJob(workflowId, j.id),
            },
          };
        }),
    [dryRunJobs, dataset?.evalStats, workflowId]
  );

  // Finetune jobs
  const finetuneEntries: ActivityEntry[] = useMemo(
    () =>
      filteredJobs.map((j) => {
        const ftStatus: ActivityEntryStatus =
          j.status === "succeeded" ? "completed" : (j.status as ActivityEntryStatus);
        return {
          id: `ft-${j.id}`,
          type: "finetune" as ActivityEntryType,
          label: `Fine-tune · ${j.provider}`,
          status: ftStatus,
          detail: j.fine_tuned_model ?? j.base_model,
          secondaryDetail: j.error_message ?? undefined,
          timestamp: j.completed_at
            ? new Date(j.completed_at).getTime()
            : new Date(j.created_at).getTime(),
          details: getFinetuneDetails(j),
          action: {
            title: "Open fine-tune job",
            onClick: () => navigateToFinetuneJob(workflowId, j.id),
          },
        };
      }),
    [filteredJobs, workflowId]
  );

  // Merge and sort chronologically: oldest first for easier timeline scanning.
  const allEntries: ActivityEntry[] = useMemo(
    () =>
      [...stepEntries, ...evalEntries, ...finetuneEntries].sort((a, b) => {
        const aTime = a.timestamp ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.timestamp ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }),
    [stepEntries, evalEntries, finetuneEntries]
  );

  // Knowledge sources for the pipeline strip — already loaded by KnowledgeSourcesContext
  const { sources: knowledgeSources, count: sourcesCount, totalParts } = KnowledgeSourcesConsumer();
  const sourcesAggregate = sourcesCount || (dataset?.knowledgeSourceCount ?? 0);
  const partsAggregate = totalParts || knowledgeSources.reduce((sum, s) => sum + s.parts.length, 0);
  const trainingActive = filteredJobs.some(j => ['pending', 'queued', 'running'].includes(j.status));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PipelineStrip
        workflowId={workflowId}
        sourcesCount={sourcesAggregate}
        partsCount={partsAggregate}
        topicsCount={leafTopicCount || (dataset?.topicCount ?? 0)}
        recordsCount={dataset?.recordsCount ?? insights.totalRecords}
        trainingCount={filteredJobs.length}
        docsCount={knowledgeSources.filter((s) => s.traceBundleId == null).length}
        servicesCount={knowledgeSources.filter((s) => s.traceBundleId != null).length}
        topicsWithPartsPercent={topicsWithPartsPercent(dataset?.topicHierarchy?.hierarchy)}
        reviewCount={insights.totalRecords - insights.generatedRecords}
        qualityPercent={
          dataset?.evalStats?.statistics.mean != null
            ? dataset.evalStats.statistics.mean * 100
            : undefined
        }
        trainingActive={trainingActive}
        trainingStatus={latestJob?.status}
        trainingModel={latestJob?.fine_tuned_model ?? latestJob?.base_model}
        onSwitchTab={(tab) => emitter.emit("vllora_switch_tab", { workflowId, tab })}
      />

      {/* Quality hero + ministat sidecars */}
      <HealthRow
        evalJobs={dryRunJobs}
        evalStats={dataset?.evalStats}
        topicHierarchy={dataset?.topicHierarchy?.hierarchy}
        totalRecords={insights.totalRecords}
        onOpenEvalDetails={() => emitter.emit("vllora_switch_tab", { workflowId, tab: "evaluator" })}
      />

      {/* Topic hierarchy + click-to-inspect panel */}
      {dataset?.topicHierarchy?.hierarchy && dataset.topicHierarchy.hierarchy.length > 0 && (
        <div className="px-4 pb-3">
          <HierarchyInspector
            hierarchy={dataset.topicHierarchy.hierarchy}
            records={sortedRecords}
            sources={knowledgeSources}
            onOpenTopic={(topic) => {
              setPendingHighlight(topic);
              emitter.emit("vllora_switch_tab", { workflowId, tab: "records" });
            }}
            onOpenRecord={(recordId) => {
              setPendingHighlight(recordId);
              emitter.emit("vllora_switch_tab", { workflowId, tab: "records" });
              setTimeout(() => emitter.emit("vllora_highlight_record", { recordId }), 150);
            }}
          />
        </div>
      )}

      {/* Dual pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left 60%: Structured Overview + README */}
        <div className="w-[60%] border-r border-border flex flex-col overflow-hidden">
          <Tabs defaultValue="overview" className="flex flex-col h-full">
            <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TabsList className="h-8 bg-muted/50">
                  <TabsTrigger value="overview" className="h-6 px-2.5 text-xs data-[state=active]:bg-background/80">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="readme" className="h-6 px-2.5 text-xs data-[state=active]:bg-background/80">
                    README
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">
                Structured summary + generated markdown
              </div>
            </div>

            <TabsContent value="overview" className="flex-1 min-h-0 mt-0 overflow-hidden">
              <StructuredOverviewPane
                dataset={dataset}
                records={sortedRecords}
                dryRunJobs={dryRunJobs}
                latestFinetuneJob={latestJob}
                finetuneJobsCount={filteredJobs.length}
                proposedPlan={proposedPlan}
                onOpenRecords={() => emitter.emit("vllora_switch_tab", { workflowId, tab: "records" })}
                onOpenEvaluator={() => emitter.emit("vllora_switch_tab", { workflowId, tab: "evaluator" })}
                onOpenJobs={() => emitter.emit("vllora_switch_tab", { workflowId, tab: "jobs" })}
                onOpenRecord={(recordId) => {
                  setPendingHighlight(recordId);
                  emitter.emit("vllora_switch_tab", { workflowId, tab: "records" });
                  setTimeout(() => {
                    emitter.emit("vllora_highlight_record", { recordId });
                  }, 150);
                }}
                onOpenEvalJob={(jobId) => navigateToEvalJob(workflowId, jobId)}
                onOpenFinetuneJob={(jobId) => navigateToFinetuneJob(workflowId, jobId)}
                className="h-full"
              />
            </TabsContent>

            <TabsContent value="readme" className="flex-1 min-h-0 mt-0 overflow-hidden">
              <DatasetReadmeViewer
                readme={readme}
                readmeUpdatedAt={readmeUpdatedAt}
                onExport={onExport}
                headerLabel="README"
                className="h-full"
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right 40%: Activity Timeline */}
        <div className="w-[40%] flex flex-col overflow-hidden">
          <ActivityTimeline
            entries={allEntries}
            isLoading={isLoadingHistory && !executionProgress}
            isLive={isExecuting}
          />
        </div>
      </div>
    </div>
  );
}

/** % of leaf topics that have at least one linked knowledge-source part. */
function topicsWithPartsPercent(
  hierarchy: readonly import("@/types/dataset-types").TopicHierarchyNode[] | undefined,
): number | undefined {
  if (!hierarchy || hierarchy.length === 0) return undefined;
  let total = 0;
  let covered = 0;
  const walk = (n: import("@/types/dataset-types").TopicHierarchyNode) => {
    const isLeaf = !n.children || n.children.length === 0;
    if (isLeaf) {
      total += 1;
      if ((n.sourceChunkRefs?.length ?? 0) > 0) covered += 1;
    }
    for (const child of n.children ?? []) walk(child);
  };
  hierarchy.forEach(walk);
  return total === 0 ? 0 : (covered / total) * 100;
}

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
import { DatasetOverviewCard } from "@/components/datasets/dataset-detail-header/overview-card/DatasetOverviewCard";
import { getJobAverageScore, getJobCompletedRows, getJobTotalRows } from "@/types/eval-job";
import { emitter } from "@/utils/eventEmitter";
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
import { EvalHealthCard } from "./EvalHealthCard";
import { FinetuneStatusCard } from "./FinetuneStatusCard";
import { ActivityTimeline } from "./ActivityTimeline";

export function DatasetOverviewPanel({
  readme,
  readmeUpdatedAt,
  onExport,
  workflowId,
  onOverviewClick,
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

  // Eval health card data
  const completedJobsWithScore = useMemo(
    () => dryRunJobs.filter((j) => j.status === "completed" && getJobAverageScore(j) != null),
    [dryRunJobs]
  );
  const evalCurrentScore = completedJobsWithScore[0]
    ? getJobAverageScore(completedJobsWithScore[0])
    : undefined;
  const evalPrevScore = completedJobsWithScore[1]
    ? getJobAverageScore(completedJobsWithScore[1])
    : undefined;
  const criteriaCount = proposedPlan?.grader_config?.criteria?.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 4-col stat grid: overview card spans 2, eval + finetune take 1 each */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 shrink-0 border-b border-border">
        <div className="col-span-2 h-full">
          <DatasetOverviewCard
            total={insights.totalRecords}
            original={insights.originalRecords}
            generated={insights.generatedRecords}
            topicDistribution={insights.topicDistribution}
            uncategorizedCount={insights.uncategorizedCount}
            balanceRating={dataset?.coverageStats?.balanceRating}
            balanceScore={dataset?.coverageStats?.balanceScore}
            leafTopicCount={leafTopicCount}
            onClick={onOverviewClick}
            compact
          />
        </div>
        <EvalHealthCard
          currentScore={evalCurrentScore}
          prevScore={evalPrevScore}
          criteriaCount={criteriaCount}
          onClick={() => emitter.emit("vllora_switch_tab", { workflowId, tab: "evaluator" })}
        />
        <FinetuneStatusCard latestJob={latestJob} />
      </div>

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
                  emitter.emit("vllora_switch_tab", { workflowId, tab: "records" });
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("vllora_highlight_record", { detail: { recordId } }));
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

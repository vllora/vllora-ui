/**
 * DatasetStatsCards
 *
 * Displays key dataset statistics in a grid of cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useMemo, useState, useCallback } from "react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { computeCoverageStats, computeDatasetInsights } from "../record-utils";
import { DatasetOverviewCard } from "./overview-card";
import { DryRunEvaluationCard } from "./evaluation-card";
import { FinetuneJobCard } from "./FinetuneJobCard";
import { RecordsAnalyticsDialog } from "./detail-records-analytics-dialog";

export function DatasetStatsCards() {
  const { dataset, records, setDryRunDialog, setActiveSection, setImportDialog } = DatasetDetailConsumer();

  // Dialog state for records analytics
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);

  // Navigate to Evaluator tab when clicking on EvaluationCard
  const handleNavigateToEvaluator = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("finetune-set-view-mode", {
        detail: { section: "evaluator" },
      })
    );
  }, []);

  // Open dry run dialog
  const handleOpenDryRunDialog = useCallback(() => {
    setDryRunDialog(true);
  }, [setDryRunDialog]);

  // Navigate to Jobs tab when clicking on FinetuneJobCard
  // Also dispatch event to auto-expand the specified job
  const handleNavigateToJobs = useCallback((jobId?: string) => {
    setActiveSection("jobs");
    // Dispatch event to expand the specific job after tab switches
    if (jobId) {
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("finetune-expand-job", {
            detail: { jobId },
          })
        );
      }, 100);
    }
  }, [setActiveSection]);

  // Open import dialog when clicking on empty DatasetOverviewCard
  const handleOpenImportDialog = useCallback(() => {
    setImportDialog(true);
  }, [setImportDialog]);

  // Use shared utility for computing insights (memoized on records change)
  const insights = useMemo(() => computeDatasetInsights(records), [records]);
  const coverageStats = useMemo(() => computeCoverageStats({
    records,
    topic_hierarchy: dataset?.topicHierarchy
  }), [records, dataset?.topicHierarchy]);

  const canStartJob = records.length > 0;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Combined Records + Topics Overview */}
        <DatasetOverviewCard
          total={insights.totalRecords}
          original={insights.originalRecords}
          generated={insights.generatedRecords}
          topicDistribution={insights.topicDistribution}
          uncategorizedCount={insights.uncategorizedCount}
          balanceRating={coverageStats?.balanceRating}
          balanceScore={coverageStats?.balanceScore}
          onClick={() => setAnalyticsDialogOpen(true)}
          onImportClick={handleOpenImportDialog}
        />

        {/* Dry Run Evaluation Score Distribution */}
        <DryRunEvaluationCard
          evalScript={dataset?.evalScript}
          onConfigureClick={handleNavigateToEvaluator}
          onDryRunClick={handleOpenDryRunDialog}
        />

        {/* Finetune Job Status */}
        <FinetuneJobCard
          onStartClick={handleNavigateToJobs}
          onJobClick={handleNavigateToJobs}
          canStartJob={canStartJob}
        />
      </div>

      {/* Records Analytics Dialog */}
      <RecordsAnalyticsDialog
        open={analyticsDialogOpen}
        onOpenChange={setAnalyticsDialogOpen}
        records={records}
        recordStats={{
          total: insights.totalRecords,
          original: insights.originalRecords,
          generated: insights.generatedRecords,
          topicDistribution: insights.topicDistribution,
          uncategorizedCount: insights.uncategorizedCount,
          balanceRating: coverageStats?.balanceRating,
          balanceScore: coverageStats?.balanceScore,
        }}
      />
    </>
  );
}

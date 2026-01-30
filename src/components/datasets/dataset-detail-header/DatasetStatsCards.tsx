/**
 * DatasetStatsCards
 *
 * Displays key dataset statistics in a grid of cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useMemo, useState } from "react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { computeCoverageStats, computeDatasetInsights } from "../record-utils";
import { RecordsDonutCard } from "./RecordsDonutCard";
import { TopicsBarCard } from "./TopicsBarCard";
import { EvaluationCard } from "./EvaluationCard";
import { RecordsAnalyticsDialog } from "./detail-records-analytics-dialog";

export function DatasetStatsCards() {
  const { dataset, records, setEvaluationConfigDialog } = DatasetDetailConsumer();

  // Dialog state for records analytics
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);

  // Use shared utility for computing insights (memoized on records change)
  const insights = useMemo(() => computeDatasetInsights(records), [records]);
  const coverageStats = useMemo(() => computeCoverageStats({
    records,
    topic_hierarchy: dataset?.topicHierarchy
  }), [records, dataset?.topicHierarchy]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Records with Donut Chart */}
        <RecordsDonutCard
          total={insights.totalRecords}
          original={insights.originalRecords}
          generated={insights.generatedRecords}
          onClick={() => setAnalyticsDialogOpen(true)}
        />

        {/* Topics Distribution Bar */}
        <TopicsBarCard
          topicDistribution={insights.topicDistribution}
          uncategorizedCount={insights.uncategorizedCount}
          balanceRating={coverageStats?.balanceRating}
          balanceScore={coverageStats?.balanceScore}
        />

        {/* Evaluation Score Distribution */}
        <EvaluationCard
          evaluationConfig={dataset?.evaluationConfig}
          dryRunStats={dataset?.dryRunStats}
          onConfigureClick={() => setEvaluationConfigDialog(true)}
        />
      </div>

      {/* Records Analytics Dialog */}
      <RecordsAnalyticsDialog
        open={analyticsDialogOpen}
        onOpenChange={setAnalyticsDialogOpen}
        records={records}
      />
    </>
  );
}

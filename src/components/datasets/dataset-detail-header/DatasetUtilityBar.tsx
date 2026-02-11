/**
 * DatasetUtilityBar
 *
 * Utility bar with section tabs on the left.
 * Context-sensitive actions are now handled within each section's content.
 */

import { useMemo } from "react";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import type { ViewMode } from "./ViewModeToggle";
import { SectionTabs } from "./SectionTabs";

export type { ViewMode };
export type DatasetSection = "records" | "evaluator" | "jobs" | "readme" | "docs" | "plan" | 'deploy';

export interface DatasetUtilityBarProps {
  /** Current active section */
  activeSection: DatasetSection;
  /** Callback when section changes */
  onSectionChange: (section: DatasetSection) => void;
  /** Number of records in the dataset */
  recordsCount?: number;
  /** Whether the dataset has an evaluation function configured */
  hasEvaluator?: boolean;
  /** Number of uploaded knowledge sources */
  knowledgeSourcesCount?: number;
  /** Whether a plan is being generated or proposed */
  hasPlanActivity?: boolean;
}

export function DatasetUtilityBar({
  activeSection,
  onSectionChange,
  recordsCount = 0,
  hasEvaluator,
  knowledgeSourcesCount = 0,
  hasPlanActivity = false,
}: DatasetUtilityBarProps) {
  const { filteredJobs } = FinetuneJobsConsumer();
  const { isGeneratingTopics, isGeneratingTraces, generationProgress } = DatasetDetailConsumer();

  // Total jobs count (for completion status)
  const jobsCount = filteredJobs.length;

  // Detect which tabs have active background processing
  const processingTabs = useMemo(() => {
    const tabs = new Set<DatasetSection>();

    // Data tab: generating topics, traces, or training records
    if (isGeneratingTopics || isGeneratingTraces || generationProgress !== null) {
      tabs.add("records");
    }

    // Jobs tab: a finetune job is currently running
    const hasRunningJob = filteredJobs.some(
      (j) => j.status === "pending" || j.status === "running"
    );
    if (hasRunningJob) {
      tabs.add("jobs");
    }

    return tabs;
  }, [isGeneratingTopics, isGeneratingTraces, generationProgress, filteredJobs]);

  return (
    <div className="px-4 py-1.5 border-b border-border">
      <SectionTabs
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        recordsCount={recordsCount}
        hasEvaluator={hasEvaluator}
        jobsCount={jobsCount}
        knowledgeSourcesCount={knowledgeSourcesCount}
        hasPlanActivity={hasPlanActivity}
        processingTabs={processingTabs}
      />
    </div>
  );
}

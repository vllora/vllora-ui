/**
 * DatasetUtilityBar
 *
 * Utility bar with section tabs on the left.
 * Context-sensitive actions are now handled within each section's content.
 */

import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import type { ViewMode } from "./ViewModeToggle";
import { SectionTabs } from "./SectionTabs";

export type { ViewMode };
export type DatasetSection = "records" | "evaluator" | "jobs";

export interface DatasetUtilityBarProps {
  /** Current active section */
  activeSection: DatasetSection;
  /** Callback when section changes */
  onSectionChange: (section: DatasetSection) => void;
  /** Number of records in the dataset */
  recordsCount?: number;
  /** Whether the dataset has an evaluation function configured */
  hasEvaluator?: boolean;
}

export function DatasetUtilityBar({
  activeSection,
  onSectionChange,
  recordsCount = 0,
  hasEvaluator,
}: DatasetUtilityBarProps) {
  const { filteredJobs } = FinetuneJobsConsumer();

  // Count active jobs (pending or running)
  const activeJobsCount = filteredJobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  ).length;

  return (
    <div className="px-4 py-1.5 border-b border-border">
      <SectionTabs
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        recordsCount={recordsCount}
        hasEvaluator={hasEvaluator}
        activeJobsCount={activeJobsCount}
      />
    </div>
  );
}

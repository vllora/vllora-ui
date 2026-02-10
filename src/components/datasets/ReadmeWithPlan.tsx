/**
 * ReadmeWithPlan
 *
 * Simple wrapper for the README tab that shows the DatasetReadmeViewer.
 * Plan functionality has been moved to a separate PlanSection component.
 */

import { DatasetReadmeViewer } from "./DatasetReadmeViewer";

interface ReadmeWithPlanProps {
  datasetId: string;
  readme: string | null;
  readmeUpdatedAt: number | null;
  onExport: () => void;
  onRegenerate: () => Promise<void>;
  className?: string;
}

export function ReadmeWithPlan({
  readme,
  readmeUpdatedAt,
  onExport,
  onRegenerate,
  className,
}: ReadmeWithPlanProps) {
  return (
    <DatasetReadmeViewer
      readme={readme}
      readmeUpdatedAt={readmeUpdatedAt}
      onExport={onExport}
      onRegenerate={onRegenerate}
      className={className}
    />
  );
}

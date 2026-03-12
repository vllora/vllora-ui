/**
 * FinetuneConfigPanel
 *
 * Full-height finetune jobs view.
 * Renders the job detail panel directly — training is started via
 * the "+" action on the finetune folder in the explorer sidebar,
 * or via Lucy sidebar quick actions.
 */

import { FinetuneJobsPanel } from "./finetune-job-detail";
import type { SampleTrainingConfig } from "@/types/dataset-types";

interface FinetuneConfigPanelProps {
  workflowId: string;
  canStartJob: boolean;
  initialConfig?: SampleTrainingConfig;
  /** Optional external selection from explorer path (`finetune/<jobId>`). */
  selectedFinetuneJobId?: string | null;
}

export function FinetuneConfigPanel({ selectedFinetuneJobId }: FinetuneConfigPanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0">
        <FinetuneJobsPanel selectedJobIdOverride={selectedFinetuneJobId} />
      </div>
    </div>
  );
}

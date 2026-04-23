/**
 * TrainingMetricsSummary
 *
 * Shows training metrics charts in the dataset detail view.
 * Wraps TrainingMetricsSection (eval score per epoch) and
 * FinetuneMetricsSection (reward/KL/loss) in collapsible cards.
 * Renders nothing if no finetune jobs exist.
 */

import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { TrainingMetricsSection } from "@/components/finetune/content/TrainingMetricsSection";
import { FinetuneMetricsSection } from "@/components/finetune/content/FinetuneMetricsSection";

interface TrainingMetricsSummaryProps {
  readonly workflowId: string;
}

export function TrainingMetricsSummary({ workflowId }: TrainingMetricsSummaryProps) {
  const { latestJob, getJobEvaluations, refreshJobEvaluations } = FinetuneJobsConsumer();

  if (!latestJob) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground/50">
        <span className="text-xs">No training jobs yet.</span>
        <span className="text-[10px]">Start a finetune job to see training metrics here.</span>
      </div>
    );
  }

  const jobId = latestJob.id;
  const evalState = getJobEvaluations(jobId);
  const isLive = latestJob.status === "running" || latestJob.status === "pending";

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Eval score per epoch */}
      <section>
        <h3 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em] mb-3">
          Evaluation Scores by Epoch
        </h3>
        <div className="rounded-lg border border-border/50 bg-background/50 p-3">
          <TrainingMetricsSection
            evalResults={evalState.data}
            isLoading={evalState.isLoading}
            isRefreshing={false}
            error={evalState.error}
            onRefresh={() => refreshJobEvaluations(jobId)}
            isLive={isLive}
          />
        </div>
      </section>

      {/* Raw training metrics (loss, KL, reward) */}
      {latestJob.provider_job_id && (
        <section>
          <h3 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em] mb-3">
            Training Metrics
          </h3>
          <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <FinetuneMetricsSection
              jobId={latestJob.provider_job_id}
              workflowId={workflowId}
              isLive={isLive}
            />
          </div>
        </section>
      )}
    </div>
  );
}

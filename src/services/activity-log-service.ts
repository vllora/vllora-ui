/**
 * Activity Log Service
 *
 * Aggregates timestamped data from multiple sources into a sorted
 * ActivityLogEntry[] timeline. Used by LogsViewer to render logs.md.
 *
 * Sources:
 * - FinetuneWorkflowState (step timestamps)
 * - KnowledgeSource (created/processed)
 * - DryRunJob (created/started/completed)
 * - FinetuneJob (created/updated/completed)
 */

import type { KnowledgeSource } from "@/types/dataset-types";
import type { DryRunJob } from "@/types/dry-run-job";
import type { FinetuneJob } from "@/services/finetune-api";

export type LogEntryType =
  | "workflow"
  | "document"
  | "generation"
  | "evaluation"
  | "finetune"
  | "info";

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  type: LogEntryType;
  title: string;
  detail?: string;
}

/**
 * Build a sorted activity log from all available data sources.
 * Returns entries sorted newest-first.
 */
export function buildActivityLog(params: {
  knowledgeSources: KnowledgeSource[];
  dryRunJobs: DryRunJob[];
  finetuneJobs: FinetuneJob[];
  workflowCreatedAt?: number;
  topicsGeneratedAt?: number;
  graderConfiguredAt?: number;
  trainingStartedAt?: number;
}): ActivityLogEntry[] {
  const entries: ActivityLogEntry[] = [];

  // Workflow creation
  if (params.workflowCreatedAt) {
    entries.push({
      id: "wf-created",
      timestamp: params.workflowCreatedAt,
      type: "workflow",
      title: "Workflow created",
    });
  }

  // Topics generated
  if (params.topicsGeneratedAt) {
    entries.push({
      id: "wf-topics",
      timestamp: params.topicsGeneratedAt,
      type: "workflow",
      title: "Topic hierarchy generated",
    });
  }

  // Grader configured
  if (params.graderConfiguredAt) {
    entries.push({
      id: "wf-grader",
      timestamp: params.graderConfiguredAt,
      type: "workflow",
      title: "Evaluation grader configured",
    });
  }

  // Training started
  if (params.trainingStartedAt) {
    entries.push({
      id: "wf-training",
      timestamp: params.trainingStartedAt,
      type: "workflow",
      title: "Training started",
    });
  }

  // Knowledge sources
  for (const src of params.knowledgeSources) {
    entries.push({
      id: `doc-${src.id}`,
      timestamp: src.createdAt,
      type: "document",
      title: `Document uploaded: ${src.name}`,
      detail: src.status === "ready" ? "Processed" : src.status,
    });

    if (src.processedAt) {
      entries.push({
        id: `doc-done-${src.id}`,
        timestamp: src.processedAt,
        type: "document",
        title: `Document processed: ${src.name}`,
      });
    }
  }

  // Dry run jobs
  for (const job of params.dryRunJobs) {
    entries.push({
      id: `dryrun-${job.id}`,
      timestamp: job.createdAt,
      type: "evaluation",
      title: `Dry run created`,
      detail: `Sample size: ${job.sampleSize}`,
    });

    if (job.completedAt) {
      entries.push({
        id: `dryrun-done-${job.id}`,
        timestamp: job.completedAt,
        type: "evaluation",
        title: `Dry run ${job.status === "completed" ? "passed" : job.status}`,
      });
    }
  }

  // Finetune jobs
  for (const job of params.finetuneJobs) {
    const createdTs = new Date(job.created_at).getTime();
    entries.push({
      id: `ft-${job.id}`,
      timestamp: createdTs,
      type: "finetune",
      title: `Fine-tune job created`,
      detail: `Base model: ${job.base_model}`,
    });

    if (job.completed_at) {
      const completedTs = new Date(job.completed_at).getTime();
      entries.push({
        id: `ft-done-${job.id}`,
        timestamp: completedTs,
        type: "finetune",
        title: `Fine-tune ${job.status}`,
        detail: job.fine_tuned_model || undefined,
      });
    }
  }

  // Sort newest-first
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}

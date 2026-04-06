/**
 * Pipeline Journal Service
 *
 * CRUD operations for the pipeline journal via dedicated endpoints:
 *   GET  /finetune/workflows/{id}/journal          — read journal
 *   POST /finetune/workflows/{id}/journal/entries   — append entries (atomic)
 */

import { api, handleApiResponse } from "@/lib/api-client";
import type {
  PipelineJournal,
  PipelineJournalEntry,
} from "@/types/pipeline-journal-types";

interface JournalResponse {
  readonly workflow_id: string;
  readonly pipeline_journal: PipelineJournal | null;
}

/**
 * Fetch the pipeline journal for a workflow.
 * Returns null if the workflow has no journal yet.
 */
export async function fetchPipelineJournal(
  workflowId: string,
): Promise<PipelineJournal | null> {
  const response = await api.get(`/finetune/workflows/${workflowId}/journal`);
  const data = await handleApiResponse<JournalResponse>(response);
  return data.pipeline_journal ?? null;
}

/**
 * Append entries to the pipeline journal.
 * Server performs atomic read-modify-write so no entries are lost
 * from concurrent calls during pipeline execution.
 */
export async function appendJournalEntries(
  workflowId: string,
  entries: readonly PipelineJournalEntry[],
  objective?: string,
): Promise<PipelineJournal | null> {
  const response = await api.post(
    `/finetune/workflows/${workflowId}/journal/entries`,
    { entries, objective },
  );
  const data = await handleApiResponse<JournalResponse>(response);
  return data.pipeline_journal ?? null;
}

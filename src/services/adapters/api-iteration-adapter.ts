/**
 * API adapter for IterationStateService.
 *
 * Stores the IterationState as JSON in the `iteration_state` column
 * on the BE workflows table. All mutations use read-modify-write.
 *
 * Key mapping: workflowId === BE workflow row ID.
 */

import { api, handleApiResponse } from '@/lib/api-client';
import type { IterationStateService } from '@/services/interfaces/iteration-service';
import type {
  IterationState,
  IterationHistoryEntry,
  IterationPhase,
} from '@/types/iteration-types';

// ─── BE response type ────────────────────────────────────────────────────────

interface DbWorkflowResponse {
  readonly id: string;
  readonly iteration_state: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = '/finetune/workflows';

function parseIterationState(json: string | null): IterationState | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as IterationState;
  } catch {
    return null;
  }
}

async function fetchRow(workflowId: string): Promise<DbWorkflowResponse | null> {
  const response = await api.get(`${BASE}/${workflowId}`);
  if (!response.ok && response.status === 404) return null;
  return handleApiResponse<DbWorkflowResponse>(response);
}

async function saveIterationJson(workflowId: string, state: IterationState): Promise<void> {
  const response = await api.put(`${BASE}/${workflowId}`, {
    iteration_state: JSON.stringify(state),
  });
  await handleApiResponse<DbWorkflowResponse>(response);
}

function createDefault(workflowId: string): IterationState {
  const now = Date.now();
  return {
    id: workflowId,
    iterationNumber: 0,
    phase: 'idle',
    innerLoop: {},
    outerLoop: {},
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const apiIterationAdapter: IterationStateService = {
  async get(workflowId: string): Promise<IterationState | null> {
    const row = await fetchRow(workflowId);
    if (!row) return null;
    return parseIterationState(row.iteration_state);
  },

  async save(state: IterationState): Promise<void> {
    const updatedState: IterationState = {
      ...state,
      updatedAt: Date.now(),
    };
    await saveIterationJson(state.id, updatedState);
  },

  async create(workflowId: string): Promise<IterationState> {
    const state = createDefault(workflowId);
    await saveIterationJson(workflowId, state);
    return state;
  },

  async getOrCreate(workflowId: string): Promise<IterationState> {
    const existing = await apiIterationAdapter.get(workflowId);
    if (existing) return existing;
    return apiIterationAdapter.create(workflowId);
  },

  async addEntry(
    workflowId: string,
    entry: Omit<IterationHistoryEntry, 'iteration' | 'timestamp'>,
  ): Promise<IterationState> {
    const state = await apiIterationAdapter.getOrCreate(workflowId);
    const nextIteration = state.iterationNumber + 1;

    const fullEntry: IterationHistoryEntry = {
      ...entry,
      iteration: nextIteration,
      timestamp: Date.now(),
    };

    const updatedState: IterationState = {
      ...state,
      iterationNumber: nextIteration,
      history: [...state.history, fullEntry],
      updatedAt: Date.now(),
    };

    await saveIterationJson(workflowId, updatedState);
    return updatedState;
  },

  async getHistory(workflowId: string): Promise<IterationHistoryEntry[]> {
    const state = await apiIterationAdapter.get(workflowId);
    if (!state) return [];
    return [...state.history].sort((a, b) => a.iteration - b.iteration);
  },

  async updatePhase(workflowId: string, phase: IterationPhase): Promise<IterationState> {
    const state = await apiIterationAdapter.getOrCreate(workflowId);

    const updatedState: IterationState = {
      ...state,
      phase,
      updatedAt: Date.now(),
    };

    await saveIterationJson(workflowId, updatedState);
    return updatedState;
  },

  async delete(workflowId: string): Promise<void> {
    const response = await api.put(`${BASE}/${workflowId}`, {
      iteration_state: null,
    });
    await handleApiResponse<DbWorkflowResponse>(response);
  },
};

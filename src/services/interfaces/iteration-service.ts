/**
 * Iteration State Service Interface
 *
 * Abstraction over cross-iteration memory persistence.
 * Backed by Gateway API (api-iteration-adapter.ts).
 */

export type {
  IterationState,
  IterationHistoryEntry,
  IterationPhase,
  ProposedChange,
} from '@/types/iteration-types';

import type {
  IterationState,
  IterationHistoryEntry,
  IterationPhase,
} from '@/types/iteration-types';

export interface IterationStateService {
  get(workflowId: string): Promise<IterationState | null>;
  save(state: IterationState): Promise<void>;
  create(workflowId: string): Promise<IterationState>;
  getOrCreate(workflowId: string): Promise<IterationState>;
  addEntry(
    workflowId: string,
    entry: Omit<IterationHistoryEntry, 'iteration' | 'timestamp'>,
  ): Promise<IterationState>;
  getHistory(workflowId: string): Promise<IterationHistoryEntry[]>;
  updatePhase(workflowId: string, phase: IterationPhase): Promise<IterationState>;
  delete(workflowId: string): Promise<void>;
}

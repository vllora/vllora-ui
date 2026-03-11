/**
 * Iteration State Service Interface
 *
 * Abstraction over cross-iteration memory persistence.
 * Currently backed by IndexedDB (finetune-iteration-db.ts).
 * Will be swapped to gateway API adapter when iteration state endpoints are ready.
 *
 * Re-exports types directly from the DB module to ensure compatibility.
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
  get(datasetId: string): Promise<IterationState | null>;
  save(state: IterationState): Promise<void>;
  create(datasetId: string): Promise<IterationState>;
  getOrCreate(datasetId: string): Promise<IterationState>;
  addEntry(
    datasetId: string,
    entry: Omit<IterationHistoryEntry, 'iteration' | 'timestamp'>,
  ): Promise<IterationState>;
  getHistory(datasetId: string): Promise<IterationHistoryEntry[]>;
  updatePhase(datasetId: string, phase: IterationPhase): Promise<IterationState>;
  delete(datasetId: string): Promise<void>;
}

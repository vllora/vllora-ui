/**
 * Finetune Iteration Types
 *
 * Standalone type definitions for cross-iteration memory.
 * Extracted from finetune-iteration-db.ts to remove IndexedDB dependency.
 */

export interface ProposedChange {
  lever: 'grader' | 'records' | 'distribution' | 'training_config' | 'topics';
  description: string;
  targetTopics?: string[];
  applied: boolean;
}

export type IterationPhase =
  | 'idle'
  | 'evaluating'
  | 'analyzing'
  | 'awaiting_user'
  | 'applying_changes'
  | 'training'
  | 'post_training';

export interface IterationHistoryEntry {
  iteration: number;
  timestamp: number;
  evalId: string;
  dryRunScores: {
    mean: number;
    perTopic: Record<string, number>;
  };
  changesMade: string;
  decision: 'iterate' | 'train' | 'escalate';
}

export interface IterationState {
  /** workflowId — one iteration state per dataset */
  id: string;
  iterationNumber: number;
  phase: IterationPhase;
  innerLoop: {
    lastEvalId?: string;
    lastDryRunScore?: number;
    proposedChanges?: ProposedChange[];
    userDecision?: 'accepted' | 'rejected' | 'modified';
  };
  outerLoop: {
    lastTrainingJobId?: string;
    lastEpochScores?: Record<string, number[]>;
    postTrainingEvalId?: string;
  };
  history: IterationHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Knowledge Source Types
 *
 * Matches the BE API contract (gateway SQLite).
 * KnowledgeSource (parent) → KnowledgeSourcePart[] (children)
 */

export type KnowledgePartType = 'text' | 'image' | 'table';

export interface KnowledgeSourcePart {
  readonly id: string;
  readonly referenceId?: string;
  readonly sourceId: string;
  readonly type: KnowledgePartType;
  readonly content: string;
  readonly contentMetadata?: Record<string, unknown>;
  readonly title?: string;
  readonly extractionPath?: string;
  readonly extractionMetadata?: Record<string, unknown>;
  /** Whether this part is relevant to the workflow objective. null = not yet classified. */
  readonly relevant?: boolean | null;
}

export interface KnowledgeSource {
  readonly id: string;
  readonly referenceId?: string;
  readonly workflowId: string;
  readonly name: string;
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
  readonly parts: KnowledgeSourcePart[];
  readonly createdAt: string;
}

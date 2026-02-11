/**
 * Shared utilities for finetune tools
 */

export {
  buildKnowledgeContext,
  buildKnowledgeContentBlocks,
  wrapKnowledgeContextForPrompt,
  DOCUMENT_DERIVED_TOPICS_INSTRUCTION,
  type KnowledgeSourceContext,
  type KnowledgeContentBlocks,
  type ExtractedSection,
} from './knowledge-context';

export {
  callLucy,
  fetchLucyConfigCached,
  type TextContentBlock,
  type FileContentBlock,
  type ContentBlock,
  type LucyMessage,
  type LucyChatOptions,
} from './lucy-client';

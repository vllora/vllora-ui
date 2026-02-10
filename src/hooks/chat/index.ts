/**
 * Chat Hooks
 *
 * Reusable hooks for chat functionality.
 * These extract common patterns from LucyChat for cleaner code.
 */

export { usePendingMessage } from './usePendingMessage';
export type {
  UsePendingMessageOptions,
  UsePendingMessageReturn,
} from './usePendingMessage';

export { useFileAttachments } from './useFileAttachments';
export type {
  AttachedFile,
  AttachedImage,
  UseFileAttachmentsOptions,
  UseFileAttachmentsReturn,
} from './useFileAttachments';

export { useAutoExpandTools } from './useAutoExpandTools';
export type {
  UseAutoExpandToolsOptions,
  UseAutoExpandToolsReturn,
} from './useAutoExpandTools';

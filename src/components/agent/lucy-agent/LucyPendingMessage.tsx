/**
 * LucyPendingMessage
 *
 * Displays a visual indicator for queued messages during streaming.
 * Shows the pending message parts that will be sent when streaming ends.
 */

import { DistriPart } from '@distri/core';

// ============================================================================
// Types
// ============================================================================

export interface LucyPendingMessageProps {
  /** The pending message parts */
  pendingMessage: DistriPart[] | null;
}

// ============================================================================
// Component
// ============================================================================

export function LucyPendingMessage({ pendingMessage }: LucyPendingMessageProps) {
  if (!pendingMessage || pendingMessage.length === 0) return null;

  const partCount = pendingMessage.length;

  return (
    <div className="border-l-2 border-yellow-500 pl-3 py-1.5">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse shrink-0"></div>
        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
          Queued ({partCount} part{partCount > 1 ? 's' : ''})
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {pendingMessage.map((part, partIndex) => {
          if (part.part_type === 'text') {
            return (
              <span key={partIndex} className="block">
                {part.data as string}
              </span>
            );
          } else if (
            part.part_type === 'image' &&
            typeof part.data === 'object' &&
            part.data !== null &&
            'name' in part.data
          ) {
            return (
              <span
                key={partIndex}
                className="inline-block text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded mr-1"
              >
                {(part.data as { name: string }).name}
              </span>
            );
          }
          return (
            <span
              key={partIndex}
              className="inline-block text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded mr-1"
            >
              [{part.part_type}]
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground/60">
        Will send when response completes
      </p>
    </div>
  );
}

export default LucyPendingMessage;

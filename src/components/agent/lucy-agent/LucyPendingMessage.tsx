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
    <div className="border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-r-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse mt-2"></div>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Message queued ({partCount} part{partCount > 1 ? 's' : ''})
          </h3>
          <div className="mt-2">
            <div className="text-sm text-yellow-700 dark:text-yellow-300 bg-white dark:bg-gray-800 p-2 rounded border">
              {pendingMessage.map((part, partIndex) => {
                if (part.part_type === 'text') {
                  return (
                    <span key={partIndex} className="block mb-1">
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
                      className="inline-block text-xs text-muted-foreground bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded mr-2 mb-1"
                    >
                      {(part.data as { name: string }).name}
                    </span>
                  );
                }
                return (
                  <span
                    key={partIndex}
                    className="inline-block text-xs text-muted-foreground bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded mr-2 mb-1"
                  >
                    [{part.part_type}]
                  </span>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
            Will be sent automatically when AI response is complete
          </p>
        </div>
      </div>
    </div>
  );
}

export default LucyPendingMessage;

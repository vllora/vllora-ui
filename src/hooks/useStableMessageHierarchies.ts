import { useRef, useMemo } from 'react';
import { MessageStructure } from '@/utils/message-structure-from-span';

/**
 * Deep equality check for MessageStructure arrays
 * Returns true if the structure is the same (span_ids and types match)
 */
function areMessageStructuresEqual(
  prev: MessageStructure[],
  next: MessageStructure[]
): boolean {
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    if (!areMessageStructureItemsEqual(prev[i], next[i])) {
      return false;
    }
  }

  return true;
}

function areMessageStructureItemsEqual(
  prev: MessageStructure,
  next: MessageStructure
): boolean {
  if (prev.span_id !== next.span_id || prev.type !== next.type) {
    return false;
  }

  if (prev.children.length !== next.children.length) {
    return false;
  }

  for (let i = 0; i < prev.children.length; i++) {
    if (!areMessageStructureItemsEqual(prev.children[i], next.children[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Hook that returns a stable reference to messageHierarchies
 * Only creates a new reference when the structure actually changes
 *
 * This prevents unnecessary re-renders in memoized components that depend
 * on messageHierarchies even when the structure hasn't changed
 */
export function useStableMessageHierarchies(
  messageHierarchies: MessageStructure[]
): MessageStructure[] {
  const previousRef = useRef<MessageStructure[]>(messageHierarchies);

  return useMemo(() => {
    // If structure hasn't changed, return the previous reference
    if (areMessageStructuresEqual(previousRef.current, messageHierarchies)) {
      return previousRef.current;
    }

    // Structure has changed, update the ref and return the new value
    previousRef.current = messageHierarchies;
    return messageHierarchies;
  }, [messageHierarchies]);
}

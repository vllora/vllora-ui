import { Span } from "@/types/common-type";
import { skipThisSpan } from "./graph-utils";

export interface MessageStructure {
  span_id: string;
  type: string; // run, task
  children: MessageStructure[];
}

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

const skipSpanNotRelatedToMessage = (span: Span) => {
  if(span.operation_name === 'tool') return false;
  if (skipThisSpan(span)) return true;
  // if(span.operation_name === 'run') return true;
  return false;
}
// Helper function to find the nearest non-skipped ancestor
const findNonSkippedParent = (
  span: Span,
  spanMap: Map<string, Span>
): string | null => {
  if (!span.parent_span_id) return null;

  const parent = spanMap.get(span.parent_span_id);
  if (!parent) return null;

  // If parent should be skipped, recursively find its parent
  if (skipSpanNotRelatedToMessage(parent)) {
    return findNonSkippedParent(parent, spanMap);
  }

  return parent.span_id;
};
export function buildMessageHierarchyFromSpan(
  flattenSpans: Span[]
): MessageStructure[] {

  const spanMap = new Map<string, Span>();
  const messageMap = new Map<string, MessageStructure>();

  // Sort spans by start time
  const sortedSpans = flattenSpans.sort(
    (a, b) => a.start_time_us - b.start_time_us
  );

  // Create span lookup map
  sortedSpans.forEach((span) => {
    spanMap.set(span.span_id, span);
  });

  // First pass: Create MessageStructure for non-skipped spans
  sortedSpans.forEach((span) => {
    if (skipSpanNotRelatedToMessage(span)) return;

    const message: MessageStructure = {
      span_id: span.span_id,
      type: span.operation_name,
      children: [],
    };
    messageMap.set(span.span_id, message);
  });

  // Second pass: Build hierarchy, connecting to nearest non-skipped parent
  const result: MessageStructure[] = [];

  sortedSpans.forEach((span) => {
    if (skipSpanNotRelatedToMessage(span)) return;

    const message = messageMap.get(span.span_id)!;
    const nonSkippedParentId = findNonSkippedParent(span, spanMap);

    if (!nonSkippedParentId) {
      // Root message (no parent or all ancestors skipped)
      result.push(message);
    } else {
      // Child message - add to nearest non-skipped parent
      const parent = messageMap.get(nonSkippedParentId);
      if (parent) {
        parent.children.push(message);
      } else {
        // Parent not found in message map, treat as root
        result.push(message);
      }
    }
  });

  return result;
}

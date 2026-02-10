/**
 * useAutoExpandTools
 *
 * Manages tool expansion state in chat.
 * Automatically expands tools that are running, have errors,
 * or require user action.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ToolCallState } from '@distri/react';

// ============================================================================
// Types
// ============================================================================

export interface UseAutoExpandToolsOptions {
  /** Map of tool call states from the chat store */
  toolCalls: Map<string, ToolCallState>;
}

export interface UseAutoExpandToolsReturn {
  /** Set of expanded tool IDs */
  expandedTools: Set<string>;
  /** Toggle expansion for a tool */
  toggleExpansion: (toolId: string) => void;
  /** Check if a tool is expanded */
  isExpanded: (toolId: string) => boolean;
  /** Expand a specific tool */
  expand: (toolId: string) => void;
  /** Collapse a specific tool */
  collapse: (toolId: string) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useAutoExpandTools({
  toolCalls,
}: UseAutoExpandToolsOptions): UseAutoExpandToolsReturn {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Auto-expand tools that are running, have errors, or need user action
  useEffect(() => {
    const newExpanded = new Set(expandedTools);
    let hasChanges = false;

    toolCalls.forEach((toolCall) => {
      const shouldExpand =
        toolCall.status === 'running' ||
        toolCall.status === 'error' ||
        toolCall.status === 'user_action_required';

      if (shouldExpand && !newExpanded.has(toolCall.tool_call_id)) {
        newExpanded.add(toolCall.tool_call_id);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setExpandedTools(newExpanded);
    }
  }, [toolCalls, expandedTools]);

  // Toggle expansion for a tool
  const toggleExpansion = useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }, []);

  // Check if a tool is expanded
  const isExpanded = useCallback(
    (toolId: string) => {
      return expandedTools.has(toolId);
    },
    [expandedTools]
  );

  // Expand a specific tool
  const expand = useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      if (prev.has(toolId)) return prev;
      const next = new Set(prev);
      next.add(toolId);
      return next;
    });
  }, []);

  // Collapse a specific tool
  const collapse = useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      if (!prev.has(toolId)) return prev;
      const next = new Set(prev);
      next.delete(toolId);
      return next;
    });
  }, []);

  return {
    expandedTools,
    toggleExpansion,
    isExpanded,
    expand,
    collapse,
  };
}

export default useAutoExpandTools;

/**
 * LucyMessageRenderer
 *
 * Custom message renderer for Lucy chat with full feature parity with @distri/react MessageRenderer.
 *
 * Features:
 * - User message rendering with text and images
 * - Assistant message rendering with step-based progress
 * - Tool execution rendering with custom renderers
 * - Event handling (tool_calls, run_error, agent_handover)
 * - Streaming text with cursor animation
 * - Markdown with syntax highlighting
 * - Image display
 */

import React from 'react';
import { DistriMessage, DistriEvent, DistriChatMessage, isDistriMessage, isDistriEvent } from '@distri/core';
import { useChatStateStore } from '@distri/react';
import { LucyUserMessage } from './LucyUserMessage';
import { LucyAssistantMessage } from './LucyAssistantMessage';
import { LucyToolExecutionRenderer } from './LucyToolExecutionRenderer';
import type { ToolRendererMap } from './LucyToolRenderer';

// ============================================================================
// Types
// ============================================================================

export interface LucyMessageRendererProps {
  message: DistriChatMessage;
  index: number;
  isExpanded?: boolean;
  onToggle?: () => void;
  toolRenderers?: ToolRendererMap;
}

// ============================================================================
// Main Message Renderer
// ============================================================================

export function LucyMessageRenderer({
  message,
  index,
  toolRenderers,
}: LucyMessageRendererProps): React.ReactNode {
  const toolCallsState = useChatStateStore((state) => state.toolCalls);

  // Handle DistriMessage types
  if (isDistriMessage(message)) {
    const distriMessage = message as DistriMessage;

    // Check for empty content
    const textContent = distriMessage.parts
      .filter((part) => part.part_type === 'text')
      .map((part) => (part as { part_type: 'text'; data: string }).data)
      .join('')
      .trim();
    const imageParts = distriMessage.parts.filter((part) => part.part_type === 'image');

    if (!textContent && imageParts.length === 0) {
      return null;
    }

    switch (distriMessage.role) {
      case 'user':
        return <LucyUserMessage key={`user-${index}`} message={distriMessage} />;
      case 'assistant':
        return <LucyAssistantMessage key={`assistant-${index}`} message={distriMessage} />;
      default:
        return null;
    }
  }

  // Handle DistriEvent types
  if (isDistriEvent(message)) {
    const event = message as DistriEvent;

    switch (event.type) {
      case 'tool_calls':
        if (toolCallsState.size === 0) return null;
        return (
          <LucyToolExecutionRenderer
            key={`tool-execution-${index}`}
            event={event}
            toolRenderers={toolRenderers}
          />
        );

      case 'agent_handover':
        return (
          <div key={`handover-${index}`} className="ml-8 p-3 bg-muted rounded-lg border">
            <div className="text-sm text-muted-foreground">
              <strong>Handover to:</strong> {event.data?.to_agent || 'unknown agent'}
            </div>
          </div>
        );

      case 'run_error':
        return (
          <div
            key={`run-error-${index}`}
            className="ml-8 p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
          >
            <div className="text-sm text-destructive">
              <strong>Error:</strong> {event.data?.message || 'Unknown error occurred'}
            </div>
          </div>
        );

      // Events that don't need rendering
      case 'run_started':
      case 'plan_started':
      case 'plan_finished':
      case 'text_message_start':
      case 'text_message_content':
      case 'text_message_end':
      case 'step_started':
      case 'step_completed':
      case 'tool_results':
      case 'run_finished':
      default:
        return null;
    }
  }

  return null;
}

export default LucyMessageRenderer;

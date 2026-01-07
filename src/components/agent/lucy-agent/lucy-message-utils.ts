/**
 * Lucy Message Utilities
 *
 * Shared utility functions for Lucy message rendering.
 */

import { DistriMessage, DistriEvent, isDistriMessage } from '@distri/core';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedContent {
  text: string;
  imageParts: Array<{ part_type: 'image'; data: any }>;
}

// ============================================================================
// Content Extraction
// ============================================================================

export function extractContent(message: DistriMessage | DistriEvent): ExtractedContent {
  if (!isDistriMessage(message)) {
    return { text: '', imageParts: [] };
  }

  const distriMessage = message as DistriMessage;
  const textParts =
    distriMessage.parts
      ?.filter((p) => p.part_type === 'text')
      ?.map((p) => (p as { part_type: 'text'; data: string }).data)
      ?.filter((text) => text && text.trim()) || [];

  const imageParts = (distriMessage.parts?.filter((p) => p.part_type === 'image') ||
    []) as Array<{
    part_type: 'image';
    data: any;
  }>;

  return {
    text: textParts.join('').trim(),
    imageParts,
  };
}

// ============================================================================
// Timestamp Formatting
// ============================================================================

export function formatTimestamp(timestamp?: string | number): string {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1m ago';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1h ago';
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// Friendly Tool Messages
// ============================================================================

export function getFriendlyToolMessage(toolName: string, input: any): string {
  switch (toolName) {
    case 'search':
    case 'search_traces':
    case 'query_spans':
      return `Searching "${input?.query || ''}"`;
    case 'analyze':
    case 'analyze_error':
      return 'Analyzing traces...';
    case 'get_span_details':
      return 'Getting span details...';
    case 'filter_spans':
      return 'Filtering spans...';
    case 'fetch_spans_summary':
      return 'Fetching spans summary...';
    default:
      return `Running ${toolName}...`;
  }
}

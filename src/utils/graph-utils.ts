import { Span } from '@/services/runs-api';

/**
 * Get client SDK name from span attributes
 */
export function getClientSDKName(span: Span): string | null {
  if (!span.attribute) return null;

  // Check for client_name in attributes
  if ('client_name' in span.attribute) {
    return span.attribute.client_name as string;
  }

  return null;
}

/**
 * Check if span is an agent span
 */
export function isAgentSpan(span: Span): boolean {
  return span.operation_name === 'agent' || span.operation_name === 'agent_call';
}

/**
 * Check if span is a client SDK span
 */
export function isClientSDK(span: Span): boolean {
  return !!getClientSDKName(span);
}

/**
 * Check if prompt caching is applied to this span
 */
export function isPromptCachingApplied(span: Span): boolean {
  if (!span.attribute) return false;

  // Check for prompt caching indicators in attributes
  if ('cache_creation_input_tokens' in span.attribute || 'cache_read_input_tokens' in span.attribute) {
    return true;
  }

  return false;
}

/**
 * Check if span is a router span
 */
export function isRouterSpan(span: Span): boolean {
  return span.operation_name === 'router' || span.operation_name === 'routing';
}

/**
 * Check if span is MCP (Model Context Protocol)
 */
export function isMCP(span: Span): boolean {
  return span.operation_name === 'mcp' || span.operation_name === 'mcp_call';
}

/**
 * Get MCP definition ID from span
 */
export function getMCPDefinitionId(span: Span): string | null {
  if (!span.attribute) return null;

  if ('mcp_template_definition_id' in span.attribute) {
    return span.attribute.mcp_template_definition_id as string;
  }

  return null;
}

/**
 * Get MCP template name from span
 */
export function getMCPTemplateName(span: Span): string | null {
  if (!span.attribute) return null;

  if ('mcp_template_name' in span.attribute) {
    return span.attribute.mcp_template_name as string;
  }

  return null;
}

/**
 * Get agent name from span attributes
 */
export function getAgentName(span: Span): string | null {
  if (!span.attribute) return null;

  if ('agent_name' in span.attribute) {
    return span.attribute.agent_name as string;
  }

  return null;
}

/**
 * Get color by operation type
 */
export function getColorByType(operationName: string): string {
  const colorMap: Record<string, string> = {
    'model_call': 'bg-purple-500/10 text-purple-400',
    'api_invoke': 'bg-blue-500/10 text-blue-400',
    'tool_call': 'bg-green-500/10 text-green-400',
    'agent': 'bg-amber-500/10 text-amber-400',
    'router': 'bg-pink-500/10 text-pink-400',
    'mcp': 'bg-teal-500/10 text-teal-400',
    'cache': 'bg-cyan-500/10 text-cyan-400',
  };

  return colorMap[operationName] || 'bg-gray-500/10 text-gray-400';
}

/**
 * Check if span should be skipped in display
 */
export function skipThisSpan(span: Span): boolean {
  // Skip internal/system spans
  // if (span.operation_name === 'internal' || span.operation_name === 'system') {
  //   return true;
  // }

  return false;
}

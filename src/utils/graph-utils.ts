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
export const getColorByType = (type: string) => {
  switch (type) {
    case 'api_invoke':
      // yellow
      return '#eab308';
    case 'SpanToolNode':
      return '#3b82f6'; // Blue for tools
    case 'ClientSDKNode':
      return '#10b981'; // Emerald for tools
    case 'SpanModelNode':
      return '#eab308'; // Gold/yellow for models
    case 'RunNode':
      return '#14b8a6'; // Teal for runs
    case 'RouterNode':
      return '#8b5cf6'; // Amber for routers (fixed hex code)
    case 'GuardNode':
      return '#ec4899'; // Pink for guards
    case 'VirtualModelNode':
      return '#10b981'; // Emerald green for virtual models
    default:
      return '#3b82f6';
  }
}

/**
 * Check if span should be skipped in display
 */
export function skipThisSpan(span: Span, isClientSDKTrace?: boolean): boolean {
  let operation_name = span.operation_name;
    if (isClientSDKTrace) {
        let sdkName = getClientSDKName(span);
        if (sdkName === 'adk') {
            return ['invocation', 'tools', 'call_llm'].includes(operation_name)
        }
        if (sdkName === 'crewai') {
           // let isAgent = isAgentSpan(span);
            return false
        }
    }
    if (!isClientSDKTrace && span.operation_name === 'api_invoke' && span.attribute && span.attribute['error']) {
        return false
    }

    return ["cloud_api_invoke", "api_invoke", "model_call"].includes(operation_name);

  return false;
}

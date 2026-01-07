/**
 * Generate user-centric Mermaid diagrams from span data
 *
 * Shows the logical data flow from user perspective:
 * User question → Agent thinking → Tool calls → Results → Response
 *
 * Not technical span hierarchy (parent-child, operation names, etc.)
 */

import type { Span } from '@/services/spans-api';

export interface FlowStep {
  id: string;
  type: 'user' | 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error';
  label: string;
  detail?: string;
  hasError?: boolean;
  duration_ms?: number;
}

export interface GenerateFlowDiagramParams {
  diagramType?: 'flowchart' | 'sequence';
  maxSteps?: number;
}

export interface GenerateFlowDiagramResult {
  success: boolean;
  diagram_type?: string;
  total_spans?: number;
  steps_shown?: number;
  mermaid?: string;
  _note?: string;
  error?: string;
}

/**
 * Helper to truncate text for diagram labels
 */
function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  const clean = text.replace(/[\n\r]+/g, ' ').replace(/"/g, "'").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + '...' : clean;
}

/**
 * Helper to escape mermaid special characters
 */
function escapeLabel(text: string): string {
  return text.replace(/["\\]/g, '').replace(/[[\]{}()#&;]/g, '');
}

/**
 * Extract meaningful flow steps from spans (user perspective)
 */
function extractFlowSteps(spans: Span[], maxSteps: number): FlowStep[] {
  const steps: FlowStep[] = [];
  let stepIndex = 0;
  let hasUserInput = false;

  // Sort spans by start time for chronological order
  const sortedSpans = [...spans].sort((a, b) =>
    (a.start_time_us || 0) - (b.start_time_us || 0)
  );

  for (const span of sortedSpans) {
    if (steps.length >= maxSteps) break;

    const attr = (span.attribute || {}) as Record<string, unknown>;
    const isLLM = ['model_call', 'openai', 'anthropic', 'gemini', 'bedrock'].includes(span.operation_name);
    const isTool = span.operation_name === 'tools';
    const hasError = !!(attr.error || (attr.status_code as number) >= 400 || attr['error.message']);
    const duration_ms = span.finish_time_us && span.start_time_us
      ? Math.round((span.finish_time_us - span.start_time_us) / 1000)
      : 0;

    if (isLLM) {
      // Extract user message if present (first LLM call usually has user input)
      const messages = (attr.messages || attr['llm.messages'] || []) as Array<{ role?: string; content?: unknown }>;
      const userMsg = Array.isArray(messages)
        ? messages.find((m) => m.role === 'user')
        : null;

      if (userMsg && !hasUserInput) {
        hasUserInput = true;
        const content = typeof userMsg.content === 'string'
          ? userMsg.content
          : JSON.stringify(userMsg.content);
        steps.push({
          id: `step${stepIndex++}`,
          type: 'user',
          label: 'User',
          detail: truncate(content, 40),
        });
      }

      // Check if LLM is calling tools or responding
      const toolCalls = (attr.tool_calls || attr['llm.tool_calls'] || []) as unknown[];
      const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

      if (hasToolCalls) {
        // LLM decided to use tools
        const model = (attr.model_name || attr.model || 'Agent') as string;
        steps.push({
          id: `step${stepIndex++}`,
          type: 'thinking',
          label: `${escapeLabel(String(model))} decides`,
          detail: `Use ${toolCalls.length} tool(s)`,
          duration_ms,
        });
      } else {
        // LLM generating response
        const model = (attr.model_name || attr.model || 'Agent') as string;
        const output = (attr.output || attr['llm.output'] || attr.response || '') as string | object;
        const outputText = typeof output === 'string' ? output : JSON.stringify(output);

        steps.push({
          id: `step${stepIndex++}`,
          type: 'response',
          label: `${escapeLabel(String(model))} responds`,
          detail: truncate(outputText, 35),
          hasError,
          duration_ms,
        });
      }
    } else if (isTool) {
      // Tool call - show what tool and with what input
      const toolName = (attr['tool.name'] || attr.name || 'tool') as string;
      const toolArgs = (attr['tool.args'] || attr.args || attr.input || {}) as Record<string, unknown> | string;
      const toolResult = attr['tool.result'] || attr.result || attr.output || '';

      // Extract meaningful input summary
      let inputSummary = '';
      if (typeof toolArgs === 'object' && toolArgs !== null) {
        const keys = Object.keys(toolArgs);
        if (keys.length === 1) {
          inputSummary = truncate(String(toolArgs[keys[0]]), 30);
        } else if (toolArgs.query) {
          inputSummary = truncate(String(toolArgs.query), 30);
        } else if (toolArgs.search || toolArgs.q) {
          inputSummary = truncate(String(toolArgs.search || toolArgs.q), 30);
        } else {
          inputSummary = `${keys.length} params`;
        }
      } else if (typeof toolArgs === 'string') {
        inputSummary = truncate(toolArgs, 30);
      }

      // Tool call step
      steps.push({
        id: `step${stepIndex++}`,
        type: 'tool_call',
        label: escapeLabel(String(toolName)),
        detail: inputSummary || undefined,
        hasError,
        duration_ms,
      });

      // Tool result step (summarized)
      if (toolResult && steps.length < maxSteps) {
        let resultSummary = '';
        if (typeof toolResult === 'string') {
          resultSummary = truncate(toolResult, 35);
        } else if (Array.isArray(toolResult)) {
          resultSummary = `${toolResult.length} result(s)`;
        } else if (typeof toolResult === 'object') {
          const resultStr = JSON.stringify(toolResult);
          if (resultStr.length < 50) {
            resultSummary = truncate(resultStr, 35);
          } else {
            resultSummary = 'data returned';
          }
        }

        if (resultSummary) {
          steps.push({
            id: `step${stepIndex++}`,
            type: 'tool_result',
            label: 'Result',
            detail: resultSummary,
            hasError,
          });
        }
      }
    }
  }

  return steps;
}

/**
 * Build a flowchart diagram from steps
 */
function buildFlowchartDiagram(steps: FlowStep[]): string {
  let diagram = 'flowchart TD\n';

  // Define nodes with appropriate shapes and labels
  for (const step of steps) {
    const label = step.detail
      ? `${step.label}<br/><small>${escapeLabel(step.detail)}</small>`
      : step.label;

    // Different shapes for different step types
    switch (step.type) {
      case 'user':
        diagram += `    ${step.id}[/"${label}"/]\n`; // Parallelogram (input)
        break;
      case 'thinking':
        diagram += `    ${step.id}{"${label}"}\n`; // Diamond (decision)
        break;
      case 'tool_call':
        diagram += `    ${step.id}[["${label}"]]\n`; // Subroutine (tool)
        break;
      case 'tool_result':
        diagram += `    ${step.id}[("${label}")]\n`; // Cylinder (data)
        break;
      case 'response':
        diagram += `    ${step.id}["${label}"]\n`; // Rectangle (output)
        break;
      case 'error':
        diagram += `    ${step.id}(("${label}"))\n`; // Circle (error)
        break;
      default:
        diagram += `    ${step.id}["${label}"]\n`;
    }
  }

  // Add edges (sequential flow)
  for (let i = 0; i < steps.length - 1; i++) {
    diagram += `    ${steps[i].id} --> ${steps[i + 1].id}\n`;
  }

  // Add styles based on step type
  diagram += '\n';
  for (const step of steps) {
    if (step.hasError) {
      diagram += `    style ${step.id} fill:#f87171,color:#fff\n`; // Red for errors
    } else {
      switch (step.type) {
        case 'user':
          diagram += `    style ${step.id} fill:#a78bfa,color:#fff\n`; // Purple for user
          break;
        case 'thinking':
          diagram += `    style ${step.id} fill:#60a5fa,color:#fff\n`; // Blue for thinking
          break;
        case 'tool_call':
          diagram += `    style ${step.id} fill:#fbbf24,color:#000\n`; // Yellow for tool
          break;
        case 'tool_result':
          diagram += `    style ${step.id} fill:#34d399,color:#000\n`; // Green for result
          break;
        case 'response':
          diagram += `    style ${step.id} fill:#4ade80,color:#000\n`; // Bright green for response
          break;
      }
    }
  }

  return diagram;
}

/**
 * Build a sequence diagram from steps
 */
function buildSequenceDiagram(steps: FlowStep[]): string {
  let diagram = 'sequenceDiagram\n';
  diagram += '    participant User\n';
  diagram += '    participant Agent\n';
  diagram += '    participant Tools\n\n';

  for (const step of steps) {
    const detail = step.detail ? `: ${escapeLabel(step.detail)}` : '';

    switch (step.type) {
      case 'user':
        diagram += `    User->>Agent${detail}\n`;
        break;
      case 'thinking':
        diagram += `    Note over Agent: ${step.label}${detail}\n`;
        break;
      case 'tool_call':
        diagram += `    Agent->>Tools: ${step.label}${detail}\n`;
        break;
      case 'tool_result':
        diagram += `    Tools-->>Agent${detail}\n`;
        break;
      case 'response':
        diagram += `    Agent-->>User${detail}\n`;
        break;
    }
  }

  return diagram;
}

/**
 * Generate a user-centric Mermaid diagram from spans
 *
 * @param spans - Array of spans to generate diagram from
 * @param params - Optional parameters for diagram type and max steps
 */
export function generateFlowDiagram(
  spans: Span[],
  params: GenerateFlowDiagramParams = {}
): GenerateFlowDiagramResult {
  try {
    if (spans.length === 0) {
      return {
        success: false,
        error: 'No spans provided',
      };
    }

    const diagramType = params.diagramType || 'flowchart';
    const maxSteps = params.maxSteps || 12;

    // Extract meaningful steps from spans
    const steps = extractFlowSteps(spans, maxSteps);

    if (steps.length === 0) {
      return {
        success: false,
        error: 'No meaningful steps found in spans (no LLM calls or tool calls)',
      };
    }

    // Build diagram based on type
    let diagram = '';
    if (diagramType === 'flowchart') {
      diagram = buildFlowchartDiagram(steps);
    } else if (diagramType === 'sequence') {
      diagram = buildSequenceDiagram(steps);
    }

    return {
      success: true,
      diagram_type: diagramType,
      total_spans: spans.length,
      steps_shown: steps.length,
      mermaid: diagram.trim(),
      _note: `Diagram shows logical data flow from user perspective. Include in markdown as:\n\`\`\`mermaid\n${diagram.trim()}\n\`\`\``,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate diagram',
    };
  }
}

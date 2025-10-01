import { Span, RunDTO } from '@/services/runs-api';

export interface ParsedUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  is_cache_used?: boolean;
}

export interface ParsedRunMetrics {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  llm_calls: number;
}

/**
 * Parses usage information from trace spans
 */
export class TraceUsageParser {
  /**
   * Extracts usage data from a single span
   */
  static parseUsageFromSpan(span: Span): ParsedUsage | null {
    try {
      // Check child_attribute first (most common location for usage data)
      if (span.child_attribute && 'usage' in span.child_attribute) {
        const usageStr = span.child_attribute.usage as string;
        if (typeof usageStr === 'string') {
          const usage = JSON.parse(usageStr);
          return {
            input_tokens: usage.input_tokens || usage.prompt_tokens || 0,
            output_tokens: usage.output_tokens || usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
            cost: usage.cost || 0,
            is_cache_used: usage.is_cache_used || false,
          };
        }
      }

      // Check attribute for usage data
      if (span.attribute && 'usage' in span.attribute) {
        const usageStr = span.attribute.usage as string;
        if (typeof usageStr === 'string') {
          const usage = JSON.parse(usageStr);
          return {
            input_tokens: usage.input_tokens || usage.prompt_tokens || 0,
            output_tokens: usage.output_tokens || usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
            cost: usage.cost || 0,
            is_cache_used: usage.is_cache_used || false,
          };
        }
      }

      // Check for cost in child_attribute
      if (span.child_attribute && 'cost' in span.child_attribute) {
        const costStr = span.child_attribute.cost as string;
        if (typeof costStr === 'string') {
          const costData = JSON.parse(costStr);
          return {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            cost: costData.cost || 0,
            is_cache_used: costData.is_cache_used || false,
          };
        }
      }

    } catch (error) {
      console.warn('Failed to parse usage from span:', span.span_id, error);
    }

    return null;
  }

  /**
   * Aggregates usage data from all spans in a run
   */
  static parseUsageFromRun(run: RunDTO, spans: Span[]): ParsedRunMetrics {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let llmCalls = 0;

    spans.forEach(span => {
      const usage = this.parseUsageFromSpan(span);
      if (usage) {
        totalInputTokens += usage.input_tokens;
        totalOutputTokens += usage.output_tokens;
        totalCost += usage.cost;
        
        // Count model calls
        if (span.operation_name === 'model_call' || span.operation_name === 'openai') {
          llmCalls++;
        }
      }
    });

    return {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalInputTokens + totalOutputTokens,
      cost: totalCost,
      llm_calls: llmCalls,
    };
  }

  /**
   * Updates run data with parsed usage metrics
   */
  static updateRunWithUsage(run: RunDTO, spans: Span[]): RunDTO {
    const usage = this.parseUsageFromRun(run, spans);
    
    return {
      ...run,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost: usage.cost,
      llm_calls: usage.llm_calls,
    };
  }

  /**
   * Updates multiple runs with usage data from their spans
   */
  static updateRunsWithUsage(runs: RunDTO[], spanMap: Record<string, Span[]>): RunDTO[] {
    return runs.map(run => {
      if (run.run_id && spanMap[run.run_id]) {
        return this.updateRunWithUsage(run, spanMap[run.run_id]);
      }
      return run;
    });
  }
}

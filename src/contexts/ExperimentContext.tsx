import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useExperiment } from "@/hooks/useExperiment";
import { emitter } from "@/utils/eventEmitter";
import { tryParseJson } from "@/utils/modelUtils";
import type { Span } from "@/types/common-type";

// Context type: useExperiment return type + UI state
type ExperimentContextType = ReturnType<typeof useExperimentWrapper>

const ExperimentContext = createContext<ExperimentContextType | undefined>(undefined);

interface ExperimentProviderProps {
  spanId: string | null;
  projectId: string;
}



export function ExperimentProvider({ spanId, projectId, children }: {
  spanId: string | null;
  projectId: string;
  children: ReactNode;
}) {
  const value = useExperimentWrapper({ spanId, projectId });
  return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>;
}
export function useExperimentWrapper({ spanId, projectId }: ExperimentProviderProps) {
  // Editor UI state
  const [activeTab, setActiveTab] = useState<"visual" | "json">("visual");

  // Output panel UI state
  const [outputPanelTab, setOutputPanelTab] = useState<"output" | "trace">("output");
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [collapsedSpans, setCollapsedSpans] = useState<string[]>([]);
  const [detailSpanId, setDetailSpanId] = useState<string | null>(null);

  const experimentHook = useExperiment(spanId, projectId);

  // Listen for agent tool events
  useEffect(() => {
    // Handle get_experiment_data request
    const   handleGetExperimentData = () => {
      emitter.emit('vllora_experiment_data_response', {
        experimentData: experimentHook.experimentData,
        originalExperimentData: experimentHook.originalExperimentData,
        result: experimentHook.result,
        running: experimentHook.running,
      });
    };

    // Handle apply_experiment_data request
    const handleApplyExperimentData = ({ data }: { data: Record<string, unknown> }) => {
      try {
        experimentHook.updateExperimentData(data);
        emitter.emit('vllora_apply_experiment_data_response', { success: true });
      } catch (error) {
        emitter.emit('vllora_apply_experiment_data_response', {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to apply data',
        });
      }
    };

    // Handle run_experiment request
    const handleRunExperiment = async () => {
      try {
        const result = await experimentHook.runExperiment({});
        emitter.emit('vllora_run_experiment_response', { success: true, result });
      } catch (error) {
        emitter.emit('vllora_run_experiment_response', {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run experiment',
        });
      }
    };

    // Handle evaluate_experiment_results request
    const handleEvaluateExperimentResults = () => {
      const originalInfo = experimentHook.originalInfo;
      const resultInfo = experimentHook.resultInfo;
      const result = experimentHook.result;
      const span = experimentHook.span;
      const traceSpans = experimentHook.traceSpans;

      // Helper to parse usage from string or object (like span-converter.tsx pattern)
      const parseUsage = (usage: unknown): Record<string, unknown> | null => {
        if (!usage) return null;
        // If it's already an object, return it
        if (typeof usage === 'object' && !Array.isArray(usage)) {
          return usage as Record<string, unknown>;
        }
        // If it's a string, try to parse it as JSON
        if (typeof usage === 'string') {
          const parsed = tryParseJson(usage);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        }
        return null;
      };

      // Helper to extract numeric values from usage objects
      const getUsageValue = (usage: Record<string, unknown> | null, key: string): number | null => {
        if (!usage) return null;
        const value = usage[key];
        return typeof value === 'number' ? value : null;
      };

      // Helper to parse cost (handles string like "$0.001" or number)
      const parseCost = (cost: unknown): number | null => {
        if (typeof cost === 'number') return cost;
        if (typeof cost === 'string') {
          const parsed = parseFloat(cost.replace(/[^0-9.-]/g, ''));
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      // Helper to calculate percentage change
      const calcPercentChange = (original: number | null, current: number | null): number | null => {
        if (original === null || current === null || original === 0) return null;
        return ((current - original) / original) * 100;
      };

      // Helper to calculate duration in seconds (3 decimal places)
      const calculateDuration = (startUs: number | undefined, finishUs: number | undefined): number | null => {
        if (!startUs || !finishUs) return null;
        const durationSeconds = (finishUs - startUs) / 1_000_000;
        return parseFloat(durationSeconds.toFixed(3));
      };

      // Parse usage objects (handle JSON strings)
      const originalUsageParsed = parseUsage(originalInfo?.usage);
      const newUsageParsed = parseUsage(resultInfo?.usage);

      // Extract metrics from parsed usage
      const originalCost = parseCost(originalInfo?.cost) ?? parseCost(getUsageValue(originalUsageParsed, 'cost'));
      const newCost = parseCost(resultInfo?.cost) ?? parseCost(getUsageValue(newUsageParsed, 'cost'));

      const originalTotalTokens = getUsageValue(originalUsageParsed, 'total_tokens');
      const newTotalTokens = getUsageValue(newUsageParsed, 'total_tokens');

      const originalInputTokens = getUsageValue(originalUsageParsed, 'prompt_tokens') ?? getUsageValue(originalUsageParsed, 'input_tokens');
      const newInputTokens = getUsageValue(newUsageParsed, 'prompt_tokens') ?? getUsageValue(newUsageParsed, 'input_tokens');

      const originalOutputTokens = getUsageValue(originalUsageParsed, 'completion_tokens') ?? getUsageValue(originalUsageParsed, 'output_tokens');
      const newOutputTokens = getUsageValue(newUsageParsed, 'completion_tokens') ?? getUsageValue(newUsageParsed, 'output_tokens');

      // Calculate duration for original (from span)
      const originalDuration = calculateDuration(span?.start_time_us, span?.finish_time_us);

      // Calculate duration for new experiment (from traceSpans - find api_invoke span)
      let newDuration: number | null = null;
      if (traceSpans && traceSpans.length > 0) {
        const newApiInvokeSpan = traceSpans.find(
          (s: Span) => s.operation_name === "api_invoke"
        );
        if (newApiInvokeSpan) {
          newDuration = calculateDuration(newApiInvokeSpan.start_time_us, newApiInvokeSpan.finish_time_us);
        }
      }

      emitter.emit('vllora_evaluate_experiment_results_response', {
        hasResults: !!result && !!originalInfo,
        original: {
          output: originalInfo?.content || null,
          model: originalInfo?.model || null,
          cost: originalCost,
          total_tokens: originalTotalTokens,
          input_tokens: originalInputTokens,
          output_tokens: originalOutputTokens,
          duration_seconds: originalDuration,
        },
        new: {
          output: result || null,
          model: resultInfo?.model || experimentHook.experimentData?.model || null,
          cost: newCost,
          total_tokens: newTotalTokens,
          input_tokens: newInputTokens,
          output_tokens: newOutputTokens,
          duration_seconds: newDuration,
        },
        comparison: {
          cost_change_percent: calcPercentChange(originalCost, newCost),
          total_tokens_change_percent: calcPercentChange(originalTotalTokens, newTotalTokens),
          input_tokens_change_percent: calcPercentChange(originalInputTokens, newInputTokens),
          output_tokens_change_percent: calcPercentChange(originalOutputTokens, newOutputTokens),
          duration_change_percent: calcPercentChange(originalDuration, newDuration),
        },
      });
    };

    emitter.on('vllora_get_experiment_data', handleGetExperimentData);
    emitter.on('vllora_apply_experiment_data', handleApplyExperimentData);
    emitter.on('vllora_run_experiment', handleRunExperiment);
    emitter.on('vllora_evaluate_experiment_results', handleEvaluateExperimentResults);

    return () => {
      emitter.off('vllora_get_experiment_data', handleGetExperimentData);
      emitter.off('vllora_apply_experiment_data', handleApplyExperimentData);
      emitter.off('vllora_run_experiment', handleRunExperiment);
      emitter.off('vllora_evaluate_experiment_results', handleEvaluateExperimentResults);
    };
  }, [experimentHook]);

  return {
    ...experimentHook,
    activeTab,
    setActiveTab,
    outputPanelTab,
    setOutputPanelTab,
    selectedSpanId,
    setSelectedSpanId,
    collapsedSpans,
    setCollapsedSpans,
    detailSpanId,
    setDetailSpanId,
    projectId,
  };
}

export function ExperimentConsumer() {
  const context = useContext(ExperimentContext);
  if (context === undefined) {
    throw new Error("ExperimentConsumer must be used within an ExperimentProvider");
  }
  return context;
}

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useExperiment } from "@/hooks/useExperiment";
import { emitter } from "@/utils/eventEmitter";

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
    const handleGetExperimentData = () => {
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

      // Helper to extract numeric values from usage objects
      const getUsageValue = (usage: unknown, key: string): number | null => {
        if (!usage || typeof usage !== 'object') return null;
        const value = (usage as Record<string, unknown>)[key];
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

      // Extract metrics
      const originalUsage = originalInfo?.usage;
      const newUsage = resultInfo?.usage;

      const originalCost = parseCost(originalInfo?.cost) ?? parseCost(getUsageValue(originalUsage, 'cost'));
      const newCost = parseCost(resultInfo?.cost) ?? parseCost(getUsageValue(newUsage, 'cost'));

      const originalTotalTokens = getUsageValue(originalUsage, 'total_tokens');
      const newTotalTokens = getUsageValue(newUsage, 'total_tokens');

      const originalInputTokens = getUsageValue(originalUsage, 'prompt_tokens') ?? getUsageValue(originalUsage, 'input_tokens');
      const newInputTokens = getUsageValue(newUsage, 'prompt_tokens') ?? getUsageValue(newUsage, 'input_tokens');

      const originalOutputTokens = getUsageValue(originalUsage, 'completion_tokens') ?? getUsageValue(originalUsage, 'output_tokens');
      const newOutputTokens = getUsageValue(newUsage, 'completion_tokens') ?? getUsageValue(newUsage, 'output_tokens');

      emitter.emit('vllora_evaluate_experiment_results_response', {
        hasResults: !!result && !!originalInfo,
        original: {
          output: originalInfo?.content || null,
          model: originalInfo?.model || null,
          cost: originalCost,
          total_tokens: originalTotalTokens,
          input_tokens: originalInputTokens,
          output_tokens: originalOutputTokens,
        },
        new: {
          output: result || null,
          model: resultInfo?.model || experimentHook.experimentData?.model || null,
          cost: newCost,
          total_tokens: newTotalTokens,
          input_tokens: newInputTokens,
          output_tokens: newOutputTokens,
        },
        comparison: {
          cost_change_percent: calcPercentChange(originalCost, newCost),
          total_tokens_change_percent: calcPercentChange(originalTotalTokens, newTotalTokens),
          input_tokens_change_percent: calcPercentChange(originalInputTokens, newInputTokens),
          output_tokens_change_percent: calcPercentChange(originalOutputTokens, newOutputTokens),
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

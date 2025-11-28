import { createContext, useContext, useState, type ReactNode } from "react";
import { useExperiment } from "@/hooks/useExperiment";

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

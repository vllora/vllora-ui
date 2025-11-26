import { useState } from "react";
import { useSearchParams } from "react-router";
import { useExperiment } from "@/hooks/useExperiment";
import { ExperimentHeader } from "@/components/experiment/ExperimentHeader";
import { ExperimentFooterControls } from "@/components/experiment/ExperimentFooterControls";
import { ExperimentMainContent } from "@/components/experiment/ExperimentMainContent";
import { ExperimentLoadingState } from "@/components/experiment/ExperimentLoadingState";

export const ExperimentPage = () => {
  const [searchParams] = useSearchParams();
  const spanId = searchParams.get("span_id");
  const [activeTab, setActiveTab] = useState<"visual" | "json">("visual");

  // Use the experiment hook
  const {
    loading,
    experimentData,
    originalExperimentData,
    result,
    originalOutput,
    running,
    runExperiment,
    addMessage,
    updateMessage,
    updateMessageRole,
    deleteMessage,
    updateExperimentData,
  } = useExperiment(spanId);

  if (loading) {
    return <ExperimentLoadingState />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <ExperimentHeader experimentData={experimentData} />

      {/* Main Content */}
      <ExperimentMainContent
        experimentData={experimentData}
        result={result}
        originalOutput={originalOutput}
        running={running}
        addMessage={addMessage}
        updateMessage={updateMessage}
        updateMessageRole={updateMessageRole}
        deleteMessage={deleteMessage}
        updateExperimentData={updateExperimentData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Footer Controls */}
      <ExperimentFooterControls
        experimentData={experimentData}
        originalExperimentData={originalExperimentData}
        running={running}
        updateExperimentData={updateExperimentData}
        runExperiment={runExperiment}
        activeTab={activeTab}
      />
    </div>
  );
};

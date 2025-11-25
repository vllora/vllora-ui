import { useRef } from "react";
import type { ExperimentData, Message, Tool } from "@/hooks/useExperiment";
import { ExperimentVisualEditor, type ExperimentVisualEditorRef } from "./ExperimentVisualEditor";
import { ExperimentJsonEditor } from "./ExperimentJsonEditor";
import { ExperimentToolbarActions } from "./ExperimentToolbarActions";
import { ExperimentOutputPanel } from "./ExperimentOutputPanel";
import { SegmentedControl } from "@/components/ui/segmented-control";

interface ExperimentMainContentProps {
  experimentData: ExperimentData;
  result: string;
  originalOutput: string;
  addMessage: () => void;
  updateMessage: (index: number, content: string) => void;
  updateMessageRole: (index: number, role: Message["role"]) => void;
  deleteMessage: (index: number) => void;
  updateExperimentData: (updates: Partial<ExperimentData>) => void;
  activeTab: "visual" | "json";
  setActiveTab: (tab: "visual" | "json") => void;
}

export function ExperimentMainContent({
  experimentData,
  result,
  originalOutput,
  addMessage,
  updateMessage,
  updateMessageRole,
  deleteMessage,
  updateExperimentData,
  activeTab,
  setActiveTab,
}: ExperimentMainContentProps) {
  const visualEditorRef = useRef<ExperimentVisualEditorRef>(null);

  const handleAddMessage = () => {
    addMessage();
    // Trigger scroll and highlight in visual editor
    setTimeout(() => {
      visualEditorRef.current?.scrollToNewMessage(experimentData.messages.length);
    }, 100);
  };

  const handleAddTool = () => {
    const newTool: Tool = {
      type: "function",
      function: {
        name: "",
        description: "",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    };
    const tools = experimentData.tools || [];
    updateExperimentData({ tools: [...tools, newTool] });
    // Trigger scroll and highlight in visual editor
    setTimeout(() => {
      visualEditorRef.current?.scrollToNewTool(tools.length);
    }, 100);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column - Request Editor */}
      <div className="w-3/5 border-r border-border flex flex-col overflow-hidden">
        {/* Sticky Toolbar */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
           
            {activeTab === "visual" && (
              <ExperimentToolbarActions
                onAddMessage={handleAddMessage}
                onAddTool={handleAddTool}
              />
            )}
          </div>
          <SegmentedControl
            options={[
              { value: "visual", label: "Visual" },
              { value: "json", label: "JSON" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "visual" ? (
            <ExperimentVisualEditor
              ref={visualEditorRef}
              messages={experimentData.messages}
              tools={experimentData.tools || []}
              updateMessage={updateMessage}
              updateMessageRole={updateMessageRole}
              deleteMessage={deleteMessage}
              onToolsChange={(tools) => updateExperimentData({ tools })}
            />
          ) : (
            <ExperimentJsonEditor
              experimentData={experimentData}
              onExperimentDataChange={updateExperimentData}
            />
          )}
        </div>
      </div>

      {/* Right Column - Outputs */}
      <ExperimentOutputPanel result={result} originalOutput={originalOutput} />
    </div>
  );
}

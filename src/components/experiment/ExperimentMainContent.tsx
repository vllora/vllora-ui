import { useState } from "react";
import type { ExperimentData, Message } from "@/hooks/useExperiment";
import { ExperimentVisualEditor } from "./ExperimentVisualEditor";
import { ExperimentJsonEditor } from "./ExperimentJsonEditor";

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
  const [activeViewTab, setActiveViewTab] = useState<"output" | "trace">("output");

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column - Request Editor */}
      <div className="w-3/5 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 flex-1 overflow-y-auto">
          {/* View Toggle */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Request Body
            </h2>
            <div className="flex items-center bg-muted rounded-md p-1">
              <button
                onClick={() => setActiveTab("visual")}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  activeTab === "visual"
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Visual
              </button>
              <button
                onClick={() => setActiveTab("json")}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  activeTab === "json"
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                JSON
              </button>
            </div>
          </div>

          {activeTab === "visual" ? (
            <ExperimentVisualEditor
              messages={experimentData.messages}
              tools={experimentData.tools || []}
              addMessage={addMessage}
              updateMessage={updateMessage}
              updateMessageRole={updateMessageRole}
              deleteMessage={deleteMessage}
              onToolsChange={(tools) => updateExperimentData({ tools })}
            />
          ) : (
            <ExperimentJsonEditor experimentData={experimentData} />
          )}
        </div>
      </div>

      {/* Right Column - Outputs */}
      <div className="w-2/5 flex flex-col overflow-hidden">
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Tabs */}
          <div className="flex items-center gap-4 border-b border-border pb-2 mb-4">
            <button
              onClick={() => setActiveViewTab("output")}
              className={`text-sm font-semibold pb-2 ${
                activeViewTab === "output"
                  ? "border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Output
            </button>
            <button
              onClick={() => setActiveViewTab("trace")}
              className={`text-sm font-semibold pb-2 ${
                activeViewTab === "trace"
                  ? "border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Trace
            </button>
          </div>

          {activeViewTab === "output" ? (
            <>
              {/* New Output */}
              {result && (
                <div className="mb-4 border-2 border-green-500 rounded-lg p-4 bg-green-50 dark:bg-green-950">
                  <h3 className="text-sm font-semibold mb-2">New Output</h3>
                  <pre className="text-sm whitespace-pre-wrap font-mono">{result}</pre>
                </div>
              )}

              {/* Original Output */}
              {originalOutput && (
                <div className="border-2 border-dashed border-border rounded-lg p-4 bg-muted">
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                    Original Output
                  </h3>
                  <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                    {originalOutput}
                  </pre>
                </div>
              )}

              {!result && !originalOutput && (
                <div className="text-center text-muted-foreground text-sm">
                  Run the experiment to see output
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-muted-foreground text-sm">
              Trace view will be available after running the experiment
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

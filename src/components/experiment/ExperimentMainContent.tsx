import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ExperimentData } from "@/hooks/useExperiment";

interface ExperimentMainContentProps {
  experimentData: ExperimentData;
  result: string;
  originalOutput: string;
  addMessage: () => void;
  updateMessage: (index: number, content: string) => void;
  deleteMessage: (index: number) => void;
}

export function ExperimentMainContent({
  experimentData,
  result,
  originalOutput,
  addMessage,
  updateMessage,
  deleteMessage,
}: ExperimentMainContentProps) {
  const [activeTab, setActiveTab] = useState<"visual" | "json">("visual");
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
            <div className="space-y-4">
              {/* Messages */}
              <div className="space-y-2">
                {experimentData.messages.map((message, index) => (
                  <div key={index} className="border border-border rounded-lg p-3 bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-xs font-semibold uppercase ${
                          message.role === "system"
                            ? "text-purple-500"
                            : message.role === "user"
                            ? "text-blue-500"
                            : "text-green-500"
                        }`}
                      >
                        {message.role}
                      </span>
                      <button
                        onClick={() => deleteMessage(index)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={message.content}
                      onChange={(e) => updateMessage(index, e.target.value)}
                      className="w-full min-h-[80px] bg-background border border-border rounded px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Enter message content..."
                    />
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={addMessage}
                className="w-full border-dashed"
              >
                + Add Message
              </Button>
            </div>
          ) : (
            <div className="border border-border rounded-lg p-4 bg-black">
              <pre className="text-sm text-green-400 overflow-auto">
                {JSON.stringify(
                  {
                    model: experimentData.model,
                    messages: experimentData.messages,
                    temperature: experimentData.temperature,
                    ...(experimentData.max_tokens && { max_tokens: experimentData.max_tokens }),
                  },
                  null,
                  2
                )}
              </pre>
            </div>
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

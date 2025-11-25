import { useState } from "react";

interface ExperimentOutputPanelProps {
  result: string;
  originalOutput: string;
}

export function ExperimentOutputPanel({
  result,
  originalOutput,
}: ExperimentOutputPanelProps) {
  const [activeTab, setActiveTab] = useState<"output" | "trace">("output");

  return (
    <div className="w-2/5 flex flex-col overflow-hidden">
      <div className="p-4 flex-1 overflow-y-auto">
        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-border pb-2 mb-4">
          <button
            onClick={() => setActiveTab("output")}
            className={`text-sm font-semibold pb-2 ${
              activeTab === "output"
                ? "border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Output
          </button>
          <button
            onClick={() => setActiveTab("trace")}
            className={`text-sm font-semibold pb-2 ${
              activeTab === "trace"
                ? "border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Trace
          </button>
        </div>

        {activeTab === "output" ? (
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
  );
}

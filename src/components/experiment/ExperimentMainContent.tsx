import { useRef, useMemo, useState } from "react";
import type { ExperimentData, Message, Tool, MessageContentPart } from "@/hooks/useExperiment";
import type { Span } from "@/types/common-type";
import { ExperimentVisualEditor, type ExperimentVisualEditorRef } from "./ExperimentVisualEditor";
import { ExperimentJsonEditor } from "./ExperimentJsonEditor";
import { ExperimentToolbarActions } from "./ExperimentToolbarActions";
import { ExperimentOutputPanel } from "./ExperimentOutputPanel";
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DetectedVariables } from "./DetectedVariables";
import { TRACE_PANEL_WIDTH } from "@/utils/constant";

interface ExperimentMainContentProps {
  experimentData: ExperimentData;
  result: string;
  originalOutput: string;
  running: boolean;
  traceSpans: Span[];
  loadingTraceSpans: boolean;
  projectId: string;
  addMessage: () => void;
  updateMessage: (index: number, content: string | MessageContentPart[]) => void;
  updateMessageRole: (index: number, role: Message["role"]) => void;
  deleteMessage: (index: number) => void;
  updateExperimentData: (updates: Partial<ExperimentData>) => void;
  activeTab: "visual" | "json";
  setActiveTab: (tab: "visual" | "json") => void;
  loadTraceSpans: () => void;
}

export function ExperimentMainContent({
  experimentData,
  result,
  originalOutput,
  running,
  traceSpans,
  loadingTraceSpans,
  projectId,
  addMessage,
  updateMessage,
  updateMessageRole,
  deleteMessage,
  updateExperimentData,
  activeTab,
  setActiveTab,
  loadTraceSpans,
}: ExperimentMainContentProps) {
  const visualEditorRef = useRef<ExperimentVisualEditorRef>(null);
  const [detailSpanId, setDetailSpanId] = useState<string | null>(null);

  // Find the detail span from traceSpans
  const detailSpan = useMemo(() => {
    if (!detailSpanId) return null;
    return traceSpans.find(span => span.span_id === detailSpanId) || null;
  }, [detailSpanId, traceSpans]);

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

  // Extract mustache variables from the entire experimentData object
  const extractedVariables = useMemo(() => {
    const variables = new Set<string>();

    // Recursively extract variables from any string in the object
    const extractFromValue = (value: unknown): void => {
      if (typeof value === "string") {
        const matches = value.match(/\{\{(\w+)\}\}/g) || [];
        matches.forEach((match) => variables.add(match.slice(2, -2)));
      } else if (Array.isArray(value)) {
        value.forEach(extractFromValue);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(extractFromValue);
      }
    };

    extractFromValue(experimentData);
    return Array.from(variables);
  }, [experimentData]);

  const handleRenameVariable = (oldName: string, newName: string) => {
    // Recursively replace variables in all strings
    const replaceInValue = <T,>(value: T): T => {
      if (typeof value === "string") {
        return value.replace(
          new RegExp(`\\{\\{${oldName}\\}\\}`, "g"),
          `{{${newName}}}`
        ) as T;
      } else if (Array.isArray(value)) {
        return value.map(replaceInValue) as T;
      } else if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = replaceInValue(val);
        }
        return result as T;
      }
      return value;
    };

    // Replace in messages and tools
    const updatedData: Partial<ExperimentData> = {};
    if (experimentData.messages) {
      updatedData.messages = replaceInValue(experimentData.messages);
    }
    if (experimentData.tools) {
      updatedData.tools = replaceInValue(experimentData.tools);
    }
    if (experimentData.description) {
      updatedData.description = replaceInValue(experimentData.description);
    }
    updateExperimentData(updatedData);
  };

  const handlePromptVariablesChange = (promptVariables: Record<string, string>) => {
    updateExperimentData({ promptVariables });
  };

  return (
    <div className="flex-1 flex overflow-hidden relative">
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

        {/* Detected Variables - shown for both modes */}
        {extractedVariables.length > 0 && (
          <div className="px-4 py-3 border-b border-border">
            <DetectedVariables
              variables={extractedVariables}
              values={experimentData.promptVariables || {}}
              onChange={handlePromptVariablesChange}
              onRenameVariable={handleRenameVariable}
            />
          </div>
        )}

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
      <div className="w-2/5 h-full overflow-hidden">
        <ExperimentOutputPanel
          result={result}
          originalOutput={originalOutput}
          running={running}
          isStreaming={experimentData.stream ?? true}
          traceSpans={traceSpans}
          loadingTraceSpans={loadingTraceSpans}
          projectId={projectId}
          onLoadTraceSpans={loadTraceSpans}
          setDetailSpanId={setDetailSpanId}
        />
      </div>

      {/* Span Details Overlay */}
      {detailSpan && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setDetailSpanId(null)}
          />

          {/* Sidebar Panel */}
          <div
            className="absolute top-0 right-0 bottom-0 bg-background z-50 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col border-l border-border"
            style={{ width: TRACE_PANEL_WIDTH }}
          >
            <SpanDetailPanel
              span={detailSpan}
              relatedSpans={traceSpans}
              onClose={() => setDetailSpanId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}

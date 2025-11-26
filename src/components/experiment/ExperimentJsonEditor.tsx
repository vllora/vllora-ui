import { useState, useEffect } from "react";
import type { ExperimentData } from "@/hooks/useExperiment";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";

interface ExperimentJsonEditorProps {
  experimentData: ExperimentData;
  onExperimentDataChange?: (data: Partial<ExperimentData>) => void;
}

export function ExperimentJsonEditor({ experimentData, onExperimentDataChange }: ExperimentJsonEditorProps) {
  const buildJsonValue = () => {
    return JSON.stringify(
      {
        model: experimentData.model,
        messages: experimentData.messages,
        ...(experimentData.tools && experimentData.tools.length > 0 && { tools: experimentData.tools }),
        ...(experimentData.tool_choice && { tool_choice: experimentData.tool_choice }),
      },
      null,
      2
    );
  };

  const [jsonValue, setJsonValue] = useState(buildJsonValue);

  // Sync when experimentData changes from outside
  useEffect(() => {
    setJsonValue(buildJsonValue());
  }, [experimentData]);

  const handleChange = (value: string) => {
    setJsonValue(value);

    // Try to parse and update if valid
    if (onExperimentDataChange) {
      try {
        const parsed = JSON.parse(value);
        onExperimentDataChange(parsed);
      } catch {
        // Invalid JSON, don't update
      }
    }
  };

  return (
    <div className="h-full min-h-[50vh]">
      <JsonEditor
        value={jsonValue}
        onChange={handleChange}
        transparentBackground
        disableStickyScroll
      />
    </div>
  );
}

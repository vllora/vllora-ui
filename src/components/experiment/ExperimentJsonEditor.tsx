import { useState, useEffect, useRef } from "react";
import type { ExperimentData } from "@/hooks/useExperiment";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";

// Internal fields that shouldn't be included in the API JSON
const INTERNAL_FIELDS = new Set(["name", "description", "headers", "promptVariables"]);

interface ExperimentJsonEditorProps {
  experimentData: ExperimentData;
  onExperimentDataChange?: (data: Partial<ExperimentData>) => void;
}

export function ExperimentJsonEditor({ experimentData, onExperimentDataChange }: ExperimentJsonEditorProps) {
  // Track if changes originated from this editor to prevent sync loop
  const isInternalChange = useRef(false);

  const buildJsonValue = () => {
    // Build JSON object with all non-internal fields dynamically
    const jsonObj: Record<string, unknown> = {};

    // Add model and messages first for better ordering
    if (experimentData.model !== undefined) {
      jsonObj.model = experimentData.model;

    }
    if (experimentData.messages !== undefined) {
      jsonObj.messages = experimentData.messages;
            console.log('=== experimentData.messages', experimentData.messages)

    }

    // Add all other non-internal fields dynamically
    for (const [key, value] of Object.entries(experimentData)) {
      if (INTERNAL_FIELDS.has(key)) continue;
      if (key === "model" || key === "messages") continue; // Already added
      if (value === undefined) continue;
      // Skip empty arrays for tools
      if (key === "tools" && Array.isArray(value) && value.length === 0) continue;
      jsonObj[key] = value;
    }

    return JSON.stringify(jsonObj, null, 2);
  };

  const [jsonValue, setJsonValue] = useState(buildJsonValue);

  // Sync when experimentData changes from outside (not from this editor)
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setJsonValue(buildJsonValue());
  }, [experimentData]);

  const handleChange = (value: string) => {
    setJsonValue(value);

    // Try to parse and update if valid
    if (onExperimentDataChange) {
      try {
        const parsed = JSON.parse(value);
        // Mark that this change came from the editor
        isInternalChange.current = true;
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

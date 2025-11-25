import type { ExperimentData } from "@/hooks/useExperiment";

interface ExperimentJsonEditorProps {
  experimentData: ExperimentData;
}

export function ExperimentJsonEditor({ experimentData }: ExperimentJsonEditorProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-black">
      <pre className="text-sm text-green-400 overflow-auto">
        {JSON.stringify(
          {
            model: experimentData.model,
            messages: experimentData.messages,
            temperature: experimentData.temperature,
            ...(experimentData.max_tokens && { max_tokens: experimentData.max_tokens }),
            ...(experimentData.tools && experimentData.tools.length > 0 && { tools: experimentData.tools }),
            ...(experimentData.tool_choice && { tool_choice: experimentData.tool_choice }),
          },
          null,
          2
        )}
      </pre>
    </div>
  );
}

import { ToolCallItem } from "../../tool-definitions-viewer";

interface ToolInfoDisplayProps {
  toolInfo: Record<string, any>;
}

export const ToolInfoDisplay = ({ toolInfo }: ToolInfoDisplayProps) => {
  return (
    <div className="space-y-2 text-left">
      <ToolCallItem
        key={`${toolInfo.function?.name ?? ""}`}
        toolCall={toolInfo as any}
        isExpanded={true}
        hideTitle={true}
        index={0}
      />
    </div>
  );
};

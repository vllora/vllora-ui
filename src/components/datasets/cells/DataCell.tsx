/**
 * DataCell
 *
 * Displays trace data preview with tooltip showing full JSON and expand link.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DataCellProps {
  data: unknown;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
  /** Callback when expand is clicked */
  onExpand?: () => void;
}

// Helper to get a preview of the data object
const getDataPreview = (data: unknown, maxLength = 120): string => {
  if (data === null || data === undefined) return "null";
  if (typeof data === "string") return data.length > maxLength ? data.slice(0, maxLength) + "..." : data;
  if (typeof data === "number" || typeof data === "boolean") return String(data);
  try {
    const json = JSON.stringify(data);
    return json.length > maxLength ? json.slice(0, maxLength) + "..." : json;
  } catch {
    return "[Object]";
  }
};

// Helper to format data for tooltip (more lines)
const getDataTooltip = (data: unknown): string => {
  if (data === null || data === undefined) return "null";
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "[Object]";
  }
};

export function DataCell({ data, tableLayout = false, onExpand }: DataCellProps) {
  const dataPreview = getDataPreview(data);
  const dataTooltip = getDataTooltip(data);

  return (
    <div
      className={cn(
        "flex-1 min-w-0 flex flex-col gap-1",
        tableLayout && "flex-[2]"
      )}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <code className="text-xs text-[rgb(var(--theme-400))] font-mono px-2 py-1.5 rounded truncate block cursor-default leading-relaxed">
              {dataPreview}
            </code>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="start"
            className="max-w-md max-h-64 overflow-auto p-0"
          >
            <pre className="text-xs font-mono p-3 whitespace-pre-wrap break-all">
              {dataTooltip}
            </pre>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {onExpand ? (
        <button
          onClick={onExpand}
          className="text-xs text-muted-foreground hover:text-[rgb(var(--theme-500))] transition-colors text-left px-2"
        >
          Expand trace
        </button>
      ) : (
        <span className="text-xs text-muted-foreground/60 px-2">
          Expand trace
        </span>
      )}
    </div>
  );
}

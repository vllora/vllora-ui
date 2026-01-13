/**
 * DataCell
 *
 * Displays trace data preview. Click to expand and edit.
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

export function DataCell({ data, tableLayout = false, onExpand }: DataCellProps) {
  const dataPreview = getDataPreview(data);

  return (
    <div
      className={cn(
        "flex-1 min-w-0",
        tableLayout && "flex-[2]"
      )}
    >
      {onExpand ? (
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onExpand}
                className="text-xs text-muted-foreground font-mono px-2 py-1.5 rounded truncate block leading-relaxed text-left w-full hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer"
              >
                {dataPreview}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Click to view & edit
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <code className="text-xs text-muted-foreground font-mono px-2 py-1.5 rounded truncate block leading-relaxed">
          {dataPreview}
        </code>
      )}
    </div>
  );
}

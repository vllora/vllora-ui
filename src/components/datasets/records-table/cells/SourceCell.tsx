/**
 * SourceCell
 *
 * Displays the source of a record - either from a span (with link) or manually created.
 */

import { Link } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link2, FileText, Sparkles } from "lucide-react";
import { COLUMN_WIDTHS } from "../../table-columns";

interface SourceCellProps {
  spanId?: string;
  isGenerated?: boolean;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
}

export function SourceCell({ spanId, isGenerated = false, tableLayout = false }: SourceCellProps) {
  const hasSpan = !!spanId;
  const truncatedId = spanId ? spanId.slice(0, 8) : null;
  const spanLink = spanId
    ? `/chat?tab=traces&group_by=thread&detail_span_id=${spanId}`
    : null;

  return (
    <div
      className={cn(
        "shrink-0",
        tableLayout && cn(COLUMN_WIDTHS.source, "text-center")
      )}
    >
      {isGenerated ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Sparkles className="w-3 h-3" />
          <span>Generated</span>
        </span>
      ) : hasSpan && spanLink ? (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={spanLink}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Link2 className="w-3 h-3" />
                <span className="font-mono">{truncatedId}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              View in Traces
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
          <FileText className="w-3 h-3" />
          <span>Manual</span>
        </span>
      )}
    </div>
  );
}

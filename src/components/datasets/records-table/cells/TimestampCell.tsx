/**
 * TimestampCell
 *
 * Displays a record's creation timestamp.
 */

import { cn } from "@/lib/utils";
import { COLUMN_WIDTHS } from "../../table-columns";

interface TimestampCellProps {
  timestamp: number;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
}

// Format timestamp to readable date string
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export function TimestampCell({
  timestamp,
  tableLayout = false,
}: TimestampCellProps) {
  return (
    <div
      className={cn(
        "shrink-0 text-right",
        tableLayout ? COLUMN_WIDTHS.timestamp : "min-w-[120px]"
      )}
    >
      <span className="text-xs text-muted-foreground font-mono">
        {formatTimestamp(timestamp)}
      </span>
    </div>
  );
}

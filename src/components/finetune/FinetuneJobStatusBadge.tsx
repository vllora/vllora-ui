import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FinetuneJobStatus } from "@/services/finetune-api";
import { Loader2 } from "lucide-react";

interface FinetuneJobStatusBadgeProps {
  status: FinetuneJobStatus | string;
  className?: string;
}

const statusConfig: Record<
  string,
  { label: string; className: string; showSpinner?: boolean }
> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    showSpinner: true,
  },
  running: {
    label: "Running",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    showSpinner: true,
  },
  succeeded: {
    label: "Succeeded",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-800 border-gray-200",
  },
};

export function FinetuneJobStatusBadge({
  status,
  className,
}: FinetuneJobStatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-gray-100 text-gray-800 border-gray-200",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium",
        config.className,
        className
      )}
    >
      {config.showSpinner && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {config.label}
    </Badge>
  );
}

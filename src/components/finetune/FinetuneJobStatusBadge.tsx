import { cn } from "@/lib/utils";
import { FinetuneJobStatus } from "@/services/finetune-api";
import { Loader2, CheckCircle2, XCircle, Clock, Ban } from "lucide-react";

interface FinetuneJobStatusBadgeProps {
  status: FinetuneJobStatus | string;
  className?: string;
}

const statusConfig: Record<
  string,
  { label: string; className: string; icon?: React.ElementType; showSpinner?: boolean }
> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    icon: Clock,
    showSpinner: true,
  },
  running: {
    label: "Running",
    className: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    showSpinner: true,
  },
  succeeded: {
    label: "Succeeded",
    className: "bg-green-500/15 text-green-500 border-green-500/30",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/15 text-red-500 border-red-500/30",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted/50 text-muted-foreground border-border",
    icon: Ban,
  },
};

export function FinetuneJobStatusBadge({
  status,
  className,
}: FinetuneJobStatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-muted/50 text-muted-foreground border-border",
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border",
        config.className,
        className
      )}
    >
      {config.showSpinner ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : Icon ? (
        <Icon className="h-3 w-3" />
      ) : null}
      {config.label}
    </span>
  );
}

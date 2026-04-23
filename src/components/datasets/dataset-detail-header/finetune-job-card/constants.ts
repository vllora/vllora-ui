/**
 * Constants for FinetuneJobCard
 */

import { Cpu, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { FinetuneJobStatus } from "@/services/finetune-api";

export const STATUS_CONFIG: Record<FinetuneJobStatus, {
  label: string;
  icon: typeof Loader2;
  color: string;
  bgGradient: string;
  iconColor: string;
  animate?: boolean;
}> = {
  pending: {
    label: "Pending",
    icon: Loader2,
    color: "text-amber-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-amber-950/20",
    iconColor: "text-amber-400",
    animate: true,
  },
  running: {
    label: "Training",
    icon: Cpu,
    color: "text-blue-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-blue-950/20",
    iconColor: "text-blue-400",
    animate: true,
  },
  succeeded: {
    label: "Completed",
    icon: CheckCircle,
    color: "text-emerald-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-emerald-950/20",
    iconColor: "text-emerald-400",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-red-950/20",
    iconColor: "text-red-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-zinc-400",
    bgGradient: "from-zinc-900/90 via-zinc-900/70 to-zinc-800/50",
    iconColor: "text-zinc-400",
  },
};

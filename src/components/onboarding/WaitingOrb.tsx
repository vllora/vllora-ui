/**
 * WaitingOrb
 *
 * Sentry-inspired animated orb used in empty/waiting states.
 * Shows a spinning ring with a pulsing outer glow.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface WaitingOrbProps {
  readonly icon: LucideIcon;
  readonly className?: string;
  readonly size?: "sm" | "md";
}

export function WaitingOrb({ icon: Icon, className, size = "md" }: WaitingOrbProps) {
  const isSm = size === "sm";
  const outer = isSm ? "w-16 h-16" : "w-[88px] h-[88px]";
  const inner = isSm ? "inset-3" : "inset-4";
  const iconSize = isSm ? "w-5 h-5" : "w-6 h-6";

  return (
    <div className={cn("relative", outer, className)}>
      {/* Pulsing outer ring */}
      <div className="absolute -inset-2 rounded-full border border-[rgba(var(--theme-500),0.06)] animate-[pulse-out_3s_ease-in-out_infinite]" />
      {/* Static ring */}
      <div className="absolute inset-0 rounded-full border-2 border-[rgba(var(--theme-500),0.1)]" />
      {/* Spinning ring */}
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[rgb(var(--theme-400))] animate-spin" style={{ animationDuration: "2.5s" }} />
      {/* Center */}
      <div className={cn("absolute rounded-full bg-[rgba(var(--theme-500),0.06)] flex items-center justify-center", inner)}>
        <Icon className={cn(iconSize, "text-[rgb(var(--theme-400))] opacity-60")} />
      </div>
    </div>
  );
}

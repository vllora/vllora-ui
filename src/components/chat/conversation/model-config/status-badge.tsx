import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  active: boolean;
  activeText?: string;
  inactiveText?: string;
  className?: string;
}

export function StatusBadge({
  active,
  activeText = "Active",
  inactiveText,
  className
}: StatusBadgeProps) {
  if (!active && !inactiveText) return null;

  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-medium",
        active
          ? "bg-green-500/20 text-green-400"
          : "bg-muted/50 text-muted-foreground",
        className
      )}
    >
      {active ? activeText : inactiveText}
    </span>
  );
}

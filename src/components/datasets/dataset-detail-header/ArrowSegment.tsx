/**
 * ArrowSegment
 *
 * SVG-based arrow/chevron segment for stepper navigation.
 * Used in SectionTabs for workflow step visualization.
 * Arrows represent dependency flow: Data → Evaluation → Finetune → Deploy.
 */

import { cn } from "@/lib/utils";

export type ArrowSegmentStatus = "completed" | "active" | "pending" | "locked" | "comingSoon";

interface ArrowSegmentProps {
  children: React.ReactNode;
  isFirst: boolean;
  isLast: boolean;
  status: ArrowSegmentStatus;
  isActive: boolean;
  isProcessing?: boolean;
  /** Whether this step is optional (shows dashed border) */
  isOptional?: boolean;
  onClick: () => void;
}

export function ArrowSegment({
  children,
  isFirst,
  isLast,
  status,
  isActive,
  isProcessing: _isProcessing = false,
  isOptional = false,
  onClick,
}: ArrowSegmentProps) {
  const height = 36;

  const getBgColor = () => {
    if (isActive) return "rgb(var(--theme-500))";
    if (status === "completed") return "rgba(var(--theme-500), 0.12)";
    if (status === "comingSoon") return "hsl(var(--muted) / 0.3)";
    if (status === "locked") return "hsl(var(--muted) / 0.5)";
    return "hsl(var(--muted))";
  };

  const getTextColor = () => {
    if (isActive) return "white";
    if (status === "completed") return "rgb(var(--theme-600))";
    if (status === "comingSoon") return "hsl(var(--muted-foreground) / 0.35)";
    if (status === "locked") return "hsl(var(--muted-foreground) / 0.4)";
    return "hsl(var(--muted-foreground))";
  };

  const getPath = () => {
    if (isFirst && isLast) {
      return "M 4,0 Q 0,0 0,4 L 0,32 Q 0,36 4,36 L 96,36 Q 100,36 100,32 L 100,4 Q 100,0 96,0 Z";
    }
    if (isFirst) {
      return "M 4,0 Q 0,0 0,4 L 0,32 Q 0,36 4,36 L 90,36 L 100,18 L 90,0 Z";
    }
    if (isLast) {
      return "M 0,0 L 96,0 Q 100,0 100,4 L 100,32 Q 100,36 96,36 L 0,36 L 10,18 Z";
    }
    return "M 0,0 L 90,0 L 100,18 L 90,36 L 0,36 L 10,18 Z";
  };

  const path = getPath();

  return (
    <button
      onClick={status === "comingSoon" ? undefined : onClick}
      className={cn(
        "relative w-full flex items-center justify-center group focus:outline-none px-2",
        status === "comingSoon" && "cursor-default"
      )}
      style={{ height }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 36"
        style={{ overflow: "visible" }}
      >
        <path
          d={path}
          fill={getBgColor()}
          className="transition-all duration-200"
        />
        {/* Subtle border — dashed for optional steps */}
        <path
          d={path}
          fill="none"
          stroke={isActive ? "rgb(var(--theme-600))" : (status === "locked" || status === "comingSoon") ? "hsl(var(--border) / 0.5)" : "hsl(var(--border))"}
          strokeWidth="0.5"
          strokeDasharray={(isOptional && !isActive && status !== "completed") || status === "comingSoon" ? "3 2" : undefined}
          className="transition-all duration-200"
        />
      </svg>
      <div
        className={cn(
          "relative z-10 flex items-center gap-1.5 px-4 text-sm font-medium transition-colors duration-200"
        )}
        style={{
          color: getTextColor(),
          paddingLeft: isFirst ? "12px" : "16px",
          paddingRight: isLast ? "12px" : "8px",
        }}
      >
        {children}
      </div>
    </button>
  );
}

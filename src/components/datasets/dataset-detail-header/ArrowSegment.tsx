/**
 * ArrowSegment
 *
 * SVG-based arrow/chevron segment for stepper navigation.
 * Used in SectionTabs for workflow step visualization.
 */

export type ArrowSegmentStatus = "completed" | "active" | "pending";

interface ArrowSegmentProps {
  children: React.ReactNode;
  isFirst: boolean;
  isLast: boolean;
  status: ArrowSegmentStatus;
  isActive: boolean;
  onClick: () => void;
}

export function ArrowSegment({
  children,
  isFirst,
  isLast,
  status,
  isActive,
  onClick,
}: ArrowSegmentProps) {
  const height = 36;

  const getBgColor = () => {
    if (isActive) return "rgb(var(--theme-500))";
    if (status === "completed") return "rgba(var(--theme-500), 0.12)";
    return "hsl(var(--muted))";
  };

  const getTextColor = () => {
    if (isActive) return "white";
    if (status === "completed") return "rgb(var(--theme-600))";
    return "hsl(var(--muted-foreground))";
  };

  const getPath = () => {
    if (isFirst && isLast) {
      return "M 4,0 L 90,0 L 100,18 L 90,36 L 4,36 L 4,0 Z";
    }
    if (isFirst) {
      return "M 4,0 L 90,0 L 100,18 L 90,36 L 4,36 L 4,0 Z";
    }
    if (isLast) {
      return "M 0,0 L 90,0 L 96,0 L 96,36 L 90,36 L 0,36 L 10,18 Z";
    }
    return "M 0,0 L 90,0 L 100,18 L 90,36 L 0,36 L 10,18 Z";
  };

  const path = getPath();

  return (
    <button
      onClick={onClick}
      className="relative flex-1 flex items-center justify-center group focus:outline-none px-2"
      style={{ height }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 36"
        style={{ overflow: "visible" }}
      >
        <defs>
          <clipPath id={`arrow-clip-${isFirst}-${isLast}`}>
            <path d={path} />
          </clipPath>
        </defs>
        <path
          d={path}
          fill={getBgColor()}
          className="transition-all duration-200"
        />
        {/* Subtle border */}
        <path
          d={path}
          fill="none"
          stroke={isActive ? "rgb(var(--theme-600))" : "hsl(var(--border))"}
          strokeWidth="0.5"
          className="transition-all duration-200"
        />
      </svg>
      <div
        className="relative z-10 flex items-center gap-1.5 px-4 text-sm font-medium transition-colors duration-200"
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

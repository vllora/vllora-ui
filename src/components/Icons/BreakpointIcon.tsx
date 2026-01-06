import { cn } from "@/lib/utils";

interface BreakpointIconProps {
  className?: string;
  size?: number;
}

export function BreakpointIcon({ className, size = 16 }: BreakpointIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
    >
      <path
        d="M1.5 2.5C1.5 1.94772 1.94772 1.5 2.5 1.5H10L14 8L10 14.5H2.5C1.94772 14.5 1.5 14.0523 1.5 13.5V2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="8" r="2.5" fill="#EF4444" />
    </svg>
  );
}

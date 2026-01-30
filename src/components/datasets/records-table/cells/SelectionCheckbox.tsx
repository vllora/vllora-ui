/**
 * SelectionCheckbox
 *
 * A styled checkbox for row selection with theme-colored checked state.
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectionCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function SelectionCheckbox({ checked, onChange, className }: SelectionCheckboxProps) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <div
        className={cn(
          "h-4 w-4 rounded flex items-center justify-center cursor-pointer transition-all duration-150",
          "border",
          checked
            ? "bg-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]"
            : "bg-transparent border-muted-foreground/50 hover:border-muted-foreground"
        )}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </div>
    </div>
  );
}

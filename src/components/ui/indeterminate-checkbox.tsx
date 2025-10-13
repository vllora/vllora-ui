"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

export interface IndeterminateCheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'checked'> {
  indeterminate?: boolean;
  checked?: boolean;
  checkboxSizeClass?: string;
  iconSizeClass?: string;
  indeterminateColor?: string;
  checkedColor?: string;
  iconColorClass?: string;
}

const IndeterminateCheckbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  IndeterminateCheckboxProps
>(({ className, indeterminate, checked, checkboxSizeClass, iconSizeClass, indeterminateColor, checkedColor, iconColorClass, ...props }, ref) => {
  // For visual representation of the three states
  const renderIcon = (iconSizeClass?: string) => {
    if (indeterminate) {
      return <Minus strokeWidth={3} className={iconSizeClass || 'h-3 w-3'} />;
    }
    if (checked) {
      return <Check strokeWidth={3} className={iconSizeClass || 'h-3 w-3'} />;
    }
    return null;
  };

  // We're using a custom wrapper to handle the indeterminate state
  return (
    <div className={cn(
      "relative inline-flex items-center justify-center",
      className
    )}>
      {/* Base checkbox */}
      <CheckboxPrimitive.Root
        ref={ref}
        checked={indeterminate ? true : checked}
        className={cn(
          "peer shrink-0 rounded-sm border border-border shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          checkboxSizeClass || 'h-5 w-5',
          indeterminate ? (indeterminateColor || "bg-indigo-600/70") : checked ? (checkedColor || "bg-indigo-600") : "bg-transparent",
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator
          className={cn("flex items-center justify-center text-white", iconColorClass)}
        >
          {renderIcon(iconSizeClass)}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    </div>
  )
})
IndeterminateCheckbox.displayName = "IndeterminateCheckbox"

export { IndeterminateCheckbox }



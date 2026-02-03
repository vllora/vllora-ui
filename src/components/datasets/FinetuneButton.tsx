/**
 * FinetuneButton
 *
 * Primary action button for starting the finetune workflow. Features a distinctive
 * design to highlight its importance as the main action in the dataset detail view.
 * The primary variant uses a gradient background with a subtle glow effect to stand out.
 */

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FinetuneButtonProps {
  /** Called when button is clicked */
  onFinetune?: () => void;
  /** Whether finetune is in progress */
  isFinetuning?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button variant - primary uses gradient with glow, outline uses bordered style */
  variant?: "primary" | "outline" | "ghost";
  /** Additional class names */
  className?: string;
  /** Custom tooltip text */
  tooltipText?: string;
  /** Show tooltip */
  showTooltip?: boolean;
}

export function FinetuneButton({
  onFinetune,
  isFinetuning = false,
  disabled = false,
  variant = "primary",
  className = "",
  tooltipText = "Start finetune workflow",
  showTooltip = true,
}: FinetuneButtonProps) {
  const isDisabled = disabled || isFinetuning;

  const getButtonStyles = () => {
    const baseStyles = "h-8 px-3 gap-2 font-medium transition-all duration-200";

    if (variant === "primary") {
      return cn(
        baseStyles,
        isDisabled
          ? "bg-muted text-muted-foreground shadow-none"
          : [
              // Solid theme color background
              "bg-[rgb(var(--theme-500))]",
              "text-white",
              // Glow effect using theme color
              "shadow-[0_2px_12px_rgb(var(--theme-500)/0.35)]",
              // Hover state
              "hover:bg-[rgb(var(--theme-600))]",
              "hover:shadow-[0_4px_16px_rgb(var(--theme-500)/0.45)]",
              "hover:scale-[1.02]",
              // Active state
              "active:scale-[0.98]",
            ]
      );
    }
    if (variant === "outline") {
      return cn(
        baseStyles,
        isDisabled
          ? "text-muted-foreground border-muted"
          : [
              "text-[rgb(var(--theme-500))]",
              "border-[rgb(var(--theme-500))]/40",
              "hover:bg-[rgb(var(--theme-500))]/10",
              "hover:border-[rgb(var(--theme-500))]/60",
            ]
      );
    }
    // ghost
    return cn(
      baseStyles,
      isDisabled
        ? "text-muted-foreground/50"
        : "text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500))]/10"
    );
  };

  const buttonContent = (
    <Button
      variant={variant === "primary" ? "default" : variant}
      size="sm"
      className={cn(getButtonStyles(), className)}
      onClick={onFinetune}
      disabled={isDisabled}
    >
      {isFinetuning ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Starting...</span>
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" />
        </>
      )}
    </Button>
  );

  if (!showTooltip) {
    return buttonContent;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {isDisabled ? <span>{buttonContent}</span> : buttonContent}
        </TooltipTrigger>
        <TooltipContent>
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

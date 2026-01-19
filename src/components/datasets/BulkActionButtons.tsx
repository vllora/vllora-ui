/**
 * BulkActionButtons
 *
 * Bulk action buttons for records (assign topic, generate, evaluate, delete).
 */

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tag, Scale, Trash2, Shuffle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkActionButtonsProps {
  /** Whether any records are selected */
  hasSelection: boolean;
  /** Assign topic to selected records */
  onAssignTopic?: () => void;
  /** Generate synthetic traces */
  onGenerateTraces?: () => void;
  /** Flag when traces are being generated */
  isGeneratingTraces?: boolean;
  /** Current count of generated records (null when not generating) */
  generationProgress?: number | null;
  /** Run evaluation on selected records */
  onRunEvaluation?: () => void;
  /** Delete selected records */
  onDeleteSelected?: () => void;
}

type ButtonVariant = "primary" | "outline" | "danger";

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  disabledTooltip: string;
  disabled: boolean;
  requiresSelection: boolean;
  hasSelection: boolean;
  variant?: ButtonVariant;
  onClick?: () => void;
}

function ActionButton({
  icon,
  label,
  tooltip,
  disabledTooltip,
  disabled,
  requiresSelection,
  hasSelection,
  variant = "primary",
  onClick,
}: ActionButtonProps) {
  const isDisabled = disabled || (requiresSelection && !hasSelection);
  const currentTooltip = isDisabled && requiresSelection && !hasSelection
    ? disabledTooltip
    : tooltip;

  const getButtonStyles = () => {
    if (variant === "danger") {
      return cn(
        "gap-1.5 h-8 px-3",
        isDisabled
          ? "text-muted-foreground/50"
          : "text-red-500 hover:bg-red-500/10"
      );
    }
    if (variant === "outline") {
      return cn(
        "gap-2",
        isDisabled
          ? "text-muted-foreground"
          : "text-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]/30 hover:bg-[rgb(var(--theme-500))]/10"
      );
    }
    // primary
    return cn(
      "gap-1.5 h-8 px-3",
      isDisabled
        ? "text-muted-foreground/50"
        : "text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500))]/10"
    );
  };

  const buttonContent = (
    <Button
      variant={variant === "outline" ? "outline" : "ghost"}
      size="sm"
      className={getButtonStyles()}
      disabled={isDisabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {isDisabled ? <span>{buttonContent}</span> : buttonContent}
        </TooltipTrigger>
        <TooltipContent>
          <p>{currentTooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BulkActionButtons({
  hasSelection,
  onAssignTopic,
  onGenerateTraces,
  isGeneratingTraces,
  generationProgress,
  onRunEvaluation,
  onDeleteSelected,
}: BulkActionButtonsProps) {
  // Build the label for the generate button
  const getGenerateLabel = () => {
    if (!isGeneratingTraces) return "Generate Data";
    if (generationProgress !== null && generationProgress !== undefined && generationProgress > 0) {
      return `Generating... (${generationProgress})`;
    }
    return "Generating...";
  };

  return (
    <div className="flex items-center gap-1">
      <ActionButton
        icon={<Tag className="w-3.5 h-3.5" />}
        label="Assign Topic"
        tooltip="Assign topic to selected records"
        disabledTooltip="Select records to assign topic"
        disabled={false}
        requiresSelection={true}
        hasSelection={hasSelection}
        onClick={onAssignTopic}
      />
      <ActionButton
        icon={isGeneratingTraces ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
        label={getGenerateLabel()}
        tooltip="Generate sample data"
        disabledTooltip="Generate sample data"
        disabled={!!isGeneratingTraces}
        requiresSelection={false}
        hasSelection={hasSelection}
        onClick={onGenerateTraces}
      />
      <ActionButton
        icon={<Scale className="w-3.5 h-3.5" />}
        label="Evaluate"
        tooltip="Run evaluation on selected records"
        disabledTooltip="Select records to run evaluation"
        disabled={false}
        requiresSelection={true}
        hasSelection={hasSelection}
        onClick={onRunEvaluation}
      />
      <ActionButton
        icon={<Trash2 className="w-3.5 h-3.5" />}
        label="Delete"
        tooltip="Delete selected records"
        disabledTooltip="Select records to delete"
        disabled={false}
        requiresSelection={true}
        hasSelection={hasSelection}
        variant="danger"
        onClick={onDeleteSelected}
      />
    </div>
  );
}

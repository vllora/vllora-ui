/**
 * StartFinetuneButton
 *
 * Shared "Start Finetune" button used by both the objective tab
 * and the API initialize tab. Single source of truth for styling.
 *
 * Muted solid style: lower-opacity theme fill with white text,
 * no heavy shadow. Distinct from suggestion chips.
 */

import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StartFinetuneButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function StartFinetuneButton({
  onClick,
  disabled = false,
  isLoading = false,
}: StartFinetuneButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || isLoading}
      className="group/btn bg-[rgba(var(--theme-500),0.7)] hover:bg-[rgba(var(--theme-500),0.85)] text-white gap-2 px-6 h-10 rounded-xl text-[13px] font-semibold shadow-sm hover:shadow-[0_0_24px_rgba(var(--theme-500),0.2)] transition-all duration-200 disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Creating...
        </>
      ) : (
        <>
          Start Finetune
          <Sparkles className="w-3.5 h-3.5 transition-transform duration-200 group-hover/btn:rotate-12" />
        </>
      )}
    </Button>
  );
}

/**
 * FinetuneHero
 *
 * Shared heading + subtitle used on both the homepage and /finetune/new.
 * Single source of truth for the finetune studio slogan.
 */

import { cn } from "@/lib/utils";

interface FinetuneHeroProps {
  className?: string;
}

export function FinetuneHero({ className }: FinetuneHeroProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <h1 className="text-[2.25rem] leading-[1.15] font-bold tracking-tight text-foreground mb-4">
        From idea to{" "}
        <span className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent">
          finetuned model
        </span>
      </h1>
      <p className="text-[15px] text-muted-foreground/60">
        Use the finetune skill with Claude Code or Codex to prepare training data.
        <br />
        Visualize, evaluate, and train — all from here.
      </p>
    </div>
  );
}

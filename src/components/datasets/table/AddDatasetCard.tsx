/**
 * AddDatasetCard
 *
 * A card to add a new dataset in grid view, matching the redesigned card style.
 */

import { Link } from "react-router";
import { Plus, Sparkles } from "lucide-react";

export function AddDatasetCard() {
  return (
    <Link
      to="/finetune/new"
      className="group relative rounded-xl transition-all duration-200 overflow-hidden border border-dashed border-border/40 hover:border-border bg-gradient-to-b from-card/50 to-transparent hover:shadow-[0_4px_24px_-4px_rgba(var(--theme-500),0.15)] hover:-translate-y-0.5"
    >
      <div className="h-0.5 w-full bg-transparent" />
      <div className="p-4 flex flex-col items-center justify-center min-h-[160px]">
        <div className="w-10 h-10 rounded-xl bg-muted/50 group-hover:bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center mb-3 transition-colors">
          <Plus className="w-5 h-5 text-muted-foreground group-hover:text-[rgb(var(--theme-500))] transition-colors" />
        </div>
        <p className="font-semibold text-sm text-foreground mb-1">New Workflow</p>
        <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          AI-assisted setup
        </p>
      </div>
    </Link>
  );
}

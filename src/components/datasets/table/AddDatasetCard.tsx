/**
 * AddDatasetCard
 *
 * A card with dashed border to add a new dataset in grid view.
 */

import { Link } from "react-router";
import { Plus } from "lucide-react";

export function AddDatasetCard() {
  return (
    <Link
      to="/datasets/new"
      className="border-2 border-dashed border-border/60 rounded-lg hover:border-[rgb(var(--theme-500))] transition-colors flex flex-col items-center justify-center p-4 group"
    >
      <div className="p-2 rounded-lg bg-muted/30 group-hover:bg-[rgb(var(--theme-500))]/15 transition-colors mb-2">
        <Plus className="w-5 h-5 text-muted-foreground group-hover:text-[rgb(var(--theme-500))] transition-colors" />
      </div>
      <p className="font-semibold text-foreground text-sm">New Dataset</p>
      <p className="text-xs text-muted-foreground/70 mt-0.5 text-center">
        Import traces or upload file
      </p>
    </Link>
  );
}

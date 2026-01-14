/**
 * DatasetsEmptyState
 *
 * Empty state displayed when no datasets exist.
 */

import { Database } from "lucide-react";

export function DatasetsEmptyState() {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-lg">No datasets yet</p>
      <p className="text-sm mt-1">Select spans from traces and add them to a dataset</p>
      <p className="text-sm mt-2 text-[rgb(var(--theme-500))]">
        Ask Lucy to help you get started!
      </p>
    </div>
  );
}

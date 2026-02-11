/**
 * DatasetsEmptyState
 *
 * Empty state displayed when no datasets exist in the table view.
 */

import { Database, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyStateTemplate } from "../EmptyStateTemplate";

export function DatasetsEmptyState() {
  return (
    <EmptyStateTemplate
      icon={Database}
      heading="No datasets yet"
      description="Create your first dataset to start preparing training data for fine-tuning."
      action={
        <Button asChild className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white">
          <Link to="/datasets/new">
            <Plus className="w-4 h-4" />
            Create Dataset
          </Link>
        </Button>
      }
    />
  );
}

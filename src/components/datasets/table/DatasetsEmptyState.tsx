/**
 * DatasetsEmptyState
 *
 * Empty state displayed when no datasets exist.
 */

import { Database, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function DatasetsEmptyState() {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-lg mb-4">No datasets yet</p>
      <Button asChild>
        <Link to="/datasets/new">
          <Plus className="w-4 h-4 mr-2" />
          Create Dataset
        </Link>
      </Button>
    </div>
  );
}

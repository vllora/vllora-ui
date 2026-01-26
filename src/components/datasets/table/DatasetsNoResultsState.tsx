/**
 * DatasetsNoResultsState
 *
 * Empty state displayed when search query doesn't match any datasets.
 */

import { Search } from "lucide-react";

interface DatasetsNoResultsStateProps {
  searchQuery: string;
}

export function DatasetsNoResultsState({ searchQuery }: DatasetsNoResultsStateProps) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-lg">No datasets match "{searchQuery}"</p>
      <p className="text-sm mt-1">Try a different search term</p>
    </div>
  );
}

/**
 * DatasetsListHeader
 *
 * Header for the datasets list view with title, search, and actions.
 */

import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Database, Search, Upload, Plus } from "lucide-react";
import { CreateDatasetPopover } from "./CreateDatasetPopover";

interface DatasetsListHeaderProps {
  searchQuery: string;
  datasetCount: number;
  onSearchChange: (query: string) => void;
  onImportClick: () => void;
  onCreateDataset: (name: string) => Promise<void>;
}

export function DatasetsListHeader({
  searchQuery,
  datasetCount,
  onSearchChange,
  onImportClick,
  onCreateDataset,
}: DatasetsListHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[rgb(var(--theme-500))]/10">
          <Database className="w-6 h-6 text-[rgb(var(--theme-500))]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Datasets</h1>
          <p className="text-sm text-muted-foreground">
            {datasetCount} {datasetCount === 1 ? "dataset" : "datasets"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search datasets..."
            className="pl-9 w-56 bg-muted/50 border-border/50"
          />
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onImportClick}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <Upload className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import data</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <CreateDatasetPopover onCreateDataset={onCreateDataset} />
        <Button asChild size="sm" className="gap-2">
          <Link to="/datasets/new">
            <Plus className="w-4 h-4" />
            Create from Traces
          </Link>
        </Button>
      </div>
    </div>
  );
}

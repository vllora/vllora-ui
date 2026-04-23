/**
 * DatasetSortDropdown
 *
 * Compact sort dropdown for the datasets grid header.
 */

import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type DatasetSortKey = "updated" | "created" | "name" | "records";
export type DatasetSortDir = "asc" | "desc";

export interface DatasetSort {
  key: DatasetSortKey;
  dir: DatasetSortDir;
}

const SORT_OPTIONS: { key: DatasetSortKey; dir: DatasetSortDir; label: string }[] = [
  { key: "updated", dir: "desc", label: "Last updated" },
  { key: "updated", dir: "asc", label: "Oldest updated" },
  { key: "created", dir: "desc", label: "Newest created" },
  { key: "created", dir: "asc", label: "Oldest created" },
  { key: "name", dir: "asc", label: "Name A\u2013Z" },
  { key: "name", dir: "desc", label: "Name Z\u2013A" },
  { key: "records", dir: "desc", label: "Most records" },
  { key: "records", dir: "asc", label: "Fewest records" },
];

interface DatasetSortDropdownProps {
  activeSort: DatasetSort;
  onSortChange: (sort: DatasetSort) => void;
}

function getSortLabel(sort: DatasetSort): string {
  const match = SORT_OPTIONS.find((o) => o.key === sort.key && o.dir === sort.dir);
  return match?.label ?? "Last updated";
}

export function DatasetSortDropdown({ activeSort, onSortChange }: DatasetSortDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowUpDown className="w-3 h-3" />
          {getSortLabel(activeSort)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={`${option.key}-${option.dir}`}
            onClick={() => onSortChange({ key: option.key, dir: option.dir })}
            className={cn(
              "text-xs",
              activeSort.key === option.key && activeSort.dir === option.dir &&
                "text-foreground font-medium"
            )}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

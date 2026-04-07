/**
 * TraceFilterBar
 *
 * Persistent filter strip for the trace list. We follow the Langfuse model
 * where the filter bar IS the selection — no checkbox state to manage.
 * Whatever the user can see in the table is what they hand off as a finetune
 * input.
 */

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, Wrench, AlertCircle } from 'lucide-react';
import { OtelTracesConsumer } from '@/contexts/OtelTracesContext';

const ANY_VALUE = '__any__';

export function OtelTraceFilterBar() {
  const { filters, availableModels, patchFilters, clearFilters } = OtelTracesConsumer();

  const hasAnyFilter =
    Boolean(filters.search) ||
    Boolean(filters.model) ||
    Boolean(filters.hasToolCalls) ||
    Boolean(filters.hasError) ||
    filters.minTurns !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search ?? ''}
          onChange={(e) => patchFilters({ search: e.target.value || undefined })}
          placeholder="Search prompts and completions…"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.model ?? ANY_VALUE}
        onValueChange={(v) => patchFilters({ model: v === ANY_VALUE ? undefined : v })}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Any model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>Any model</SelectItem>
          {availableModels.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleChip
        active={Boolean(filters.hasToolCalls)}
        icon={<Wrench className="h-3.5 w-3.5" />}
        label="Has tool calls"
        onClick={() => patchFilters({ hasToolCalls: filters.hasToolCalls ? undefined : true })}
      />

      <ToggleChip
        active={Boolean(filters.hasError)}
        icon={<AlertCircle className="h-3.5 w-3.5" />}
        label="Errored"
        onClick={() => patchFilters({ hasError: filters.hasError ? undefined : true })}
      />

      <Select
        value={filters.minTurns !== undefined ? String(filters.minTurns) : ANY_VALUE}
        onValueChange={(v) =>
          patchFilters({ minTurns: v === ANY_VALUE ? undefined : Number(v) })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Min turns" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>Any turns</SelectItem>
          <SelectItem value="1">≥ 1 turn</SelectItem>
          <SelectItem value="2">≥ 2 turns</SelectItem>
          <SelectItem value="3">≥ 3 turns</SelectItem>
        </SelectContent>
      </Select>

      {hasAnyFilter && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}

interface ToggleChipProps {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}

function ToggleChip({ active, icon, label, onClick }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <Badge
        variant={active ? 'default' : 'outline'}
        className="cursor-pointer gap-1.5 px-3 py-1"
      >
        {icon}
        {label}
      </Badge>
    </button>
  );
}

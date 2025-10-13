import React, { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedEventTypes: string[];
  onEventTypesChange: (types: string[]) => void;
  threadId?: string;
  onThreadIdChange: (threadId: string) => void;
  runId?: string;
  onRunIdChange: (runId: string) => void;
}

// All available event types
const EVENT_TYPES = [
  'RunStarted',
  'RunFinished',
  'RunError',
  'StepStarted',
  'StepFinished',
  'TextMessageStart',
  'TextMessageContent',
  'TextMessageEnd',
  'ToolCallStart',
  'ToolCallArgs',
  'ToolCallEnd',
  'ToolCallResult',
  'StateSnapshot',
  'StateDelta',
  'MessagesSnapshot',
  'Custom',
  'Raw',
];

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedEventTypes,
  onEventTypesChange,
  threadId,
  onThreadIdChange,
  runId,
  onRunIdChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleEventType = (type: string) => {
    if (selectedEventTypes.includes(type)) {
      onEventTypesChange(selectedEventTypes.filter((t) => t !== type));
    } else {
      onEventTypesChange([...selectedEventTypes, type]);
    }
  };

  const clearAllFilters = () => {
    onSearchChange('');
    onEventTypesChange([]);
    onThreadIdChange('');
    onRunIdChange('');
    setShowAdvanced(false);
  };

  const hasActiveFilters =
    searchQuery || selectedEventTypes.length > 0 || threadId || runId;

  return (
    <div className="border-b border-border bg-background">
      <div className="p-3 space-y-3">
        {/* Main filter row */}
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Event Type Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="w-4 h-4 mr-2" />
                Event Types
                {selectedEventTypes.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-primary text-primary-foreground rounded text-xs">
                    {selectedEventTypes.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-96 overflow-y-auto">
              <DropdownMenuLabel>Event Types</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedEventTypes.length === 0}
                onCheckedChange={() => onEventTypesChange([])}
              >
                All Types
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {EVENT_TYPES.map((type) => (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={selectedEventTypes.includes(type)}
                  onCheckedChange={() => toggleEventType(type)}
                >
                  {type}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Advanced Filters Toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced
          </Button>

          {/* Clear All Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={clearAllFilters}
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Thread ID
              </label>
              <Input
                placeholder="Filter by thread ID..."
                value={threadId || ''}
                onChange={(e) => onThreadIdChange(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Run ID
              </label>
              <Input
                placeholder="Filter by run ID..."
                value={runId || ''}
                onChange={(e) => onRunIdChange(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

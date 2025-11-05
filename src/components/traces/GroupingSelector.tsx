import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GroupByMode, Duration } from "@/contexts/TracesPageContext";

interface GroupingSelectorProps {
  groupByMode: GroupByMode;
  onGroupByModeChange: (mode: GroupByMode) => void;
  duration: Duration;
  onDurationChange: (size: Duration) => void;
}

const BUCKET_OPTIONS = [
  { value: 300, label: '5min' },
  { value: 900, label: '15min' },
  { value: 3600, label: '1hr' },
  { value: 10800, label: '3hr' },
  { value: 86400, label: '1day' },
];

export function GroupingSelector({
  groupByMode,
  onGroupByModeChange,
  duration,
  onDurationChange,
}: GroupingSelectorProps) {
  const handleModeChange = (value: string) => {
    if (!value) return;
    onGroupByModeChange(value as GroupByMode);
  };

  const handleDurationChange = (value: string) => {
    if (!value) return;
    onDurationChange(Number(value) as Duration);
  };

  return (
    <div className="flex flex-1 justify-between items-center gap-6">
      {/* View Mode Section */}
      <div className="inline-flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">View:</span>

        <ToggleGroup
          type="single"
          value={groupByMode}
          onValueChange={handleModeChange}
          className="inline-flex items-center gap-1 bg-[#151515] rounded-lg border border-border p-1 shadow-sm"
        >
          <ToggleGroupItem
            value="run"
            aria-label="Group by run"
            className="px-3 py-0.5 text-xs h-6 font-medium rounded-md data-[state=on]:bg-[rgb(var(--theme-500))] data-[state=on]:text-white data-[state=on]:shadow-md data-[state=on]:shadow-[rgb(var(--theme-500))]/20 data-[state=off]:text-muted-foreground data-[state=off]:hover:text-foreground data-[state=off]:hover:bg-muted/20"
          >
            Run
          </ToggleGroupItem>
          <ToggleGroupItem
            value="time"
            aria-label="Group by time"
            className="px-3 py-0.5 text-xs h-6 font-medium rounded-md data-[state=on]:bg-[rgb(var(--theme-500))] data-[state=on]:text-white data-[state=on]:shadow-md data-[state=on]:shadow-[rgb(var(--theme-500))]/20 data-[state=off]:text-muted-foreground data-[state=off]:hover:text-foreground data-[state=off]:hover:bg-muted/20"
          >
            Time
          </ToggleGroupItem>
          <ToggleGroupItem
            value="thread"
            aria-label="Group by thread"
            className="px-3 py-0.5 text-xs h-6 font-medium rounded-md data-[state=on]:bg-[rgb(var(--theme-500))] data-[state=on]:text-white data-[state=on]:shadow-md data-[state=on]:shadow-[rgb(var(--theme-500))]/20 data-[state=off]:text-muted-foreground data-[state=off]:hover:text-foreground data-[state=off]:hover:bg-muted/20"
          >
            Thread
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Duration Section - Only show when time mode is selected */}
      {groupByMode === 'time' && (
        <div className="inline-flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Duration:</span>
          <ToggleGroup
            type="single"
            value={String(duration)}
            onValueChange={handleDurationChange}
            className="inline-flex items-center gap-1 bg-[#151515] rounded-lg p-1 border border-border/30 shadow-sm"
          >
            {BUCKET_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={String(option.value)}
                aria-label={`Bucket size ${option.label}`}
                className="px-4 py-0.5 text-xs h-6 font-medium rounded-md data-[state=on]:bg-[rgb(var(--theme-500))] data-[state=on]:text-white data-[state=on]:shadow-md data-[state=on]:shadow-[rgb(var(--theme-500))]/20 data-[state=off]:text-muted-foreground data-[state=off]:hover:text-foreground data-[state=off]:hover:bg-muted/20"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </div>
  );
}

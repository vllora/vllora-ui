import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GroupByMode, BucketSize } from "@/contexts/TracesPageContext";

interface GroupingSelectorProps {
  groupByMode: GroupByMode;
  onGroupByModeChange: (mode: GroupByMode) => void;
  bucketSize: BucketSize;
  onBucketSizeChange: (size: BucketSize) => void;
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
  bucketSize,
  onBucketSizeChange,
}: GroupingSelectorProps) {
  const handleModeChange = (value: string) => {
    if (!value) return;
    onGroupByModeChange(value as GroupByMode);
  };

  const handleBucketSizeChange = (value: string) => {
    if (!value) return;
    onBucketSizeChange(Number(value) as BucketSize);
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
            value="bucket"
            aria-label="Group by time bucket"
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

      {/* Bucket Size Section - Only show when bucket mode is selected */}
      {groupByMode === 'bucket' && (
        <div className="inline-flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Duration:</span>
          <ToggleGroup
            type="single"
            value={String(bucketSize)}
            onValueChange={handleBucketSizeChange}
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

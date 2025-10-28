import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GroupByMode, BucketSize } from "@/contexts/TracesPageContext";

interface GroupingSelectorProps {
  groupByMode: GroupByMode;
  onGroupByModeChange: (mode: GroupByMode) => void;
  bucketSize: BucketSize;
  onBucketSizeChange: (size: BucketSize) => void;
}

const BUCKET_OPTIONS = [
  { value: '300', label: '5m' },
  { value: '600', label: '10m' },
  { value: '1200', label: '20m' },
  { value: '1800', label: '30m' },
  { value: '3600', label: '1h' },
  { value: '7200', label: '2h' },
  { value: '10800', label: '3h' },
  { value: '21600', label: '6h' },
  { value: '43200', label: '12h' },
  { value: '86400', label: '24h' },
];

export function GroupingSelector({
  groupByMode,
  onGroupByModeChange,
  bucketSize,
  onBucketSizeChange,
}: GroupingSelectorProps) {
  // Convert current state to a single value
  const currentValue = groupByMode === 'run' ? 'run' : String(bucketSize);

  const handleValueChange = (value: string) => {
    if (!value) return; // Prevent unselecting

    if (value === 'run') {
      onGroupByModeChange('run');
    } else {
      onGroupByModeChange('bucket');
      onBucketSizeChange(Number(value) as BucketSize);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Group by:</span>
      <ToggleGroup
        type="single"
        value={currentValue}
        onValueChange={handleValueChange}
        className="inline-flex items-center gap-1 bg-[#151515] rounded-lg p-1 border border-border/30 shadow-sm"
      >
        <ToggleGroupItem
          value="run"
          aria-label="Group by run"
          className="px-3 py-0.5 text-xs h-6 font-medium rounded-md data-[state=on]:bg-[rgb(var(--theme-500))] data-[state=on]:text-white data-[state=on]:shadow-md data-[state=on]:shadow-[rgb(var(--theme-500))]/20 data-[state=off]:text-muted-foreground data-[state=off]:hover:text-foreground data-[state=off]:hover:bg-muted/20"
        >
          Run
        </ToggleGroupItem>
        {BUCKET_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`Group by ${option.label}`}
            className="px-3 py-0.5 text-xs h-6 font-medium rounded-md data-[state=on]:bg-[rgb(var(--theme-500))] data-[state=on]:text-white data-[state=on]:shadow-md data-[state=on]:shadow-[rgb(var(--theme-500))]/20 data-[state=off]:text-muted-foreground data-[state=off]:hover:text-foreground data-[state=off]:hover:bg-muted/20"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

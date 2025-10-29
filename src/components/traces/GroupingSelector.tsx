import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GroupByMode, BucketSize } from "@/contexts/TracesPageContext";

interface GroupingSelectorProps {
  groupByMode: GroupByMode;
  onGroupByModeChange: (mode: GroupByMode) => void;
  bucketSize: BucketSize;
  onBucketSizeChange: (size: BucketSize) => void;
}

const BUCKET_OPTIONS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1200, label: '20 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 7200, label: '2 hours' },
  { value: 10800, label: '3 hours' },
  { value: 21600, label: '6 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '24 hours' },
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
    onBucketSizeChange(Number(value) as BucketSize);
  };

  return (
    <div className="inline-flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground">Group by:</span>

      {/* Mode Toggle: Run vs Bucket */}
      <ToggleGroup
        type="single"
        value={groupByMode}
        onValueChange={handleModeChange}
        className="inline-flex items-center gap-1 bg-[#151515] rounded-lg p-1 border border-border/30 shadow-sm"
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
          Bucket
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Bucket Size Dropdown: Only show when bucket mode is selected */}
      {groupByMode === 'bucket' && (
        <Select value={String(bucketSize)} onValueChange={handleBucketSizeChange}>
          <SelectTrigger className="w-[130px] h-7 text-xs bg-[#151515] border-border/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUCKET_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

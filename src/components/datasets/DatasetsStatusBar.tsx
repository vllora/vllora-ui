/**
 * DatasetsStatusBar
 *
 * Footer status bar showing dataset statistics.
 */

interface DatasetsStatusBarProps {
  datasetCount: number;
  totalRecords: number;
}

export function DatasetsStatusBar({ datasetCount, totalRecords }: DatasetsStatusBarProps) {
  const formatRecordCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div className="border-t border-border px-6 py-2.5 flex items-center justify-center gap-4 text-xs text-muted-foreground bg-background/50 shrink-0">
      <span>
        <span className="text-foreground font-medium">{datasetCount}</span>{" "}
        {datasetCount === 1 ? "dataset" : "datasets"}
      </span>
      <span className="text-border">•</span>
      <span>
        <span className="text-foreground font-medium">
          {formatRecordCount(totalRecords)}
        </span>{" "}
        {totalRecords === 1 ? "record" : "records"}
      </span>
    </div>
  );
}

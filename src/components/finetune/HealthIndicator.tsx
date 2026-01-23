import { useFinetuneContext } from './FinetuneContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

export function HealthIndicator() {
  const { currentDataset, openRecordsOverlay } = useFinetuneContext();

  if (!currentDataset) return null;

  const { validRecordCount, invalidRecordCount } = currentDataset;
  const totalRecords = validRecordCount + invalidRecordCount;
  const invalidPercentage = totalRecords > 0 ? Math.round((invalidRecordCount / totalRecords) * 100) : 0;

  // Determine state
  const isValidating = false; // Could be dynamic based on actual validation state
  const hasHighInvalidRate = invalidPercentage > 20;
  const hasInvalidRecords = invalidRecordCount > 0;

  // Handle view issues click
  const handleViewIssues = () => {
    openRecordsOverlay('invalid');
  };

  if (isValidating) {
    return (
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span>Validating 15 new records...</span>
        </div>
      </div>
    );
  }

  if (!hasInvalidRecords) {
    return (
      <div className="border-b border-zinc-800 bg-green-500/5 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-green-400">
            {validRecordCount.toLocaleString()} valid records
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "border-b px-4 py-2",
      hasHighInvalidRate
        ? "border-yellow-500/30 bg-yellow-500/5"
        : "border-zinc-800 bg-zinc-900/50"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          {/* Valid count */}
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className={cn(
              "w-4 h-4",
              hasHighInvalidRate ? "text-yellow-500" : "text-green-500"
            )} />
            <span className={hasHighInvalidRate ? "text-yellow-400" : "text-green-400"}>
              {validRecordCount.toLocaleString()} valid records
            </span>
          </div>

          {/* Invalid count */}
          <div className="flex items-center gap-1.5">
            {hasHighInvalidRate ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            )}
            <span className={hasHighInvalidRate ? "text-red-400" : "text-yellow-400"}>
              {invalidRecordCount.toLocaleString()} invalid ({invalidPercentage}%)
            </span>
          </div>
        </div>

        {/* View Issues button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewIssues}
          className="text-zinc-400 hover:text-zinc-200 gap-1.5 h-7"
        >
          View Issues
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

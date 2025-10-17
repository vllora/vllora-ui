import { RunDTO } from '@/types/common-type';
import { RunIdCell } from './RunIdCell';
import { ModelsCell } from './ModelsCell';
import { TokensCell } from './TokensCell';
import { CostCell } from './CostCell';
import { TimeCell } from './TimeCell';
import { DurationCell } from './DurationCell';
import { ErrorsCell } from './ErrorsCell';
import { formatTimeForTable, getDuration } from './utils';

interface RunRowProps {
  run: RunDTO;
}

export const RunRow = ({ run }: RunRowProps) => {
  // Convert microseconds to milliseconds
  const startTimeMs = run.start_time_us / 1000;
  const finishTimeMs = run.finish_time_us / 1000;

  // Format times and calculate duration
  const displayStartTime = formatTimeForTable(startTimeMs);
  const displayFinishTime = formatTimeForTable(finishTimeMs);
  const duration = getDuration(startTimeMs, finishTimeMs);

  return (
    <div className="flex items-stretch border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
      <RunIdCell runId={run.run_id || 'N/A'} />
      <ModelsCell models={run.used_models} />
      <TokensCell inputTokens={run.input_tokens} outputTokens={run.output_tokens} />
      <CostCell cost={run.cost} />
      <TimeCell
        displayStartTime={displayStartTime}
        displayFinishTime={displayFinishTime}
        duration={duration}
        combineTimeColumns={false}
      />
      <DurationCell
        duration={duration}
        showDuration={true}
        combineTimeColumns={false}
        displayStartTime={displayStartTime}
        displayFinishTime={displayFinishTime}
      />
      <ErrorsCell errors={run.errors} />
    </div>
  );
};

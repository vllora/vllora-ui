import React from 'react';
import { CurrencyDollarIcon, ClockIcon } from '@heroicons/react/24/outline';
import { formatMiliSecondsToSeconds } from '@/utils/format';
import { Download, Upload } from 'lucide-react';
import { formatCost } from '@/utils/formatCost';

interface ConversationMetricsProps {
  threadId?: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  duration?: number; // in seconds
  avgTTFT?: number; // average time to first token in seconds
}

export const ConversationMetrics: React.FC<ConversationMetricsProps> = ({
  threadId,
  cost,
  inputTokens,
  outputTokens,
  duration,
  avgTTFT,
}) => {

  const displayDuration = duration ? formatMiliSecondsToSeconds(duration) : undefined;
  const ttftDisplay = avgTTFT ? formatMiliSecondsToSeconds(avgTTFT) : undefined;

  return (
    <div className="h-16 px-6 border-b border-border flex items-center justify-between text-xs">
      {threadId && (cost !== undefined || inputTokens !== undefined || outputTokens !== undefined) ? (
        <>
          {/* Cost */}
          {cost !== undefined && (
            <div className="flex items-center">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-500/10 mr-2">
                <CurrencyDollarIcon className="w-3.5 h-3.5 text-teal-500" />
              </div>
              <div>
                <div className="font-semibold text-[10px] text-muted-foreground">Cost</div>
                <div className="tabular-nums text-white font-medium">
                  {formatCost(cost)}
                </div>
              </div>
            </div>
          )}

          {/* Input Tokens */}
          {inputTokens !== undefined && (
            <div className="flex items-center">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 mr-2">
                <Upload className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div>
                <div className="font-semibold text-[10px] text-muted-foreground">Input</div>
                <div className="tabular-nums text-white font-medium">
                  {inputTokens.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Output Tokens */}
          {outputTokens !== undefined && (
            <div className="flex items-center">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/10 mr-2">
                <Download className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <div>
                <div className="font-semibold text-[10px] text-muted-foreground">Output</div>
                <div className="tabular-nums text-white font-medium">
                  {outputTokens.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Duration */}
          {displayDuration && (
            <div className="flex items-center">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10 mr-2">
                <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div>
                <div className="font-semibold text-[10px] text-muted-foreground">Duration</div>
                <div className="tabular-nums text-white font-medium">
                  {displayDuration}
                </div>
              </div>
            </div>
          )}

          {/* Average TTFT */}
          {ttftDisplay && (
            <div className="flex items-center">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/10 mr-2">
                <ClockIcon className="w-3.5 h-3.5 text-green-500" />
              </div>
              <div>
                <div className="font-semibold text-[10px] text-muted-foreground">Avg TTFT</div>
                <div className="tabular-nums text-white font-medium">
                  {ttftDisplay}
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

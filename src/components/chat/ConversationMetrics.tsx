import React from 'react';
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';

interface ConversationMetricsProps {
  threadId?: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export const ConversationMetrics: React.FC<ConversationMetricsProps> = ({
  threadId,
  cost,
  inputTokens,
  outputTokens,
}) => {
  return (
    <div className="h-16 px-4 border-b border-border flex items-center gap-4 text-sm">
      {threadId && (cost !== undefined || inputTokens !== undefined || outputTokens !== undefined) ? (
        <>
          {cost !== undefined && (
            <div className="flex items-center gap-2">
              <CurrencyDollarIcon className="w-4 h-4 text-teal-500" />
              <span className="text-muted-foreground">Cost</span>
              <span className="font-medium text-foreground">
                {cost > 0 && cost < 0.0001 ? '<$0.0001' : `$${cost.toFixed(4)}`}
              </span>
            </div>
          )}
          {inputTokens !== undefined && (
            <div className="flex items-center gap-2">
              <ArrowsPointingInIcon className="w-4 h-4 text-blue-500" />
              <span className="text-muted-foreground">Input</span>
              <span className="font-medium text-foreground">{inputTokens.toLocaleString()} tokens</span>
            </div>
          )}
          {outputTokens !== undefined && (
            <div className="flex items-center gap-2">
              <ArrowsPointingOutIcon className="w-4 h-4 text-purple-500" />
              <span className="text-muted-foreground">Output</span>
              <span className="font-medium text-foreground">{outputTokens.toLocaleString()} tokens</span>
            </div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground text-sm">No metrics available</div>
      )}
    </div>
  );
};

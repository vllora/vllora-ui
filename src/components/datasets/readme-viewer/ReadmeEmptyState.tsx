/**
 * ReadmeEmptyState
 *
 * Empty state shown when no README is generated yet.
 * Prompts the user to generate a README.
 */

import { useState, useCallback } from 'react';
import { FileText, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReadmeEmptyStateProps {
  onRegenerate: () => Promise<void>;
  className?: string;
}

export function ReadmeEmptyState({ onRegenerate, className }: ReadmeEmptyStateProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setIsRegenerating(false);
    }
  }, [onRegenerate]);

  return (
    <div className={cn('flex-1 flex flex-col items-center justify-center p-8', className)}>
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Icon with gradient background */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgba(var(--theme-500),0.15)] to-[rgba(var(--theme-500),0.05)] flex items-center justify-center">
          <FileText className="w-6 h-6 text-[rgb(var(--theme-500))]" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-foreground">
            Dataset README
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            No README generated yet. Add records or configure your dataset
            to automatically generate documentation.
          </p>
        </div>

        {/* CTA */}
        <Button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          {isRegenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate README
            </>
          )}
        </Button>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          README is auto-updated as you add data and configure your dataset
        </p>
      </div>
    </div>
  );
}

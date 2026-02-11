/**
 * ReadmeEmptyState
 *
 * Empty state shown when no README is generated yet.
 * Prompts the user to generate a README.
 */

import { useState, useCallback } from 'react';
import { FileText, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyStateTemplate } from '../EmptyStateTemplate';

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
    <EmptyStateTemplate
      icon={FileText}
      heading="Dataset README"
      description="No README generated yet. Add records or configure your dataset to automatically generate documentation."
      action={
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
      }
      helperText="README is auto-updated as you add data and configure your dataset"
      className={className}
    />
  );
}

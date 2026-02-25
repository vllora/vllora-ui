/**
 * ReadmeEmptyState
 *
 * Empty state shown before the first README sync lands.
 */

import { FileText } from 'lucide-react';
import { EmptyStateTemplate } from '../EmptyStateTemplate';

interface ReadmeEmptyStateProps {
  className?: string;
}

export function ReadmeEmptyState({ className }: ReadmeEmptyStateProps) {
  return (
    <EmptyStateTemplate
      icon={FileText}
      heading="Experiment Overview"
      description="Overview is initialized automatically and updated as your experiment changes."
      helperText="Add records, topics, or evaluator configuration to expand this overview."
      className={className}
    />
  );
}

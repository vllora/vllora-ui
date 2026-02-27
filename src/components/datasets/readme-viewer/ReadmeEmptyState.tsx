/**
 * ReadmeEmptyState
 *
 * Empty state shown when Lucy hasn't written a README yet.
 */

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';
import { EmptyStateTemplate } from '../EmptyStateTemplate';

interface ReadmeEmptyStateProps {
  className?: string;
}

export function ReadmeEmptyState({ className }: ReadmeEmptyStateProps) {
  return (
    <EmptyStateTemplate
      icon={FileText}
      heading="No README yet"
      description="Lucy will write a README as the final step of plan execution, summarizing your dataset's structure, quality, and provenance."
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            emitter.emit('vllora_lucy_prompt', {
              prompt: 'Please write a README for this dataset based on its current state.',
            })
          }
        >
          Ask Lucy to write README
        </Button>
      }
      helperText="Or ask Lucy anytime in chat: &quot;update the readme&quot;"
      className={className}
    />
  );
}

/**
 * SetupPlanEditor
 *
 * Markdown-based setup plan editor for easy modification.
 * Users can edit the plan directly in markdown format.
 */

import { useState, useCallback, useMemo } from 'react';
import { Check, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SetupPlan } from '@/lib/distri-finetune-tools/steps/propose-setup-plan';
import LazyMarkdownRenderer from '@/components/chat/LazyMarkdownRenderer';
import { planToMarkdown, markdownToPlan } from './plan-markdown-utils';
import { PlanHeaderActions } from './PlanHeaderActions';
import { PlanModeToggle } from './PlanModeToggle';

// Re-export for backwards compatibility
export { planToMarkdown } from './plan-markdown-utils';

interface SetupPlanEditorProps {
  plan: SetupPlan;
  onApprove: (plan: SetupPlan) => void;
  onDismiss?: () => void;
}

export function SetupPlanEditor({ plan, onApprove, onDismiss }: SetupPlanEditorProps) {
  const initialMarkdown = useMemo(() => planToMarkdown(plan), [plan]);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [isPreview, setIsPreview] = useState(true);

  const handleApprove = useCallback(() => {
    const updatedPlan = markdownToPlan(markdown, plan);
    onApprove(updatedPlan);
  }, [markdown, plan, onApprove]);

  return (
    <div className="flex flex-col h-full">
      {/* Minimal header with mode toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          <span className="text-xs font-medium">Setup Plan</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy & Export buttons */}
          <PlanHeaderActions markdown={markdown} filename="setup-plan" />

          {/* Mode toggle */}
          <PlanModeToggle isPreview={isPreview} onToggle={setIsPreview} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isPreview ? (
          <div className="p-4 text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
            <LazyMarkdownRenderer content={markdown} />
          </div>
        ) : (
          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="w-full h-full min-h-[400px] border-0 rounded-none resize-none font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 p-4"
            placeholder="Edit the setup plan..."
          />
        )}
      </div>

      {/* Footer - sticky at bottom */}
      <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-end gap-2">
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} className="h-8">
            <X className="w-4 h-4 mr-1" />
            Dismiss
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleApprove}
          className="h-8 gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
        >
          <Check className="w-4 h-4" />
          Approve & Execute
        </Button>
      </div>
    </div>
  );
}

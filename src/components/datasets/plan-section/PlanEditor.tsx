/**
 * PlanEditor
 *
 * Markdown-based plan editor for easy modification.
 * Users can edit the plan directly in markdown format.
 */

import { useState, useCallback, useMemo } from 'react';
import { Check, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Plan } from '@/lib/distri-finetune-tools/steps/propose-plan';
import LazyMarkdownRenderer from '@/components/chat/LazyMarkdownRenderer';
import { markdownToPlan } from './plan-markdown-utils';
import { PlanHeaderActions } from './PlanHeaderActions';
import { PlanModeToggle } from './PlanModeToggle';

interface PlanEditorProps {
  plan: Plan;
  onApprove: (plan: Plan) => void;
  onDismiss?: () => void;
}

export function PlanEditor({ plan, onApprove, onDismiss }: PlanEditorProps) {
  const initialMarkdown = useMemo(() => plan.plan_markdown, [plan]);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [isPreview, setIsPreview] = useState(true);

  const handleApprove = useCallback(() => {
    // Parse structured fields from edited markdown, then persist the raw markdown
    const updatedPlan = markdownToPlan(markdown, plan);
    updatedPlan.plan_markdown = markdown;
    onApprove(updatedPlan);
  }, [markdown, plan, onApprove]);

  return (
    <div className="flex flex-col h-full">
      {/* Minimal header with mode toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          <span className="text-xs font-medium">Plan</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy & Export buttons */}
          <PlanHeaderActions markdown={markdown} filename="plan" />

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
          <div className="flex flex-col h-full">
            {/* Warning banner for edit mode */}
            <div className="mx-4 mt-3 mb-2 flex items-start gap-2 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-amber-600 dark:text-amber-400">
                <span className="font-medium">Editing the raw plan may affect its structure.</span>
                {' '}For safer modifications, use Lucy chat to make changes instead.
              </p>
            </div>
            <Textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              className="w-full flex-1 min-h-[400px] border-0 rounded-none resize-none font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 p-4"
              placeholder="Edit the plan..."
            />
          </div>
        )}
      </div>

      {/* Footer - sticky at bottom */}
      <div className="px-4 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-end gap-2">
        {onDismiss && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1" />
                Discard Plan
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard plan?</AlertDialogTitle>
                <AlertDialogDescription>
                  This plan took time to generate. Discarding it will permanently remove it and you'll need to regenerate from scratch.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Plan</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDismiss}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Discard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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

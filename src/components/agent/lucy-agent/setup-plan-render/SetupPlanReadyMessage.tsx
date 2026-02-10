/**
 * SetupPlanReadyMessage
 *
 * Displays a success message when the setup plan is ready for review.
 * Shows a green checkmark and instructions to review the plan in the right panel.
 */

import { CheckCircle2 } from 'lucide-react';

export function SetupPlanReadyMessage() {
  return (
    <div className="rounded-lg bg-green-500/10 p-4">
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-[12px] font-medium font-mono">Setup plan ready</span>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground mt-1">
        Review the plan in the main panel on the right, then click &quot;Approve &amp; Execute&quot; to proceed.
      </div>
    </div>
  );
}

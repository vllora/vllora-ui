/**
 * SetupPlanAnalyzingMessage
 *
 * Displays a loading message while the setup plan is being generated.
 * Shows a spinning loader with analyzing text.
 */

import { Loader2 } from 'lucide-react';

export function SetupPlanAnalyzingMessage() {
  return (
    <div className="border border-border rounded-lg bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-[11px]">Analyzing your documents and creating a setup plan...</span>
      </div>
    </div>
  );
}

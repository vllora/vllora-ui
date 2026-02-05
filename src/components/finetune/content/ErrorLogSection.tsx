/**
 * ErrorLogSection
 *
 * Displays error messages for a finetune job.
 */

import { AlertCircle } from "lucide-react";

interface ErrorLogSectionProps {
  errorMessage: string;
}

export function ErrorLogSection({ errorMessage }: ErrorLogSectionProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-red-600 uppercase tracking-wide flex items-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5" />
        Error Log
      </h4>
      <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 rounded-md text-xs font-mono">
        {errorMessage}
      </div>
    </div>
  );
}

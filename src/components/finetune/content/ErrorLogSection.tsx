/**
 * ErrorLogSection
 *
 * Displays error messages for a finetune job with dark-theme styling.
 */

import { AlertCircle } from "lucide-react";

interface ErrorLogSectionProps {
  errorMessage: string;
}

export function ErrorLogSection({ errorMessage }: ErrorLogSectionProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <AlertCircle className="h-3 w-3 text-red-400" />
        <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">
          Error
        </span>
      </div>
      <div className="px-3 py-2 bg-red-500/5 text-red-300 rounded-md text-[11px] font-mono break-all whitespace-pre-wrap overflow-hidden border border-red-500/10">
        {errorMessage}
      </div>
    </div>
  );
}

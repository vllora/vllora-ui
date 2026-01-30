/**
 * DialogStates
 *
 * Reusable loading and error state components for dialogs.
 */

import { Loader2, AlertCircle } from "lucide-react";

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">{message}</span>
    </div>
  );
}

export interface ErrorStateProps {
  /** Error message to display */
  message: string;
  /** Optional retry callback */
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="py-8 text-center">
      <AlertCircle className="w-8 h-8 text-destructive/50 mx-auto mb-2" />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  /** Message to display */
  message?: string;
  /** Optional icon */
  icon?: React.ReactNode;
}

export function EmptyState({ message = "No data available", icon }: EmptyStateProps) {
  return (
    <div className="py-8 text-center">
      {icon && <div className="mb-2 flex justify-center text-muted-foreground/50">{icon}</div>}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

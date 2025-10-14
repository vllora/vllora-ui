import { AlertTriangle } from "lucide-react";

export const ErrorViewer: React.FC<{ error: any }> = ({ error }) => {
    // Simple error parsing
    const getErrorMessage = (err: any): string => {
        if (typeof err === 'string') {
            return err;
        }
        if (err && typeof err === 'object') {
            return err.message || err.error || JSON.stringify(err, null, 2);
        }
        return String(err);
    };

    const errorMessage = getErrorMessage(error);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/40" />
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Error
                    </div>
                </div>
                <div className="h-px flex-1 bg-border/40" />
            </div>
            <div className="rounded-md p-3 border border-red-500/30 bg-red-500/5">
                <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">
                    {errorMessage}
                </pre>
            </div>
        </div>
    );
}
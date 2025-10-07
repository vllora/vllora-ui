import { AlertTriangle, Bug, FileWarning, ServerCrash } from "lucide-react";
import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, CheckIcon } from "lucide-react";

export const ErrorViewer: React.FC<{ error: any }> = ({ error }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    // Parse error to extract useful information
    const parseError = (err: any) => {
        if (typeof err === 'string') {
            // Try to extract error type and message
            const lines = err.split('\n').filter(line => line.trim());
            const firstLine = lines[0] || err;
            
            // Common error patterns
            const errorTypeMatch = firstLine.match(/^(\w+Error|Error):\s*(.+)$/);
            if (errorTypeMatch) {
                return {
                    type: errorTypeMatch[1],
                    message: errorTypeMatch[2],
                    details: lines.slice(1).join('\n'),
                    raw: err
                };
            }

            // Check for stack trace
            const hasStackTrace = err.includes('    at ') || err.includes('File "');
            
            return {
                type: hasStackTrace ? 'Runtime Error' : 'Error',
                message: firstLine,
                details: lines.slice(1).join('\n'),
                raw: err
            };
        }
        
        if (err && typeof err === 'object') {
            return {
                type: err.name || err.type || 'Error',
                message: err.message || err.error || 'An error occurred',
                details: err.stack || err.details || JSON.stringify(err, null, 2),
                code: err.code,
                raw: JSON.stringify(err, null, 2)
            };
        }

        return {
            type: 'Unknown Error',
            message: String(err),
            details: null,
            raw: String(err)
        };
    };

    const errorInfo = parseError(error);
    const hasDetails = errorInfo.details && errorInfo.details.trim().length > 0;

    // Get appropriate icon based on error type
    const getErrorIcon = () => {
        const type = errorInfo.type?.toLowerCase() || '';
        if (type.includes('network') || type.includes('timeout')) {
            return <ServerCrash className="h-4 w-4" />;
        }
        if (type.includes('syntax') || type.includes('parse')) {
            return <Bug className="h-4 w-4" />;
        }
        if (type.includes('file') || type.includes('io')) {
            return <FileWarning className="h-4 w-4" />;
        }
        if (type.includes('validation') || type.includes('assert')) {
            return <AlertTriangle className="h-4 w-4" />;
        }
        return <AlertTriangle className="h-4 w-4" />;
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(errorInfo.raw);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="text-red-400">
                            {getErrorIcon()}
                        </div>
                        <span className="text-xs font-medium text-red-400">
                            {errorInfo.type}
                        </span>
                        {errorInfo.code && (
                            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-mono">
                                {errorInfo.code}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleCopy}
                            className="p-1 hover:bg-red-500/20 rounded transition-colors"
                            title="Copy error"
                        >
                            {copied ? (
                                <CheckIcon className="h-3 w-3 text-green-400" />
                            ) : (
                                <Copy className="h-3 w-3 text-red-400" />
                            )}
                        </button>
                        {hasDetails && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronUp className="h-3 w-3 text-red-400" />
                                ) : (
                                    <ChevronDown className="h-3 w-3 text-red-400" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Error Message */}
            <div className="px-3 py-2">
                <p className="text-xs text-red-300 font-mono break-all">
                    {errorInfo.message}
                </p>
            </div>

            {/* Details/Stack Trace (Collapsible) */}
            {hasDetails && isExpanded && (
                <div className="px-3 pb-2 border-t border-red-500/20">
                    <div className="mt-2 p-2 bg-black/30 rounded border border-red-500/10">
                        <pre className="text-[10px] text-red-300/80 font-mono whitespace-pre-wrap break-all overflow-x-auto">
                            {errorInfo.details}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
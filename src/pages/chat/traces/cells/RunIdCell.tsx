import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface RunIdCellProps {
  runId: string;
}

export function RunIdCell({ runId }: RunIdCellProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(runId);
      setCopied(true);
      toast.success('Run ID copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy Run ID');
    }
  };

  return (
    <div className="flex items-center gap-2 py-3 px-3">
      <span className="font-mono text-xs text-muted-foreground truncate" title={runId}>
        {runId.slice(0, 8)}...
      </span>
      <button
        onClick={handleCopy}
        className="p-1 hover:bg-accent rounded transition-colors"
        title="Copy Run ID"
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
        )}
      </button>
    </div>
  );
}

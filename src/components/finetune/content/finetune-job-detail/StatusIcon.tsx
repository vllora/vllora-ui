import { Loader2 } from "lucide-react";

export function StatusIcon({ status }: { status: string }) {
  if (status === "running" || status === "pending")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />;
  if (status === "succeeded")
    return <div className="h-3.5 w-3.5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /></div>;
  if (status === "failed")
    return <div className="h-3.5 w-3.5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-red-500" /></div>;
  return <div className="h-3.5 w-3.5 rounded-full bg-zinc-500/20 flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-zinc-500" /></div>;
}

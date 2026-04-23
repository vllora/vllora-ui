/**
 * DatasetsEmptyState
 *
 * Sentry-inspired "waiting for first workflow" state.
 * Shown when no datasets exist — guides users to run the finetune skill.
 */

import { Link } from "react-router-dom";
import { Loader, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaitingOrb } from "@/components/onboarding/WaitingOrb";
import { TerminalHint } from "@/components/onboarding/TerminalHint";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";

export function DatasetsEmptyState() {
  const { loadDatasets } = DatasetsConsumer();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
      <WaitingOrb icon={Loader} className="mb-7" />

      <h2 className="text-[17px] font-bold tracking-tight mb-2">
        Waiting for your first workflow
      </h2>
      <p className="text-[13px] text-muted-foreground max-w-[360px] leading-relaxed mb-7">
        Run the finetune skill in Claude Code or Codex. Your workflow will appear here automatically when data starts flowing in.
      </p>

      <TerminalHint
        command='claude "finetune your-document.pdf"'
        highlight="claude"
        className="mb-5"
      />

      <div className="flex gap-2.5">
        <Button variant="outline" size="sm" asChild>
          <Link to="/finetune/setup">View Setup Guide</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={loadDatasets} className="gap-1.5 text-muted-foreground">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </Button>
      </div>

      {/* Sample data hint */}
      <div className="flex items-center gap-3 mt-8 px-4 py-3 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/10 cursor-pointer hover:bg-indigo-500/[0.07] hover:border-indigo-500/20 transition-all max-w-[380px]">
        <FileText className="w-[18px] h-[18px] text-indigo-400 shrink-0" />
        <div className="text-left">
          <div className="text-xs font-semibold text-indigo-300">Try with sample data</div>
          <div className="text-[11px] text-muted-foreground">Explore the UI with a pre-loaded Chess Tutor workflow</div>
        </div>
      </div>
    </div>
  );
}

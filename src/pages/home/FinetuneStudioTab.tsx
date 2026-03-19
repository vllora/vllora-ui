/**
 * FinetuneStudioTab
 *
 * Homepage tab for the Finetune Studio product.
 * Shows "How it works" stepper (Install → Run → Evaluate) and CTAs.
 * The pipeline is driven externally by the finetune skill — the UI is
 * a visualization layer for evaluation and training.
 */

import { useNavigate } from "react-router";
import { Zap, RefreshCw, BookOpen } from "lucide-react";
import { FinetuneHero } from "@/components/datasets/empty-dataset-state/FinetuneHero";
import { HowItWorksCards } from "./HowItWorksCards";

export function FinetuneStudioTab() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[56rem] mx-auto flex flex-col items-center">
      <FinetuneHero className="mb-11" />

      <HowItWorksCards />

      {/* CTA buttons */}
      <div className="flex items-center gap-3 mt-10 mb-9">
        <button
          onClick={() => navigate("/finetune/setup")}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-[13px] font-semibold bg-gradient-to-b from-[rgb(var(--theme-400))] to-[rgb(var(--theme-500))] text-emerald-950 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-[rgb(var(--theme-300))] hover:to-[rgb(var(--theme-400))] hover:shadow-[0_2px_8px_rgba(var(--theme-500),0.3)] hover:-translate-y-px transition-all"
        >
          <Zap className="w-4 h-4" />
          Get Started
        </button>
        <button
          onClick={() => navigate("/finetune")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium bg-card/50 text-muted-foreground border border-border/50 hover:border-border hover:bg-card hover:text-foreground transition-all"
        >
          I already have workflows
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 w-full max-w-[440px] mb-7">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/30">or start differently</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      </div>

      {/* Alt pathways */}
      <div className="flex gap-3 max-w-[560px] w-full">
        <div
          className="flex-1 flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/30 bg-card/30 opacity-40 cursor-not-allowed"
        >
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <RefreshCw className="w-[18px] h-[18px] text-orange-400" />
          </div>
          <div className="text-left">
            <div className="text-[12.5px] font-semibold">Route existing API calls</div>
            <div className="text-[11px] text-muted-foreground/60">Coming soon</div>
          </div>
        </div>
        <button
          onClick={() => window.open("https://vllora.dev/docs", "_blank")}
          className="flex-1 flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/30 bg-card/30 hover:border-border/60 hover:bg-card/60 transition-all"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-[18px] h-[18px] text-blue-400" />
          </div>
          <div className="text-left">
            <div className="text-[12.5px] font-semibold">View documentation</div>
            <div className="text-[11px] text-muted-foreground/60">Learn more about finetuning</div>
          </div>
        </button>
      </div>
    </div>
  );
}

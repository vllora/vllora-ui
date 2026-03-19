/**
 * FinetuneStudioTab
 *
 * Homepage tab for the Finetune Studio product.
 * Shows "How it works" stepper (Install → Run → Evaluate), reward preview,
 * CTAs, and alternative pathway cards.
 */

import { useNavigate } from "react-router";
import { Zap, RefreshCw, BookOpen } from "lucide-react";
import { FinetuneHero } from "@/components/datasets/empty-dataset-state/FinetuneHero";
import { HowItWorksCards } from "./HowItWorksCards";

export function FinetuneStudioTab() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[56rem] mx-auto flex flex-col items-center">
      <FinetuneHero className="mb-10" />

      <HowItWorksCards />

      {/* CTA buttons */}
      <div className="flex items-center gap-3 mt-8 mb-8">
        <button
          onClick={() => navigate("/finetune/setup")}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-[13px] font-semibold bg-[rgb(var(--theme-500))] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] hover:bg-[rgb(var(--theme-600))] hover:shadow-[0_2px_8px_rgba(var(--theme-500),0.25)] hover:-translate-y-px transition-all"
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

      {/* Alt pathways — inline, no divider */}
      <div className="flex gap-3 max-w-[520px] w-full mb-4">
        <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border border-border/20 bg-card/20 opacity-40 cursor-not-allowed">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <RefreshCw className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-left min-w-0">
            <div className="text-[12px] font-semibold">Route API calls</div>
            <div className="text-[10px] text-muted-foreground/60">Coming soon</div>
          </div>
        </div>
        <button
          onClick={() => window.open("https://vllora.dev/docs", "_blank")}
          className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border border-border/20 bg-card/20 hover:border-border/40 hover:bg-card/40 transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-left min-w-0">
            <div className="text-[12px] font-semibold">Documentation</div>
            <div className="text-[10px] text-muted-foreground/60">Guides & API reference</div>
          </div>
        </button>
      </div>
    </div>
  );
}

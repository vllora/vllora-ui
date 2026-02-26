/**
 * FinetuneStudioTab
 *
 * Homepage tab for the Finetune Studio product.
 * Reuses the ObjectiveInputTab from /finetune/new for a consistent experience.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { BookOpen, Radio } from "lucide-react";
import { ObjectiveInputTab } from "@/components/datasets/empty-dataset-state/ObjectiveInputTab";
import { FinetuneHero } from "@/components/datasets/empty-dataset-state/FinetuneHero";
import { CurrentAppConsumer } from "@/lib";

export function FinetuneStudioTab() {
  const navigate = useNavigate();
  const { app_mode } = CurrentAppConsumer();
  const [objective, setObjective] = useState("");

  const handleStartFinetune = useCallback(() => {
    if (objective.trim()) {
      navigate(`/finetune/new?objective=${encodeURIComponent(objective.trim())}`);
    } else {
      navigate("/finetune/new");
    }
  }, [objective, navigate]);

  return (
    <div className="w-full max-w-[50vw] mx-auto flex flex-col items-center">
      <FinetuneHero className="mb-10" />

      {/* Objective input */}
      <ObjectiveInputTab
        objective={objective}
        onObjectiveChange={setObjective}
        onStartFinetune={handleStartFinetune}
      />

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-3 mt-8 w-3/4">
        <button
          onClick={() => navigate("/finetune/new?tab=api")}
          className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-card/50 hover:border-[rgba(var(--theme-500),0.3)] hover:bg-[rgba(var(--theme-500),0.04)] transition-all duration-200"
        >
          <div className="w-8 h-8 rounded-lg bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors duration-200 block truncate">
              Real conversations
            </span>
            <span className="block text-[11px] text-muted-foreground/40 mt-0.5 truncate">
              Finetune from live LLM calls
            </span>
          </div>
        </button>

        <button
          onClick={() =>
            window.open(
              app_mode === "vllora"
                ? "https://vllora.dev/docs"
                : "https://docs.langdb.ai/",
              "_blank"
            )
          }
          className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-card/50 hover:border-[rgba(var(--theme-500),0.3)] hover:bg-[rgba(var(--theme-500),0.04)] transition-all duration-200"
        >
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-muted-foreground/60" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors duration-200 block truncate">
              Documentation
            </span>
            <span className="block text-[11px] text-muted-foreground/40 mt-0.5 truncate">
              Guides & API reference
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

/**
 * FinetuneStudioTab
 *
 * Homepage tab for the Finetune Studio product.
 * Reuses the ObjectiveInputTab from /finetune/new for a consistent experience.
 *
 * When the user attaches files and clicks "Start Finetune", we create the
 * dataset directly and upload files as knowledge sources — files cannot be
 * serialized through URL params so we must handle them here.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { BookOpen, Radio } from "lucide-react";
import { toast } from "sonner";
import { ObjectiveInputTab } from "@/components/datasets/empty-dataset-state/ObjectiveInputTab";
import { FinetuneHero } from "@/components/datasets/empty-dataset-state/FinetuneHero";
import { CurrentAppConsumer } from "@/lib";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { emitter } from "@/utils/eventEmitter";
import { uploadKnowledgeSourceHandler } from "@/lib/distri-finetune-tools/steps/knowledge-sources";
import type { KnowledgeSourceType } from "@/types/dataset-types";

/** Read a File as a base64-encoded string (strips the data-URL prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function FinetuneStudioTab() {
  const navigate = useNavigate();
  const { app_mode } = CurrentAppConsumer();
  const { createDataset } = DatasetsConsumer();
  const [objective, setObjective] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleStartFinetune = useCallback(async (files?: File[]) => {
    // No objective and no files → just navigate to the new-dataset page
    if (!objective.trim()) {
      navigate("/finetune/new");
      return;
    }

    // If there are files attached we MUST create the dataset here so
    // we can upload them as knowledge sources — files can't survive
    // a URL-based navigation.
    if (files && files.length > 0) {
      setIsCreating(true);
      try {
        const finalName = objective.trim().split(/\s+/).slice(0, 5).join(" ");
        const dataset = await createDataset(finalName, objective.trim());

        // Upload each file as a knowledge source
        // Note: We do NOT emit vllora_plan_generating here — PlanContext isn't
        // mounted yet (it lives on the dataset detail page). The dataset detail
        // page handles auto-plan generation via the ?autoGeneratePlan=true param.
        for (const file of files) {
          const content = await readFileAsBase64(file);
          const type: KnowledgeSourceType = file.type === "application/pdf" ? "pdf" : "text";
          await uploadKnowledgeSourceHandler({
            dataset_id: dataset.id,
            name: file.name,
            type,
            content,
            mime_type: file.type,
          });
        }

        // Notify KnowledgeSourcesPanel to refresh
        emitter.emit("vllora_knowledge_source_updated", { datasetId: dataset.id });

        setIsCreating(false);
        navigate(`/finetune/${dataset.id}?autoGeneratePlan=true`);
      } catch (error) {
        console.error("Failed to create dataset with files:", error);
        toast.error("Failed to create workflow");
        setIsCreating(false);
      }
    } else {
      // No files — use the lightweight URL-param path (EmptyDatasetsState
      // will create the dataset and auto-start).
      navigate(`/finetune/new?objective=${encodeURIComponent(objective.trim())}&autoStart=true`);
    }
  }, [objective, navigate, createDataset]);

  return (
    <div className="w-full max-w-[50vw] mx-auto flex flex-col items-center">
      <FinetuneHero className="mb-10" />

      {/* Objective input */}
      <ObjectiveInputTab
        objective={objective}
        onObjectiveChange={setObjective}
        onStartFinetune={handleStartFinetune}
        isLoading={isCreating}
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
              Build from live LLM calls
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
              Guides and API reference
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

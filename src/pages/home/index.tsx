/**
 * HomePage
 *
 * Single-surface landing page for vLLora. The old two-tab toggle (Finetune
 * Studio / LLM Gateway) was removed during the skill-first pivot — gateway
 * is now a side-effect store, not a co-equal product. This page is now
 * just the finetune home wrapped in the page chrome.
 */

import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { FinetuneHome } from "./FinetuneHome";

export function HomePage() {
  // Mounted only for its side effects (project context init).
  ProjectsConsumer();

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full">
      <div className="relative flex flex-col items-center px-6 pt-[6vh] pb-12">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(var(--theme-500),0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="absolute top-[200px] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(var(--theme-400),0.04)_0%,transparent_60%)] pointer-events-none blur-xl" />

        <div className="relative z-10 flex flex-col items-center w-full">
          <FinetuneHome />
        </div>
      </div>
    </section>
  );
}

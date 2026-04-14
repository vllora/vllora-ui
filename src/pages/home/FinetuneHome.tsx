/**
 * FinetuneHome
 *
 * Replaces the old `FinetuneStudioTab`. Single-surface home page that
 * teaches the skill-first model and lets users start from either input
 * ingredient (documents or OTel traces).
 *
 * Layout (top → bottom):
 *   1. Hero — outcome headline + problem-framing subhead (steals from Braintrust)
 *   2. Install card — copy-to-clipboard install command (steals from Vercel)
 *   3. How it works — 3-step strip (existing component)
 *   4. Primary CTAs — "Start a finetune" / "I already have workflows"
 *   5. Ingredient tiles — Documents vs OTel traces (new core section)
 *   6. Documentation link
 *
 * See the plan at ~/.claude/plans/purring-pondering-wreath.md and the
 * research notes in the conversation that produced this redesign.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { Zap, Copy, Check, FileText, MessageSquare, ArrowRight, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FinetuneHero } from "@/components/datasets/empty-dataset-state/FinetuneHero";
import { HowItWorksCards } from "./HowItWorksCards";

const SKILL_INSTALL_CMD =
  "curl -sSL https://vllora.dev/install-skill.sh | bash";

export function FinetuneHome() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[56rem] flex flex-col items-center">
      {/* 1. Hero — outcome + problem framing */}
      <FinetuneHero className="mb-4" />
      <p className="max-w-[40rem] text-center text-[13px] leading-relaxed text-muted-foreground/70 mb-10">
        vLLora is a Claude Code skill. The fine-tuning pipeline runs in your
        terminal, against your project; vLLora visualizes everything as it
        happens. Skill-first means no lock-in and no opinionated UI in the way.
      </p>

      {/* 2. Install card */}
      <InstallCard />

      {/* 3. How it works */}
      <div className="mt-10">
        <HowItWorksCards />
      </div>

      {/* 4. Primary CTAs */}
      <div className="flex items-center gap-3 mt-10 mb-10">
        <button
          onClick={() => navigate("/finetune/setup")}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-[13px] font-semibold bg-[rgb(var(--theme-500))] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] hover:bg-[rgb(var(--theme-600))] hover:shadow-[0_2px_8px_rgba(var(--theme-500),0.25)] hover:-translate-y-px transition-all"
        >
          <Zap className="w-4 h-4" />
          Start a finetune
        </button>
        <button
          onClick={() => navigate("/finetune")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium bg-card/50 text-muted-foreground border border-border/50 hover:border-border hover:bg-card hover:text-foreground transition-all"
        >
          I already have workflows
        </button>
      </div>

      {/* 5. Ingredient tiles — the core teaching surface */}
      <div className="w-full max-w-[680px]">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/40 text-center mb-4">
          Two ingredients you can feed the skill
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IngredientTile
            icon={<FileText className="w-5 h-5" />}
            iconBg="bg-sky-500/10 text-sky-300"
            title="Documents"
            sources="PDFs · runbooks · wikis · markdown"
            bestFor="knowledge distillation"
            onClick={() => navigate("/finetune")}
          />
          <IngredientTile
            icon={<MessageSquare className="w-5 h-5" />}
            iconBg="bg-violet-500/10 text-violet-300"
            title="OTel traces"
            sources="LLM call logs from your existing app"
            bestFor="behavior cloning"
            badge="New"
            onClick={() => navigate("/otel-traces")}
          />
        </div>
      </div>

      {/* 6. Documentation link */}
      <button
        onClick={() => window.open("https://vllora.dev/docs", "_blank")}
        className="mt-6 inline-flex items-center gap-2 text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5" />
        Documentation & API reference
      </button>
    </div>
  );
}

// ─── Install card ───────────────────────────────────────────────────────────

function InstallCard() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SKILL_INSTALL_CMD);
      setCopied(true);
      toast.success("Install command copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  };

  return (
    <div className="w-full max-w-[560px]">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-2 text-center">
        Drop the skill into your project
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/60 px-4 py-3 font-mono text-[13px]">
        <span className="truncate text-foreground/90">
          <span className="text-muted-foreground/40">$ </span>
          {SKILL_INSTALL_CMD}
        </span>
        <button
          onClick={handleCopy}
          className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          aria-label="Copy install command"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Ingredient tile ────────────────────────────────────────────────────────

interface IngredientTileProps {
  readonly icon: React.ReactNode;
  readonly iconBg: string;
  readonly title: string;
  readonly sources: string;
  readonly bestFor: string;
  readonly badge?: string;
  readonly onClick: () => void;
}

function IngredientTile({
  icon,
  iconBg,
  title,
  sources,
  bestFor,
  badge,
  onClick,
}: IngredientTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-2xl border border-border/30 bg-card/40 p-5 text-left transition-all hover:border-[rgba(var(--theme-500),0.3)] hover:bg-card/70 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
          {icon}
        </div>
        {badge && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-violet-500/30 text-violet-300">
            {badge}
          </span>
        )}
      </div>
      <h3 className="text-[14px] font-bold tracking-tight">{title}</h3>
      <p className="mt-1 text-[11px] text-muted-foreground/60">{sources}</p>
      <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[rgb(var(--theme-400))]">
        Best for {bestFor}
        <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

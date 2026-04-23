/**
 * FinetuneHome
 *
 * Homepage landing / onboarding surface. Re-imagined from the Workflow
 * Redesign mock: a welcome header, "How vLLora works" 5-stage pipeline
 * diagram, and starting-point cards (Documents, OTel traces, templates,
 * HuggingFace). Install command is retained because dropping the skill
 * into your project is step zero for this product.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Sparkles,
  Upload,
  Cpu,
  FileText,
  BarChart3,
  Zap,
  Copy,
  Check,
  RotateCcw,
  Globe,
  LayoutGrid,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SKILL_INSTALL_CMD =
  "curl -sSL https://vllora.dev/install-skill.sh | bash";

/** 5 pipeline stages matching the mock — labels, subtitles, detail, and a stable accent. */
const PIPELINE_STAGES = [
  {
    n: "01",
    icon: <Upload className="h-5 w-5" />,
    label: "Ingest",
    sub: "PDFs · OTEL traces",
    detail: "Upload docs or stream spans through the gateway",
    accent: "text-violet-400",
  },
  {
    n: "02",
    icon: <LayoutGrid className="h-5 w-5" />,
    label: "Cluster",
    sub: "Topics emerge",
    detail: "Automatic topic discovery via embeddings",
    accent: "text-blue-400",
  },
  {
    n: "03",
    icon: <FileText className="h-5 w-5" />,
    label: "Curate",
    sub: "Records · prompts",
    detail: "Review, edit, regenerate training records",
    accent: "text-amber-400",
  },
  {
    n: "04",
    icon: <BarChart3 className="h-5 w-5" />,
    label: "Evaluate",
    sub: "Score · regressions",
    detail: "Graders catch drift before production",
    accent: "text-rose-400",
  },
  {
    n: "05",
    icon: <Cpu className="h-5 w-5" />,
    label: "Finetune",
    sub: "LoRA · serve",
    detail: "GRPO / SFT then deploy via the gateway",
    accent: "text-emerald-300",
    terminal: true,
  },
] as const;

export function FinetuneHome() {
  const navigate = useNavigate();

  // Fits proportionally to viewport height — vertical gaps scale via
  // `clamp()` so the page breathes on tall screens and tightens on short
  // ones without introducing a scrollbar. Section content (headlines,
  // padding, node sizes) uses the same scaling approach internally.
  return (
    <div
      className="flex w-full max-w-[880px] flex-col px-8"
      style={{
        gap: "clamp(0.5rem, 1.6vh, 1.25rem)",
        paddingTop: "clamp(0.75rem, 3vh, 2rem)",
        paddingBottom: "clamp(0.75rem, 3vh, 2rem)",
      }}
    >
      <WelcomeHeader />
      <WorkflowDescription />
      <InstallCard />
      <PipelineDiagram />
      <StartFromSection onDocuments={() => navigate("/finetune")} onTraces={() => navigate("/otel-traces")} />
      <SecondaryStarters />
      <ActionRow
        onNewWorkflow={() => navigate("/finetune/setup")}
        onBrowseTemplates={() => navigate("/finetune/new")}
      />
    </div>
  );
}

function WorkflowDescription() {
  return (
    <p className="max-w-[640px] text-[12.5px] leading-[1.55] text-muted-foreground">
      A <strong className="font-medium text-foreground/90">workflow</strong> wraps one deployed
      model: ingest data, curate a training set, evaluate, finetune, and serve — all in one loop.
      You can run many workflows side-by-side, each with its own topics, records, and checkpoints.
    </p>
  );
}

function SecondaryStarters() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <SecondaryStarterCard
        icon={<LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />}
        title="Start from template"
        meta="8 templates"
        description="Chess coach · Support bot · Code reviewer · SQL assistant…"
        onClick={() => toast.info("Template gallery coming soon")}
      />
      <SecondaryStarterCard
        icon={<MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
        title="Import from Hugging Face"
        description="Clone a dataset or seed from an existing model."
        onClick={() => toast.info("HuggingFace import coming soon")}
      />
    </div>
  );
}

function SecondaryStarterCard({
  icon,
  title,
  meta,
  description,
  onClick,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly meta?: string;
  readonly description: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-left transition-colors hover:bg-card/70"
    >
      <div className="flex items-center gap-2 text-[12.5px] text-foreground/90">
        {icon}
        <span>{title}</span>
        {meta && <span className="ml-auto text-[11px] text-muted-foreground/70">{meta}</span>}
      </div>
      <p className="mt-1 pl-[22px] text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}

// ─── Welcome header ─────────────────────────────────────────────────────────

function WelcomeHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
        <Sparkles className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-300">
          Welcome to vLLora
        </div>
        <h1
          className="font-semibold tracking-[-0.015em] text-foreground"
          style={{ fontSize: "clamp(18px, 2.6vh, 24px)" }}
        >
          Let's set up your first workflow
        </h1>
      </div>
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
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  };
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
        Drop the skill into your project
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 font-mono text-[13px]">
        <span className="truncate text-foreground/90">
          <span className="text-muted-foreground/40">$ </span>
          {SKILL_INSTALL_CMD}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy install command"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Pipeline diagram ───────────────────────────────────────────────────────

function PipelineDiagram() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-emerald-500/20"
      style={{
        background:
          "linear-gradient(180deg, rgba(16,185,129,0.035) 0%, transparent 40%, rgba(16,185,129,0.04) 100%)",
      }}
    >
      <div className="flex items-baseline gap-2.5 px-5 pt-3.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300">
          How vLLora works
        </span>
        <span className="text-[11px] text-muted-foreground">· 5 stages in one continuous loop</span>
      </div>
      <div
        className="relative px-5"
        style={{ paddingTop: "clamp(1rem, 2.5vh, 2rem)", paddingBottom: "clamp(1rem, 2.5vh, 2rem)" }}
      >
        <PipelineRibbon />
        <div className="relative grid grid-cols-5 gap-2">
          {PIPELINE_STAGES.map((s, i) => (
            <PipelineNode key={s.n} stage={s} offsetTop={NODE_OFFSETS[i]} />
          ))}
        </div>
        <div
          className="flex items-center gap-2 rounded-md border border-dashed border-border/50 bg-card/30 px-3 py-1.5 text-[10.5px] text-muted-foreground"
          style={{ marginTop: "clamp(0.75rem, 1.8vh, 1.25rem)" }}
        >
          <RotateCcw className="h-3 w-3 text-emerald-300" />
          <span>
            <span className="text-emerald-300">Closed loop:</span> once finetuned, the served model
            generates new traces → back to ingest → continuous improvement
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Wavy ribbon behind the nodes. Three layers:
 *   1. Dashed faint trace (atmospheric guideline)
 *   2. Filled ribbon underneath (soft emerald fade)
 *   3. Solid wavy line on top (the flow)
 * Plus the "closed loop" feedback arrow — a dashed path looping from stage 5
 * back to stage 1 above the nodes, matching the mock's production→data hint.
 */
function PipelineRibbon() {
  return (
    <svg
      width="100%"
      height="140"
      viewBox="0 0 1000 140"
      preserveAspectRatio="none"
      className="pointer-events-none absolute left-0 top-11"
      aria-hidden
    >
      <defs>
        <linearGradient id="flow-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.48 0.012 170)" stopOpacity="0.25" />
          <stop offset="50%" stopColor="oklch(0.66 0.18 160)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="oklch(0.74 0.17 160)" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="flow-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.66 0.18 160)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="oklch(0.66 0.18 160)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* dashed guideline */}
      <path
        d="M60,70 C160,40 240,90 340,60 C440,30 540,85 640,55 C740,25 840,75 940,45"
        fill="none"
        stroke="url(#flow-line)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="1 3"
        opacity="0.5"
      />
      {/* underneath fill */}
      <path
        d="M60,70 C160,40 240,90 340,60 C440,30 540,85 640,55 C740,25 840,75 940,45 L940,140 L60,140 Z"
        fill="url(#flow-fill)"
      />
      {/* solid flow line */}
      <path
        d="M60,70 C160,40 240,90 340,60 C440,30 540,85 640,55 C740,25 840,75 940,45"
        fill="none"
        stroke="oklch(0.66 0.18 160)"
        strokeWidth="1.2"
        opacity="0.35"
      />
      {/* closed-loop feedback arrow — production output flows back to ingest */}
      <path
        d="M940,45 Q960,20 900,14 L60,14 Q30,14 30,50 L30,70"
        fill="none"
        stroke="oklch(0.48 0.012 170)"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.5"
      />
      <path
        d="M30,70 L26,62 M30,70 L34,62"
        fill="none"
        stroke="oklch(0.48 0.012 170)"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* node anchor dots along the ribbon */}
      <g fill="oklch(0.74 0.17 160)">
        <circle cx="60" cy="70" r="3" />
        <circle cx="280" cy="75" r="3" />
        <circle cx="500" cy="57" r="3" />
        <circle cx="720" cy="42" r="3" />
        <circle cx="940" cy="45" r="4.5" stroke="var(--background)" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** Per-stage vertical offset so nodes "ride" along the wavy ribbon path. */
const NODE_OFFSETS = ["12px", "20px", "8px", "0px", "6px"] as const;

function PipelineNode({
  stage,
  offsetTop,
}: {
  readonly stage: (typeof PIPELINE_STAGES)[number];
  readonly offsetTop: string;
}) {
  const terminal = "terminal" in stage && stage.terminal;
  return (
    <div className="relative text-center" style={{ paddingTop: offsetTop }}>
      <div className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">
        {stage.n}
      </div>
      <div
        className={cn(
          "relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-card/80",
          stage.accent,
          terminal
            ? "border border-emerald-500/40 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]"
            : "border border-border/60",
        )}
      >
        {stage.icon}
        {terminal && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
        )}
      </div>
      <div className="mt-2 text-[12px] font-medium text-foreground">{stage.label}</div>
      <div className="mt-0.5 text-[10.5px] text-muted-foreground/80">{stage.sub}</div>
      <div className="mt-1.5 px-1 text-[10px] leading-[1.4] text-muted-foreground/60">
        {stage.detail}
      </div>
    </div>
  );
}

// ─── Start from section ─────────────────────────────────────────────────────

function StartFromSection({
  onDocuments,
  onTraces,
}: {
  readonly onDocuments: () => void;
  readonly onTraces: () => void;
}) {
  return (
    <>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
        Start from
      </div>
      <div className="mb-2 grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <StartCard
          icon={<FileText className="h-4 w-4" />}
          iconClass="text-rose-400"
          title="Documents"
          tag="PDF · DOCX · MD"
          description="Upload source material. vLLora extracts chunks, clusters them into topics, and synthesizes Q&A records you can curate."
          cta="Upload docs →"
          onClick={onDocuments}
        />
        <StartCard
          icon={<Globe className="h-4 w-4" />}
          iconClass="text-violet-400"
          title="OTEL traces"
          tag="gateway · span stream"
          description="Route traffic through the vLLora gateway. LLM calls, tool invocations and latencies become training signal automatically."
          cta="Connect gateway →"
          onClick={onTraces}
        />
      </div>
    </>
  );
}

interface StartCardProps {
  readonly icon: React.ReactNode;
  readonly iconClass: string;
  readonly title: string;
  readonly tag: string;
  readonly description: string;
  readonly cta: string;
  readonly onClick: () => void;
}

function StartCard({ icon, iconClass, title, tag, description, cta, onClick }: StartCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col rounded-xl border border-border/60 bg-card/60 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03]"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <span className={cn("shrink-0", iconClass)}>{icon}</span>
        <span className="text-[13px] font-medium text-foreground">{title}</span>
        <span className="ml-auto rounded bg-muted/50 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
          {tag}
        </span>
      </div>
      <p className="text-[11.5px] leading-[1.5] text-muted-foreground">{description}</p>
      <span className="mt-2.5 text-[11.5px] text-emerald-300 transition-colors group-hover:text-emerald-200">
        {cta}
      </span>
    </button>
  );
}


// ─── Action row ─────────────────────────────────────────────────────────────

function ActionRow({
  onNewWorkflow,
  onBrowseTemplates,
}: {
  readonly onNewWorkflow: () => void;
  readonly onBrowseTemplates: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onNewWorkflow}
        className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--theme-500))] px-4.5 py-2 text-[13px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-px hover:bg-[rgb(var(--theme-600))] hover:shadow-[0_2px_8px_rgba(var(--theme-500),0.25)]"
        style={{ padding: "9px 18px" }}
      >
        <Zap className="h-3.5 w-3.5" />
        New workflow
      </button>
      <button
        type="button"
        onClick={onBrowseTemplates}
        className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-4 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
      >
        Browse templates
      </button>
      <span className="ml-auto text-[11px] text-muted-foreground">
        Need help?{" "}
        <button
          type="button"
          onClick={() => window.open("https://vllora.dev/docs", "_blank")}
          className="inline-flex items-center gap-1 text-emerald-300 transition-colors hover:text-emerald-200"
        >
          <BookOpen className="h-3 w-3" />
          Read the 5-min intro →
        </button>
      </span>
    </div>
  );
}

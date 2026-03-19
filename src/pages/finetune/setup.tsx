/**
 * SetupGuidePage
 *
 * Tabbed step-by-step guide for setting up the finetune skill.
 * All content fits in one viewport — click through steps 1→2→3→4.
 * Accessible at /finetune/setup.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Info, Layers, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeBlock, Cmd, Str, Comment, Output } from "@/components/onboarding/CodeBlock";
import { PipelineFlowBadges } from "@/components/onboarding/PipelineFlowBadges";

const STEPS = [
  { num: 1, label: "Prerequisites" },
  { num: 2, label: "Install Skill" },
  { num: 3, label: "Run Pipeline" },
  { num: 4, label: "Evaluate" },
] as const;

export function SetupGuidePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-background text-foreground">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-[600px]">
          {/* Header */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-[rgba(var(--theme-500),0.08)] border border-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-400))] mb-4">
              Getting Started
            </span>
            <h1 className="text-xl font-extrabold tracking-tight mb-2">Set up in 4 steps</h1>
            <p className="text-sm text-muted-foreground">
              Install the skill, run the pipeline, and come back here to evaluate.
            </p>
          </div>

          {/* Step tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/20 border border-border/30 mb-6">
            {STEPS.map((s, i) => (
              <button
                key={s.num}
                onClick={() => setStep(i)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all",
                  i === step
                    ? "bg-background shadow-sm text-foreground"
                    : i < step
                    ? "text-[rgb(var(--theme-400))]"
                    : "text-muted-foreground/50 hover:text-muted-foreground",
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                  i === step ? "bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-400))]" :
                  i < step ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-400))]" :
                  "bg-muted/50 text-muted-foreground/40",
                )}>
                  {i < step ? <Check className="w-3 h-3" /> : s.num}
                </span>
                {s.label}
              </button>
            ))}
          </div>

          {/* Step content */}
          <div className="min-h-[280px] mb-6">
            {step === 0 && <StepPrerequisites />}
            {step === 1 && <StepInstallSkill />}
            {step === 2 && <StepRunPipeline />}
            {step === 3 && <StepEvaluate />}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => isFirst ? navigate("/") : setStep(step - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {isFirst ? "Home" : "Back"}
            </button>

            {isLast ? (
              <button
                onClick={() => navigate("/finetune")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-gradient-to-b from-[rgb(var(--theme-400))] to-[rgb(var(--theme-500))] text-emerald-950 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-[rgb(var(--theme-300))] hover:to-[rgb(var(--theme-400))] transition-all"
              >
                View My Workflows →
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-gradient-to-b from-[rgb(var(--theme-400))] to-[rgb(var(--theme-500))] text-emerald-950 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-[rgb(var(--theme-300))] hover:to-[rgb(var(--theme-400))] transition-all"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Step Content Components ──

function StepPrerequisites() {
  return (
    <div>
      <h3 className="text-sm font-bold mb-2">Install an AI coding assistant</h3>
      <p className="text-[13px] text-muted-foreground mb-4">
        You need Claude Code or Codex to run the finetune skill:
      </p>
      <CodeBlock copyText="npm install -g @anthropic-ai/claude-code">
        <Comment># Claude Code (recommended)</Comment><br />
        <Cmd>npm install -g</Cmd> <Str>@anthropic-ai/claude-code</Str><br />
        <br />
        <Comment># Or OpenAI Codex</Comment><br />
        <Cmd>npm install -g</Cmd> <Str>@openai/codex</Str>
      </CodeBlock>
      <Callout icon={<Info className="w-[15px] h-[15px] text-[rgb(var(--theme-400))]" />} className="bg-[rgba(var(--theme-500),0.04)] border-[rgba(var(--theme-500),0.1)]">
        Make sure the vLLora backend is running at{" "}
        <code className="text-[rgb(var(--theme-400))]">localhost:9090</code>.
        Start it with <code className="text-[rgb(var(--theme-400))]">npm run start:backend</code>.
      </Callout>
    </div>
  );
}

function StepInstallSkill() {
  return (
    <div>
      <h3 className="text-sm font-bold mb-2">Copy the skill to your project</h3>
      <p className="text-[13px] text-muted-foreground mb-4">
        The skill tells Claude Code how to run the full finetune pipeline. Copy it into any project where you have documents.
      </p>
      <CodeBlock copyText="cp -r vllora/ui/finetune-skill/ your-project/.claude/skills/finetune/">
        <Cmd>cp -r</Cmd> <Str>vllora/ui/finetune-skill/</Str> <Str>your-project/.claude/skills/finetune/</Str><br />
        <br />
        <Comment># Your project structure:</Comment><br />
        <Comment># your-project/</Comment><br />
        <Comment>#   ├── .claude/skills/finetune/  ← skill</Comment><br />
        <Comment>#   ├── chess-tactics.pdf         ← your document</Comment><br />
        <Comment>#   └── ...</Comment>
      </CodeBlock>
    </div>
  );
}

function StepRunPipeline() {
  return (
    <div>
      <h3 className="text-sm font-bold mb-2">Run the finetune pipeline</h3>
      <p className="text-[13px] text-muted-foreground mb-4">
        Open a terminal in your project and describe what you want to finetune:
      </p>
      <CodeBlock copyText='claude "finetune chess-tactics.pdf as a chess tutor"'>
        <Cmd>claude</Cmd> <Str>&quot;finetune chess-tactics.pdf as a chess tutor&quot;</Str><br />
        <br />
        <Output># → Extracting chess-tactics.pdf...</Output><br />
        <Output># → Building 12 topics from document...</Output><br />
        <Output># → Generating 154 training records...</Output><br />
        <Output># → ✓ View at http://localhost:5173/finetune/abc123</Output>
      </CodeBlock>
      <PipelineFlowBadges />
      <Callout icon={<Layers className="w-[15px] h-[15px] text-indigo-400" />} className="bg-indigo-500/[0.04] border-indigo-500/10">
        <strong className="text-indigo-300">Like Weights & Biases</strong> — the CLI prints a direct link to your workflow. Click it to see data in real-time.
      </Callout>
    </div>
  );
}

function StepEvaluate() {
  return (
    <div>
      <h3 className="text-sm font-bold mb-2">Evaluate and train in the UI</h3>
      <p className="text-[13px] text-muted-foreground mb-4">
        Once the skill finishes, your workflow is ready. You can:
      </p>
      <div className="flex flex-col gap-2.5">
        {[
          "Browse topics & training records on the canvas",
          "Run evaluations to score data quality",
          "Edit records or regenerate low-quality ones",
          "Start training when quality looks good",
          "Deploy and test your finetuned model",
        ].map((item) => (
          <div key={item} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-400))] text-[10px] flex items-center justify-center shrink-0">
              ✓
            </span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ──

function Callout({ icon, children, className }: { readonly icon: React.ReactNode; readonly children: React.ReactNode; readonly className?: string }) {
  return (
    <div className={cn("flex gap-2.5 mt-4 p-3 rounded-lg border", className)}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * HowItWorksCards
 *
 * 3-card stepper showing the skill-first workflow:
 * Install Skill → Run Pipeline → Evaluate & Train.
 *
 * Step 1 is highlighted as the primary entry point.
 * Connector arrows visually link the steps.
 */

import { Monitor, Terminal, PieChart, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepDef {
  readonly num: number;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly miniCode?: string;
  readonly miniCodeCmd?: string;
  readonly badgeClass: string;
  readonly iconBg: string;
  readonly iconColor: string;
  readonly isPrimary?: boolean;
}

const STEPS: StepDef[] = [
  {
    num: 1,
    icon: Monitor,
    title: "Install the Skill",
    description: "Copy the finetune skill into your project. Works with Claude Code and Codex.",
    miniCodeCmd: "cp -r",
    miniCode: "finetune-skill/ your-project/",
    badgeClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-400",
    isPrimary: true,
  },
  {
    num: 2,
    icon: Terminal,
    title: "Pick an ingredient",
    description: "Point the skill at PDFs or OTel traces. It extracts knowledge, builds topics, generates records, and writes a grader.",
    miniCodeCmd: "claude",
    miniCode: '"finetune doc.pdf"',
    badgeClass: "bg-[rgba(var(--theme-500),0.12)] text-[rgb(var(--theme-400))] border-[rgba(var(--theme-500),0.25)]",
    iconBg: "bg-[rgba(var(--theme-500),0.1)]",
    iconColor: "text-[rgb(var(--theme-400))]",
  },
  {
    num: 3,
    icon: PieChart,
    title: "Evaluate & Train",
    description: "Review topics and records in the UI. Run evaluations, iterate, then train your model.",
    miniCodeCmd: "open",
    miniCode: "localhost:5173/finetune",
    badgeClass: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
    iconBg: "bg-fuchsia-500/10",
    iconColor: "text-fuchsia-400",
  },
];

export function HowItWorksCards() {
  return (
    <div className="w-full max-w-[880px]">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/40 text-center mb-6">
        How it works
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-0">
        {STEPS.map((step, i) => (
          <div key={step.num} className="contents">
            {i > 0 && <ConnectorArrow />}
            <StepCard step={step} />
          </div>
        ))}
      </div>

    </div>
  );
}

function StepCard({ step }: { readonly step: StepDef }) {
  return (
    <div className={cn(
      "relative flex flex-col items-start text-left p-5 pt-7 rounded-2xl border transition-all duration-300",
      step.isPrimary
        ? "border-[rgba(var(--theme-500),0.2)] bg-card/80 shadow-[0_0_40px_-12px_rgba(var(--theme-500),0.12)]"
        : "border-border/20 bg-card/40 hover:border-border/40 hover:bg-card/60",
    )}>
      <span className={`absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${step.badgeClass}`}>
        Step {step.num}
      </span>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3.5 ${step.iconBg}`}>
        <step.icon className={`w-5 h-5 ${step.iconColor}`} />
      </div>
      <h3 className="text-[13px] font-bold mb-1.5 tracking-tight">{step.title}</h3>
      <p className="text-[12px] text-muted-foreground/70 leading-relaxed mb-3 flex-1">{step.description}</p>
      {step.miniCode && (
        <div className="w-full px-3 py-2 bg-black/30 rounded-md border border-white/[0.04] font-mono text-[11px] text-muted-foreground/50 truncate">
          <span className="text-[rgb(var(--theme-400))]">{step.miniCodeCmd}</span>{" "}
          <span className="text-pink-400/70">{step.miniCode}</span>
        </div>
      )}
    </div>
  );
}

function ConnectorArrow() {
  return (
    <div className="flex items-center justify-center pt-12 px-1.5">
      <div className="relative w-6 flex items-center">
        <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-gradient-to-r from-border/40 to-border/40" />
        <ChevronRight className="w-4 h-4 text-muted-foreground/25 relative z-10 mx-auto" />
      </div>
    </div>
  );
}


/**
 * HowItWorksCards
 *
 * 3-card stepper showing the skill-first workflow:
 * Install Skill → Run Pipeline → Evaluate & Train.
 */

import { Monitor, Terminal, PieChart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StepCardProps {
  readonly step: number;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly miniCode?: string;
  readonly stepColor: string;
  readonly iconBg: string;
  readonly iconColor: string;
}

function StepCard({ step, icon: Icon, title, description, miniCode, stepColor, iconBg, iconColor }: StepCardProps) {
  return (
    <div className="relative flex flex-col items-start text-left p-6 pt-7 rounded-2xl border border-border/30 bg-card/50 hover:border-border/60 hover:bg-card/80 transition-all duration-300 hover:-translate-y-0.5">
      <span className={`absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${stepColor}`}>
        Step {step}
      </span>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${iconBg}`}>
        <Icon className={`w-[22px] h-[22px] ${iconColor}`} />
      </div>
      <h3 className="text-sm font-bold mb-1.5 tracking-tight">{title}</h3>
      <p className="text-[12.5px] text-muted-foreground leading-relaxed">{description}</p>
      {miniCode && (
        <div className="mt-3 w-full px-3 py-2 bg-black/30 rounded-md border border-white/[0.04] font-mono text-[11px] text-muted-foreground/60">
          <span className="text-[rgb(var(--theme-400))]">{miniCode.split(" ")[0]}</span>{" "}
          <span className="text-pink-400">{miniCode.split(" ").slice(1).join(" ")}</span>
        </div>
      )}
    </div>
  );
}

const STEPS: Omit<StepCardProps, "step">[] = [
  {
    icon: Monitor,
    title: "Install the Skill",
    description: "Copy the finetune skill into your project. Works with Claude Code and Codex.",
    miniCode: "cp -r finetune-skill/ your-project/",
    stepColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-400",
  },
  {
    icon: Terminal,
    title: "Run the Pipeline",
    description: "The skill extracts docs, builds topics, generates training records, and writes a grader — automatically.",
    miniCode: 'claude "finetune doc.pdf"',
    stepColor: "bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-400))] border-[rgba(var(--theme-500),0.25)]",
    iconBg: "bg-[rgba(var(--theme-500),0.1)]",
    iconColor: "text-[rgb(var(--theme-400))]",
  },
  {
    icon: PieChart,
    title: "Evaluate & Train",
    description: "Review topics and records in the UI. Run evaluations, iterate on quality, then train your model.",
    stepColor: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
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
      <div className="grid grid-cols-3 gap-4">
        {STEPS.map((step, i) => (
          <StepCard key={step.title} step={i + 1} {...step} />
        ))}
      </div>
    </div>
  );
}

/**
 * WelcomeFlow
 *
 * First-time user onboarding. Three short stages explain the skill-first
 * mental model, let the user pick their first input ingredient, and dismiss
 * to the regular empty state.
 *
 * Mounted from EmptyDatasetsState when:
 *   - the user has no datasets, AND
 *   - localStorage `vllora_onboarding_v2_completed` is not set.
 *
 * Stages:
 *   1. How vLLora works (3-panel diagram + install command)
 *   2. Pick your first input (Documents | OTel traces | Just describe it)
 *   3. (skipped here — handed off to the existing per-input flow)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Sparkles,
  FileText,
  MessageSquare,
  Wand2,
  Terminal,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ONBOARDING_KEY = 'vllora_onboarding_v2_completed';
const SKILL_INSTALL_CMD =
  'curl -sSL https://vllora.dev/install-skill.sh | bash';

export function isOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(ONBOARDING_KEY) === '1';
}

function markOnboardingCompleted(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_KEY, '1');
}

interface WelcomeFlowProps {
  /** Called when the user finishes (or skips) onboarding. */
  readonly onComplete: () => void;
  /** Called when the user picks "Just describe it" — parent shows objective tab. */
  readonly onPickObjective: () => void;
  /** Called when the user picks "Documents" — parent shows the upload tab. */
  readonly onPickDocuments: () => void;
}

type Stage = 'how' | 'pick';

export function WelcomeFlow({ onComplete, onPickObjective, onPickDocuments }: WelcomeFlowProps) {
  const [stage, setStage] = useState<Stage>('how');
  const navigate = useNavigate();

  const handleComplete = (action: () => void) => {
    markOnboardingCompleted();
    onComplete();
    action();
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-background p-6">
      <div className="w-full max-w-4xl">
        <ProgressDots stage={stage} />

        {stage === 'how' && (
          <HowItWorks
            onNext={() => setStage('pick')}
            onSkip={() => handleComplete(() => undefined)}
          />
        )}
        {stage === 'pick' && (
          <PickFirstInput
            onPickDocuments={() => handleComplete(onPickDocuments)}
            onPickTraces={() => handleComplete(() => navigate('/otel-traces'))}
            onPickObjective={() => handleComplete(onPickObjective)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Progress dots ───────────────────────────────────────────────────────────

function ProgressDots({ stage }: { stage: Stage }) {
  const stages: Stage[] = ['how', 'pick'];
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {stages.map((s) => (
        <div
          key={s}
          className={cn(
            'h-1.5 w-12 rounded-full transition-colors',
            s === stage ? 'bg-primary' : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}

// ─── Stage 1: How it works ───────────────────────────────────────────────────

function HowItWorks({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(SKILL_INSTALL_CMD);
      setCopied(true);
      toast.success('Install command copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — please copy manually');
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
      <div className="mb-6 text-center">
        <Badge variant="outline" className="mb-3 gap-1">
          <Sparkles className="h-3 w-3" />
          Welcome
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">How vLLora works</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          vLLora is skill-first. The fine-tuning pipeline runs in your terminal as a
          Claude Code skill. This UI is where you watch it happen and feed it inputs.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <DiagramTile
          icon={<Terminal className="h-5 w-5" />}
          title="The skill"
          body="A Claude Code skill that lives in your project. It owns the 6-step pipeline: extract → topics → records → grader → eval → train."
          accent="bg-amber-500/10 text-amber-300"
        />
        <ArrowConnector />
        <DiagramTile
          icon={<FileText className="h-5 w-5" />}
          title="Inputs"
          body="Two kinds of ingredients: documents (PDFs, runbooks) and OpenTelemetry GenAI traces (logs from your existing LLM apps)."
          accent="bg-sky-500/10 text-sky-300"
        />
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="hidden md:block" />
        <ArrowConnector vertical />
        <DiagramTile
          icon={<Sparkles className="h-5 w-5" />}
          title="Finetuned model"
          body="The skill writes everything to vLLora. This UI visualizes records, topics, evals, and training so you can iterate."
          accent="bg-emerald-500/10 text-emerald-300"
        />
      </div>

      <div className="mb-6 rounded-lg border border-border/60 bg-muted/30 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step 1 — install the skill in your project
        </p>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-sm">
          <code className="truncate">{SKILL_INSTALL_CMD}</code>
          <Button variant="ghost" size="sm" onClick={copyCommand}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip onboarding
        </Button>
        <Button onClick={onNext} className="gap-2">
          Next: pick your first input
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DiagramTile({
  icon,
  title,
  body,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-5">
      <div className={cn('mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg', accent)}>
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ArrowConnector({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className="flex items-center justify-center text-muted-foreground">
      <ArrowRight className={cn('h-5 w-5', vertical && 'rotate-90 md:rotate-0')} />
    </div>
  );
}

// ─── Stage 2: Pick first input ───────────────────────────────────────────────

function PickFirstInput({
  onPickDocuments,
  onPickTraces,
  onPickObjective,
}: {
  onPickDocuments: () => void;
  onPickTraces: () => void;
  onPickObjective: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pick your first input</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          The skill needs something to learn from. You can mix and match later — start
          with whatever you have on hand.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InputTile
          icon={<FileText className="h-6 w-6" />}
          accent="bg-sky-500/10 text-sky-300"
          title="Documents"
          body="PDFs, runbooks, manuals, internal wikis. Best when you want the model to learn knowledge from a body of text."
          good="Best for knowledge distillation"
          onClick={onPickDocuments}
        />
        <InputTile
          icon={<MessageSquare className="h-6 w-6" />}
          accent="bg-violet-500/10 text-violet-300"
          title="OTel traces"
          body="Logs from your existing LLM app via OpenTelemetry GenAI conventions. Best when you already have a model in production and want to clone its behavior."
          good="Best for behavior cloning"
          badge="New"
          onClick={onPickTraces}
        />
        <InputTile
          icon={<Wand2 className="h-6 w-6" />}
          accent="bg-emerald-500/10 text-emerald-300"
          title="Just describe it"
          body="Tell us what you want the model to do. We'll bootstrap a starter dataset for you to refine."
          good="Best when you have neither"
          onClick={onPickObjective}
        />
      </div>
    </div>
  );
}

function InputTile({
  icon,
  accent,
  title,
  body,
  good,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  body: string;
  good: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-xl border border-border/60 bg-background p-5 text-left transition-colors hover:border-primary/60 hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg', accent)}>
          {icon}
        </div>
        {badge && (
          <Badge variant="outline" className="text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
        {good}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

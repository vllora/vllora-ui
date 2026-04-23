# Onboarding Flow — Skill-First Architecture

## Overview

The onboarding flow guides new users from their first visit to the vLLora UI through setting up the finetune skill, running the pipeline externally (via Claude Code or Codex), and returning to the UI to evaluate and train.

**Key principle**: The pipeline is driven _outside_ the UI by the finetune skill. The UI is a visualization and evaluation layer. The onboarding must educate users about this split.

**Design inspiration**: Sentry (waiting-for-first-event animation), Weights & Biases (CLI prints dashboard URL), Grafana (sample data), Datadog (agent checklist), Vercel (progress flow).

## User Journey (6 Screens)

```
Homepage → Setup Guide → Workflows (Empty) → Waiting for Skill → Workflows (With Data) → Workflow Detail
```

### Screen 1: Homepage

**URL**: `/`
**Component**: `src/pages/home/FinetuneStudioTab.tsx`
**Sub-component**: `src/pages/home/HowItWorksCards.tsx`

**What the user sees:**
- Hero: "From idea to finetuned model"
- "How it works" 3-card stepper:
  1. **Install the Skill** (indigo) — copy skill to project
  2. **Run the Pipeline** (emerald) — `claude "finetune doc.pdf"`
  3. **Evaluate & Train** (fuchsia) — review in UI
- CTA: "Get Started" → `/finetune/setup`
- CTA: "I already have workflows" → `/finetune`
- Alt pathways: "Route existing API calls" (for API trace capture), "View documentation"

**Key files:**
| File | Purpose |
|------|---------|
| `src/pages/home/index.tsx` | HomePage with tab toggle (Finetune Studio / LLM Gateway) |
| `src/pages/home/FinetuneStudioTab.tsx` | Finetune tab content — hero + how-it-works + CTAs |
| `src/pages/home/HowItWorksCards.tsx` | 3-card stepper component |
| `src/components/datasets/empty-dataset-state/FinetuneHero.tsx` | Shared hero heading |

---

### Screen 2: Setup Guide

**URL**: `/finetune/setup`
**Component**: `src/pages/finetune/setup.tsx`

**What the user sees:**
4-step vertical guide with numbered circles and code blocks:

1. **Prerequisites** — install Claude Code or Codex, ensure backend running
2. **Copy the skill** — `cp -r finetune-skill/ your-project/.claude/skills/finetune/`
3. **Run the pipeline** — `claude "finetune chess-tactics.pdf as a chess tutor"`, shows pipeline stages (Extract → Topics → Records → Grader), terminal output preview with dashboard URL
4. **Evaluate and train** — checklist of what the UI enables

**Key files:**
| File | Purpose |
|------|---------|
| `src/pages/finetune/setup.tsx` | Full setup guide page |
| `src/components/onboarding/CodeBlock.tsx` | Styled code block with copy button and syntax helpers |
| `src/components/onboarding/PipelineFlowBadges.tsx` | Horizontal pipeline visualization badges |

**Route**: Added in `src/App.tsx` as `<Route path="finetune/setup" element={<SetupGuidePage />} />`

---

### Screen 3: Workflows (Empty)

**URL**: `/finetune`
**Component**: `src/components/datasets/table/DatasetsEmptyState.tsx`

**What the user sees:**
- Sentry-style animated "waiting orb" (spinning ring + pulsing outer glow)
- "Waiting for your first workflow"
- Terminal hint: `claude "finetune your-document.pdf"`
- Buttons: "View Setup Guide" → `/finetune/setup`, "Refresh" (re-fetches datasets)
- "Try with sample data" card at bottom

**Key files:**
| File | Purpose |
|------|---------|
| `src/components/datasets/table/DatasetsEmptyState.tsx` | Empty state with waiting animation |
| `src/components/onboarding/WaitingOrb.tsx` | Reusable animated orb component |
| `src/components/onboarding/TerminalHint.tsx` | CLI command hint block |
| `src/pages/datasets/index.tsx` | DatasetsPage — renders `DatasetsEmptyState` when no datasets |

---

### Screen 4: Waiting for Skill

**URL**: `/finetune/:workflowId` (when workflow exists but has no topics/records)
**Component**: `src/components/datasets/dataset-canvas/CanvasEmptyState.tsx`

**What the user sees (when knowledge sources exist but no topics):**
- Smaller WaitingOrb with terminal icon
- "Pipeline is running" heading
- Live progress tracker showing pipeline steps:
  - Document uploaded ✓
  - Extracting content... (active/pulsing)
  - Building topic hierarchy (pending)
  - Generating training records (pending)
  - Writing grader (pending)
- "Check your Claude Code terminal for detailed progress" hint

**State detection**: The component receives `hasKnowledgeSources` and `partCount` props. If knowledge sources exist, it shows the "skill running" state. Otherwise, it shows the generic "no data" state with setup guide link.

**Key files:**
| File | Purpose |
|------|---------|
| `src/components/datasets/dataset-canvas/CanvasEmptyState.tsx` | Two-mode empty state (skill running vs no data) |

---

### Screen 5: Workflows (With Data)

**URL**: `/finetune`
**Component**: `src/components/datasets/table/DatasetsGrid.tsx` (existing)

**What the user sees:**
- List of workflow cards with metadata (topics, records, sources, time)
- Status badges: "Ready to evaluate", "Training", "Skill running"
- **"+ New Workflow" dropdown** in the header with two options:
  - "Run finetune skill" → `/finetune/setup`
  - "Route existing API calls" → `/finetune/new?tab=api`
- The old "+ New Workflow" card in the grid has been removed (it implied the UI drives creation)

**Key files:**
| File | Purpose |
|------|---------|
| `src/components/datasets/table/DatasetsListHeader.tsx` | Header with search, filters, sort, and "New Workflow" dropdown |
| `src/components/datasets/table/DatasetsGrid.tsx` | Grid of workflow cards (AddDatasetCard removed) |

---

### Screen 6: Workflow Detail

**URL**: `/finetune/:workflowId`
**Component**: `src/components/datasets/DatasetDetailContentV2.tsx` (existing)

**What the user sees:**
- Explorer sidebar with topics, sources, eval, training sections
- Data Flow Banner: Documents → Extracted → Topics → Records
- Canvas with topic nodes showing coverage bars and quality scores
- Action bar: "Run Evaluation" button

This screen exists and works as-is.

---

## Shared Onboarding Components

All in `src/components/onboarding/`:

| Component | Purpose | Used By |
|-----------|---------|---------|
| `WaitingOrb.tsx` | Animated spinning/pulsing orb | DatasetsEmptyState, CanvasEmptyState |
| `CodeBlock.tsx` | Code block with copy + syntax helpers (`Cmd`, `Str`, `Comment`, `Output`) | SetupGuidePage |
| `PipelineFlowBadges.tsx` | Horizontal pipeline stage badges | SetupGuidePage |
| `TerminalHint.tsx` | Compact CLI command hint | DatasetsEmptyState, CanvasEmptyState |

## Tailwind Config

Added to `tailwind.config.js`:
- Keyframe `pulse-out`: scale/opacity pulse for the WaitingOrb outer ring
- Animation `pulse-out`: `pulse-out 3s ease-in-out infinite`

## Design Mockup

Interactive HTML mockup showing all 6 screens: `docs/workflow-skill-first-approach/mockup-onboarding-flow.html`

Open with: `open docs/workflow-skill-first-approach/mockup-onboarding-flow.html`

## Debugging Guide

**User stuck on empty state?**
1. Check if backend is running (`localhost:9090`)
2. Check if skill was run — look at `~/.vllora/vllora.db` for workflow records
3. Check if the DatasetsProvider is fetching — network tab should show `GET /workflows`

**Setup page not rendering?**
1. Check route exists in `src/App.tsx` — `/finetune/setup`
2. Component is `SetupGuidePage` from `src/pages/finetune/setup.tsx`

**Canvas shows wrong empty state?**
1. `CanvasEmptyState` checks `hasKnowledgeSources` prop
2. If true → shows "Pipeline is running" with progress tracker
3. If false → shows "No topics yet" with setup guide link
4. The calling component (`TopicHierarchyCanvas.tsx`) needs to pass these props

**WaitingOrb animation not working?**
1. Check `tailwind.config.js` has `pulse-out` keyframe and animation
2. The orb uses Tailwind's built-in `animate-spin` plus the custom `animate-[pulse-out_3s_ease-in-out_infinite]`

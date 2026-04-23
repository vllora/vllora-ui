# Trace Influence UI — Design Document

> **Purpose**: A dedicated, professional UI view showing users exactly how production traces shaped their training data.
> **Audience**: Non-expert users who need to understand what happened without ML jargon.
> **Date**: 2026-04-15
> **Status**: Design

## Problem

Users have two data sources (PDFs + OTel traces) feeding into a finetune pipeline. Traces influence the training in 5 ways (system prompt, topics, record allocation, seed queries, grader). But the current UI doesn't show ANY of this — users have no visibility into:
- What the traces told us (failure rates, user patterns)
- How that changed the training (which topics got more data, which prompt was used)
- Whether the influence was correct (data quality)

Without this visibility, users can't trust or debug their training pipeline.

## Research Summary

### Design patterns from best-in-class platforms

| Platform | Key Pattern | What We Adapt |
|----------|-------------|---------------|
| Apple Health | Hero metric + trend + sparkline | Influence Summary metrics row |
| Snorkel AI | Labeling function coverage + precision table | Per-channel influence table |
| Evidently AI | Traffic-light pass/fail checklist | Data quality report section |
| Great Expectations | Natural language assertions | Plain-language check descriptions |
| dbt | Left-to-right DAG with detail panel | Simplified influence flow diagram |
| Linear/Notion | Summary cards → collapsible detail | Progressive disclosure layout |
| HuggingFace | Data Cards with structured sections | Structured influence summary |
| SHAP/LIME | "Top 3 reasons" ranked list | Attribution list per record |

### Key UX principles (Nielsen Norman Group)

1. **Minimum viable summary first** — show 4-5 numbers that tell the story
2. **Staged disclosure** — summary → overview → detail (not binary show/hide)
3. **Label the disclosure** — "Show 12 more details" not just a chevron
4. **Plain language** — no ML jargon. "Real customer questions" not "seed queries"
5. **Semantic colors** — green=good, amber=attention, red=problem. Always paired with icon+text

## Design

### Location in UI

New section in the sidebar between "Source Materials" and "Teaching Examples":

```
Source Materials
  ├── PDF: retail-policy.pdf
  └── OTel Traces (460 conversations)
Trace Influence          ← NEW (top-level, always visible when traces exist)
Teaching Examples
Quality Checker
...
```

**Route**: `trace-influence` in TabContentRouter
**Context**: `TraceInfluenceContext` (loads analysis.json + data-quality-report.json + trace-analysis artifacts)

### Component Architecture

```
TraceInfluenceView.tsx           (main container)
├── InfluenceSummaryCards.tsx     (hero metrics row — 5 cards)
├── InfluenceFlowDiagram.tsx     (simplified pipeline flow)
├── InfluenceChannels.tsx        (5 expandable channel sections)
│   ├── SystemPromptChannel      (production prompt comparison)
│   ├── TopicChannel             (trace-discovered topics)
│   ├── AllocationChannel        (priority-weighted distribution)
│   ├── SeedQueryChannel         (real user queries)
│   └── GraderChannel            (failure dimensions)
└── DataQualityReport.tsx        (traffic-light checklist)
```

### Section 1: Influence Summary Cards (always visible)

Following the Apple Health hero-metric pattern. A horizontal row of 5 cards, each showing one key metric with plain-language label:

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  460             │ │  10             │ │  52             │ │  12→50          │ │  34             │
│  Conversations   │ │  Failure        │ │  Real Customer  │ │  Record         │ │  Grader         │
│  Analyzed        │ │  Patterns Found │ │  Questions Used │ │  Rebalancing    │ │  Criteria       │
│  ───────         │ │  ───────        │ │  ───────        │ │  ───────        │ │  ───────        │
│  from production │ │  across 10 skills│ │  17% of data   │ │  high-fail +3x  │ │  from failures  │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

Each card:
- Large number (text-2xl font-bold)
- Title (text-xs font-medium)
- Subtitle (text-[10px] text-muted-foreground)
- Clickable → scrolls to corresponding channel section

**Tailwind**: `grid grid-cols-5 gap-3` with `bg-muted/20 border border-border/50 rounded-lg p-4`

### Section 2: Influence Flow Diagram (collapsible, open by default)

A simplified 3-column horizontal flow showing inputs → influence → outputs. NOT a full Sankey/DAG — just a clean labeled diagram.

```
  PRODUCTION DATA          HOW IT INFLUENCED          YOUR TRAINING
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│ 460 Conversations│──▶ │ System Prompt        │──▶│ 369 Records      │
│ 10 Action Types  │──▶ │ Topic Discovery      │──▶│ 12 Skills        │
│ Failure Patterns │──▶ │ Priority Allocation  │──▶│ Weighted by Fail%│
│ User Queries     │──▶ │ Seed Injection (17%) │──▶│ 52 Real Queries  │
│ Error Dimensions │──▶ │ Grader Criteria      │──▶│ 34 Scoring Rules │
└──────────────────┘    └─────────────────────┘    └──────────────────┘
```

Implementation: Pure CSS/SVG, no library dependency. Use `flex` layout with connecting lines. Each box is a `div` with the standard card pattern.

### Section 3: Influence Channels (5 expandable accordions)

Each channel follows the established `PipelineAnalysisView` pattern: summary always visible, detail on expand.

#### Channel 1: System Prompt
**Summary line**: "Using production prompt (500 chars) — matches what the model sees at inference."
**Expanded detail**:
- Show the actual prompt text (monospace, `bg-muted/10 p-3 rounded`)
- Badge: "From traces" (blue) vs "Custom" (amber warning)
- If custom was overridden: show diff-style comparison with highlight

#### Channel 2: Topic Discovery
**Summary line**: "10 skills discovered from traces, 2 added from documents."
**Expanded detail**:
- Table: Topic | Source (trace/PDF/both) | Trace Frequency | Failure Rate
- Badge per topic: `bg-blue-500/10` for trace-discovered, `bg-amber-500/10` for PDF-only

#### Channel 3: Record Allocation
**Summary line**: "High-failure skills get 2-3x more examples. address-modify: 50 records vs payment-modify: 25."
**Expanded detail**:
- Horizontal bar chart (recharts BarChart): records per topic, colored by priority tier
  - High priority (emerald): top 1/3 by failure rate
  - Medium (blue): middle 1/3
  - Low (zinc): bottom 1/3
- Table below: Topic | Trace Frequency | Failure Rate | Priority Score | Records Allocated

#### Channel 4: Seed Queries
**Summary line**: "52 real customer questions injected (17% of training data)."
**Expanded detail**:
- Per-topic count table: Topic | Seeds Injected | Alignment Score
- Expandable sample queries per topic (show 3, "Show N more")
- Badge: alignment score per topic (emerald if >90%, amber if 70-90%, red if <70%)

#### Channel 5: Grader Criteria
**Summary line**: "34 scoring criteria derived from production failure patterns."
**Expanded detail**:
- Table: Dimension | Source (trace failure / prompt rule) | Failure Rate
- Highlight top 5 by failure rate
- Badge: "Essential" (from high-failure traces) vs "Standard" (from prompt rules)

### Section 4: Data Quality Report (collapsible)

Traffic-light checklist following the Evidently AI / Great Expectations pattern:

```
Data Quality Checks
  ✓ Seed-topic alignment: 98% of real queries match their assigned skill          [PASS]
  ✓ Answer coverage: 100% of examples have answer keys                            [PASS]
  ⚠ Answer uniqueness: 72 examples share duplicate answer keys (cap at 2)        [WARN]
  ✓ Prompt diversity: 0 near-duplicate prompts found                              [PASS]
  ✓ Topic balance: all skills have 25+ examples                                   [PASS]
```

Each check:
- Status icon (✓ emerald, ⚠ amber, ✗ red)
- Plain-English description (no jargon)
- Actual value + threshold
- Expandable: affected records/topics on expand

### Visual Language

**Colors** (match existing codebase):
- Trace-sourced: `bg-blue-500/10 text-blue-600` (consistent with QueryOriginBadge)
- PDF-sourced: `bg-amber-500/10 text-amber-600`
- Both sources: `bg-emerald-500/10 text-emerald-600`
- Quality pass: emerald, warn: amber, fail: red

**Typography** (match existing):
- Section headers: `text-sm font-semibold` with icon
- Metrics: `text-2xl font-bold tabular-nums`
- Labels: `text-xs font-medium`
- Descriptions: `text-xs text-muted-foreground leading-relaxed`
- Code/IDs: `font-mono text-xs`

**Spacing** (match existing):
- Section gap: `space-y-6`
- Card padding: `p-4`
- Inner gap: `gap-3`

### Data Flow

```
Gateway API                              UI Context                    Components
─────────────                            ──────────                    ──────────
GET /trace-analysis     ──→  TraceAnalysisContext     ──→  InfluenceFlowDiagram
GET /analysis.json      ──→  PipelineAnalysisContext  ──→  InfluenceSummaryCards
data-quality-report.json ─→  TraceInfluenceContext    ──→  DataQualityReport
training.jsonl stats    ──→  (derived in context)     ──→  InfluenceChannels
```

**New context**: `TraceInfluenceContext.tsx`
- Combines data from TraceAnalysisContext + PipelineAnalysisContext + quality report
- Computes derived metrics (seed count, alignment score, source attribution per topic)
- Provides: `influenceSummary`, `channels`, `qualityReport`, `isLoading`

### Empty State

When no traces are available (PDF-only mode):
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│      [Layers icon]                                  │
│                                                     │
│      No Production Traces Available                 │
│                                                     │
│      Add OTel traces to see how production          │
│      data can improve your training pipeline.       │
│                                                     │
│      [Learn More]                                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Accessibility

- All colors paired with icons + text (not color-alone encoding)
- Keyboard navigable (accordions use Radix Accordion)
- Screen-reader labels on all interactive elements
- Plain language throughout — tested against "would my non-technical PM understand this?"

## File Plan

```
src/components/datasets/trace-influence/
├── TraceInfluenceView.tsx          (~200 lines — main container)
├── InfluenceSummaryCards.tsx        (~100 lines — hero metrics)
├── InfluenceFlowDiagram.tsx        (~120 lines — 3-column flow)
├── InfluenceChannels.tsx           (~250 lines — 5 accordions)
├── DataQualityReport.tsx           (~120 lines — traffic-light checklist)
└── influence-utils.ts              (~50 lines — data transformation helpers)

src/contexts/
└── TraceInfluenceContext.tsx        (~80 lines — combines existing contexts)

src/components/datasets/sidebars/DatasetExplorer.tsx   (add sidebar entry)
src/components/datasets/TabContentRouter.tsx            (add route)
```

**Estimated total**: ~920 lines across 8 files. No new dependencies.

## Implementation Order

1. `TraceInfluenceContext.tsx` — data layer
2. `TraceInfluenceView.tsx` + `InfluenceSummaryCards.tsx` — skeleton + hero metrics
3. `InfluenceChannels.tsx` — 5 expandable channel sections
4. `DataQualityReport.tsx` — quality checklist
5. `InfluenceFlowDiagram.tsx` — visual flow (last, because it's the most complex)
6. Sidebar + routing integration
7. Visual polish + responsive

## References

- Apple Health — hero metric + sparkline pattern
- Snorkel AI — labeling function influence analysis
- Evidently AI — traffic-light data quality reports
- Great Expectations — natural language validation assertions
- dbt — simplified DAG lineage visualization
- Linear/Notion — progressive disclosure with collapsible sections
- HuggingFace Data Cards — structured data documentation
- SHAP — feature importance "top N reasons" pattern
- Nielsen Norman Group — progressive disclosure research
- Google Model Cards — structured ML transparency

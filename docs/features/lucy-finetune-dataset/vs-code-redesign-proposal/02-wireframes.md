# Wireframes — All Major UI States

> ASCII wireframes for every key state in the redesigned Lucy Finetune experience.
> Architectural decision: **Vision A** — full VS Code file/tab model. See [README](./README.md).

---

## W1. Main Workspace — Desktop (1920px) — Lucy Sidebar Active

The primary view. Sidebar shows Lucy Chat. Workspace shows dynamic editor tabs (Vision A).

```
┌──────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│ SIDEBAR (340px)                  │ WORKSPACE                                                    │
├──────────────────────────────────┤──────────────────────────────────────────────────────────────┤
│ [Explorer] [Lucy]        [collapse] │ Chess Training Dataset                                  [edit] │
│                                  │ Objective: Train model for chess move evaluation...          │
├──────────────────────────────────┤──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐ │ TABS                                                         │
│ │ [avatar] Lucy Assistant BETA │ │ [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]       │
│ │              [+New] [close]  │ │                                                              │
│ └──────────────────────────────┘ ├──────────────────────────────────────────────────────────────┤
│                                  │                                                              │
│  ┌────────────────────────────┐  │  ┌──────────────────────────────────────────────────────┐    │
│  │ Hi! I'm Lucy, your        │  │  │  [Table] [Canvas]  Search...  [Import] [Export]       │    │
│  │ fine-tuning assistant.     │  │  │                                                      │    │
│  │ I've analyzed your         │  │  │  > Openings (85)                                     │    │
│  │ 3 documents and here's     │  │  │    Record #1  USR: "What's the best opening..."      │    │
│  │ what I found...            │  │  │    Record #2  USR: "Explain the Sicilian Defense..." │    │
│  │                            │  │  │  > Endgames (62)                                     │    │
│  │ Your dataset has strong    │  │  │    Record #4  USR: "King and pawn endgame basics..." │    │
│  │ coverage in openings       │  │  │  > Tactics (50)                                      │    │
│  │ but needs more endgame     │  │  │    Record #5  USR: "Pin vs skewer difference..."     │    │
│  │ data.                      │  │  │  > Strategy (50)                                      │    │
│  └────────────────────────────┘  │  │    ...                                               │    │
│                                  │  └──────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────┐  │                                                              │
│  │ Quick actions:             │  │                                                              │
│  │ [Start setup]              │  │                                                              │
│  │ [Create examples]          │  │                                                              │
│  │ [Check variety]            │  │                                                              │
│  └────────────────────────────┘  │                                                              │
│                                  │                                                              │
│  ┌────────────────────────────┐  │                                                              │
│  │ Ask Lucy...           [clip] │  │                                                              │
│  └────────────────────────────┘  │                                                              │
└──────────────────────────────────┴──────────────────────────────────────────────────────────────┘
          340px                                     flex-1
```

---

## W2. Main Workspace — Explorer Sidebar Active (File-Tree)

Same layout with Explorer panel showing dataset as a VS Code-style file tree. Clicking any file opens it as a dynamic, closeable tab in the workspace. Single-click = preview tab (italic), double-click = pinned tab.

```
┌──────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│ SIDEBAR (340px)                  │ WORKSPACE                                                    │
├──────────────────────────────────┤──────────────────────────────────────────────────────────────┤
│ [Explorer] [Lucy dot-2]  [collapse] │ Chess Training Dataset                                  [edit] │
│                                  │ Objective: Train model for chess move evaluation...          │
├──────────────────────────────────┤──────────────────────────────────────────────────────────────┤
│                                  │ TABS (dynamic, closeable)                                    │
│ CHESS TRAINING DATASET           │ [grader-script.ts ×]  [record-001 ×]  [ft-chess-v2 ×]       │
│ In Fine-tune · 247 records       ├──────────────────────────────────────────────────────────────┤
│                                  │                                                              │
│ 📄 readme.md                     │  ┌──────────────────────────────────────────────────────────┐ │
│ 📄 plan.md                       │  │ Grader Script     [JS] [Copy] [Template] [Run]           │ │
│ 📄 tasks.md                      │  ├──────────────────────────────────────────────────────────┤ │
│ 📄 logs.md                       │  │  1 │ export default function evaluate(record) {          │ │
│                                  │  │  2 │   const messages = record.messages;                 │ │
│ 📁 documents/                    │  │  3 │   const lastAssistant = messages.filter(            │ │
│   📄 chess-openings.pdf   done   │  │  4 │     m => m.role === 'assistant'                     │ │
│   📄 chess-openings.md    done   │  │  5 │   ).pop();                                         │ │
│   📄 tactics-guide.pdf    done   │  │  6 │   return { score: checkRelevance(...) };            │ │
│   📄 tactics-guide.md     done   │  └──────────────────────────────────────────────────────────┘ │
│   📄 endgame-manual.pdf loading  │                                                              │
│                                  │                                                              │
│ 📁 topics/                       │                                                              │
│   📁 openings/ (85)              │                                                              │
│   📁 endgames/ (62)              │                                                              │
│   📁 tactics/ (50)               │                                                              │
│   📁 strategy/ (50)              │                                                              │
│   📁 puzzles/ (0)                │                                                              │
│                                  │                                                              │
│ 📁 evaluations/                  │                                                              │
│   📄 grader-script.ts    <--     │  <-- opened in workspace as active tab                      │
│   📁 jobs/                       │                                                              │
│     📄 dry-run-001.json  pass    │                                                              │
│     📄 dry-run-002.json  fail    │                                                              │
│                                  │                                                              │
│ 📁 finetune/                     │                                                              │
│   📄 ft-chess-v2.json running    │                                                              │
│   📄 ft-chess-v1.json  done      │                                                              │
│                                  │                                                              │
│ 📁 quick-stats/                  │                                                              │
│   📄 coverage.md                 │                                                              │
│   📄 balance.md                  │                                                              │
│   📄 quality-scores.md           │                                                              │
└──────────────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## W3. Narrow Viewport (1024px) — Sidebar Auto-Collapsed

At 1024px, sidebar auto-collapses. Lucy indicators show on the collapsed strip.

```
┌──────┬──────────────────────────────────────────────────────────────────────┐
│      │ Chess Training Dataset                [Plan] [Readme] [Docs 3]      │
│ pulsing │ Objective: Train model for chess...  [edit]                          │
│      ├──────────────────────────────────────────────────────────────────────┤
│ [L]  │  [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]             │
│      ├──────────────────────────────────────────────────────────────────────┤
│ dot-2 │  [Table] [Canvas]  Search...  [Import] [Export]                     │
│      │                                                                      │
│ [expand] │  > Openings (85)                                                    │
│      │    Record #1  USR: "What's the best opening..."                     │
│      │    Record #2  USR: "Explain the Sicilian Defense..."                │
│      │  > Endgames (62)                                                    │
│      │    ...                                                              │
└──────┴──────────────────────────────────────────────────────────────────────┘
  ^
  Collapsed sidebar: 56px (w-14)
  - pulsing = themed dot (Lucy working)
  - [L] = Lucy avatar (click to expand)
  - dot-2 = 2 unread messages
  - [expand] = expand button
```

---

## W4. Plan Proposed — PlanCard in Sidebar + Plan Tab in Workspace

When Lucy proposes a plan, the **PlanCard** appears sticky above chat. Clicking "View full plan" opens the Plan in the workspace.

```
┌──────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│ SIDEBAR (340px) — Lucy tab       │ WORKSPACE                                                    │
├──────────────────────────────────┤──────────────────────────────────────────────────────────────┤
│ [Explorer] [Lucy]        [collapse] │ Chess Training Dataset                                  [edit] │
├──────────────────────────────────┤──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐ │ [Data x] [Plan dot x]                                        │
│ │ [avatar] Lucy Assistant BETA │ │          ^^^^^^^^^^^ (active, dot = needs action)             │
│ └──────────────────────────────┘ ├──────────────────────────────────────────────────────────────┤
│                                  │ Plan                            [Edit] [Approve & Execute]    │
│ ┌ PlanCard (sticky) ───────────┐ ├──────────────────────────────────────────────────────────────┤
│ │ Chess Training Plan          │ │                                                              │
│ │                              │ │  # Chess Training Dataset                                    │
│ │ 5 topics · 250 records       │ │  > Train a model to play chess by evaluating moves...        │
│ │ 2 eval criteria              │ │                                                              │
│ │ ~8 min estimated             │ │  ## Training Topics                                          │
│ │                              │ │  | Topic     | Count | Description                    |     │
│ │ [Approve] [Edit] [Dismiss]   │ │  |-----------|-------|--------------------------------|     │
│ │                              │ │  | Openings  | 50    | Standard opening theory        |     │
│ │ View full plan               │ │  | Endgames  | 50    | King+pawn, rook endings        |     │
│ └──────────────────────────────┘ │  | Tactics   | 50    | Pins, forks, skewers           |     │
│                                  │  | Strategy  | 50    | Positional play                |     │
│  "I've analyzed your docs and    │  | Puzzles   | 50    | Mate-in-N problems             |     │
│   created a setup plan. Review   │                                                              │
│   the plan and approve when      │  ## Execution Steps                                          │
│   ready, or ask me to adjust."   │  1. Apply Topics · ~30s                                      │
│                                  │  2. Generate Training Data · ~5min                            │
│  ┌────────────────────────────┐  │  3. Configure Evaluator · ~15s                               │
│  │ Ask Lucy...           [clip] │  │  ...                                                        │
│  └────────────────────────────┘  │                                                              │
└──────────────────────────────────┴──────────────────────────────────────────────────────────────┘
```

**Key:** Plan is visible alongside other tabs. User can switch to Data tab without closing the plan.

---

## W5. Confirmation Dialog — Before Plan Approval

```
                        ┌─────────────────────────────────────────┐
                        │                                         │
                        │   Approve & Execute Plan?               │
                        │                                         │
                        │   This will:                            │
                        │   * Generate ~250 training records      │
                        │   * Configure evaluation criteria       │
                        │   * Upload dataset to training server   │
                        │   * Run a dry-run evaluation            │
                        │   * Start a fine-tuning job             │
                        │                                         │
                        │   Estimated time: ~8 minutes            │
                        │                                         │
                        │   Warning: This may incur compute       │
                        │   costs for generation and training.    │
                        │                                         │
                        │          [Cancel]  [Approve & Execute]  │
                        │                                         │
                        └─────────────────────────────────────────┘
```

---

## W6. Plan Executing — Progress in Sidebar

During execution, workspace shows Data tab. Progress shows in sidebar as inline checklist. ActivePlanBanner shows step count above tabs.

```
┌──────────────────────────────────┬──────────────────────────────────────────────────────────────┐
│ LUCY SIDEBAR                     │ WORKSPACE                                                    │
├──────────────────────────────────┤──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐ │ Chess Training Dataset             [Plan] [Readme] [Docs]    │
│ │ [avatar] Lucy Assistant BETA │ ├──────────────────────────────────────────────────────────────┤
│ └──────────────────────────────┘ │ Plan executing... step 4 of 7                     [Cancel]   │
│                                  ├──────────────────────────────────────────────────────────────┤
│  ┌ Lucy ──────────────────────┐  │ [Data 150 animating] [Evaluation done] [Fine-tune] [Deploy]  │
│  │ Starting your setup plan...│  ├──────────────────────────────────────────────────────────────┤
│  │                            │  │                                                              │
│  │ [done] Topics configured   │  │  [Table] [Canvas]  Search...  [Import] [Export]              │
│  │ [done] Data generated      │  │                                                              │
│  │        (150/250)           │  │  > Openings (30)                                             │
│  │ [done] Evaluator set up    │  │    Record #1  USR: "What's the best opening..."              │
│  │ [running] Uploading...     │  │    Record #2  USR: "Explain the Sicilian Defense..."         │
│  │ [ ] Dry run                │  │  > Endgames (30)                                             │
│  │ [ ] Generate readme        │  │    ...generating...                                          │
│  │ [ ] Start fine-tuning      │  │  > Tactics (30)                                              │
│  │                            │  │    Record #7  USR: "What's a discovered attack?"              │
│  │ Step 4 of 7 · ~2 min left │  │  > Strategy (30)                                              │
│  └────────────────────────────┘  │    ...                                                       │
│                                  │  > Puzzles (30)                                               │
│                                  │    ...                                                       │
│  ┌────────────────────────────┐  │                                                              │
│  │ Ask Lucy...           [clip] │  │                                                              │
│  └────────────────────────────┘  │                                                              │
└──────────────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## W7. Plan Completed — Completion Card

```
┌──────────────────────────────────┐
│                                  │
│  ┌ Lucy ──────────────────────┐  │
│  │ [done] Setup complete!     │  │
│  │                            │  │
│  │ Here's what was created:   │  │
│  │ * 247 training records     │  │
│  │ * 5 topic categories       │  │
│  │ * Accuracy + Relevance     │  │
│  │   evaluation criteria      │  │
│  │ * Fine-tune job #ft-abc123 │  │
│  │                            │  │
│  │ [View Data] [Check Job]    │  │
│  │                            │  │
│  │ What would you like to     │  │
│  │ do next?                   │  │
│  └────────────────────────────┘  │
│                                  │
│  Quick actions:                  │
│  [Check data variety]            │
│  [Create more examples]          │
│                                  │
└──────────────────────────────────┘
```

---

## W8. Data Tab — Records View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  [Table] [Canvas]   Search records...       [Import] [Export]               │
├──────────────────────────────────────────────────────────────────────────────┤
│  247 records · 5 topics · 85% categorized · Balance: good                  │
│  [All] [Generated 200] [Original 47] [Uncategorized 37]                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  > Openings (85)                                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Thread                                         │ Topic    │ Score │    │ │
│  │ USR: "What's the best opening for white?"      │ Openings │  0.92 │    │ │
│  │ USR: "Explain the Sicilian Defense for black"   │ Openings │  0.87 │    │ │
│  │ USR: "King's Indian Attack setup moves"         │ Openings │  0.91 │    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  > Endgames (62)                                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ USR: "King and pawn endgame basics..."          │ Endgames │  0.85 │    │ │
│  │ USR: "Rook endings: Lucena position"            │ Endgames │  0.88 │    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  > Tactics (50)                                                            │
│  > Strategy (50)                                                           │
│  > Puzzles (0) — no records yet                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## W9. Evaluation Tab — Themed Monaco Editor

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Grader Script          [JS] [Copy] [Template] [Config] [Run] [Save]     │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │  1 │ // Grader Script — Evaluate training record quality               │ │
│ │  2 │ export default function evaluate(record) {                        │ │
│ │  3 │   const messages = record.messages;                               │ │
│ │  4 │   const lastAssistant = messages.filter(                          │ │
│ │  5 │     m => m.role === 'assistant'                                   │ │
│ │  6 │   ).pop();                                                        │ │
│ │  7 │                                                                   │ │
│ │  8 │   // Check if the response is relevant                            │ │
│ │  9 │   const score = checkRelevance(lastAssistant?.content);           │ │
│ │ 10 │   return { score, feedback: `Relevance: ${score}` };              │ │
│ │ 11 │ }                                                                 │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ [Results] [History] [Running]                                          │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │  Run #3 — 12 samples · avg 0.85 · 10 pass / 2 fail                    │ │
│ │  Record #1  Score: 0.92  Pass                                          │ │
│ │  Record #2  Score: 0.45  Fail                                          │ │
│ │  Record #3  Score: 0.88  Pass                                          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Theme fix**: Replace all `zinc-*` in header bar, labels, inputs, dividers with semantic tokens:
- `border-zinc-800/60` -> `border-border`
- `bg-zinc-900/40` -> `bg-muted/40`
- `text-zinc-400` -> `text-muted-foreground`
- `bg-zinc-800/50` -> `bg-muted/50`
- `border-zinc-700/50` -> `border-border/50`
- `text-zinc-300` -> `text-foreground`
- `text-zinc-500` -> `text-muted-foreground`
- `hover:bg-zinc-800` -> `hover:bg-accent`
- `bg-zinc-700` -> `bg-accent`

---

## W10. Fine-tune Tab — Jobs Panel

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Finetune Jobs  2 jobs    [Base Model] [Config] [New Job] [Refresh]      │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │                                                                        │ │
│ │  JOB DETAIL                            │  JOB LIST                     │ │
│ │                                        │                               │ │
│ │  ft-chess-v2                           │  ft-chess-v2                   │ │
│ │  Status: Running (epoch 3/5)           │    Running · 2h ago            │ │
│ │  Base: meta-llama/8B-instruct          │                               │ │
│ │  Dataset: chess-training-247           │  ft-chess-v1                   │ │
│ │                                        │    Completed · 1d ago          │ │
│ │  Training Config:                      │                               │ │
│ │  * Learning Rate: 1e-4                 │                               │ │
│ │  * Epochs: 5                           │                               │ │
│ │  * Batch Size: 4                       │                               │ │
│ │  * LoRA Rank: 8                        │                               │ │
│ │                                        │                               │ │
│ │  Training Progress                     │                               │ │
│ │  ████████████░░░░░░░  60%              │                               │ │
│ │  Loss: 0.342 -> 0.128                  │                               │ │
│ │  ETA: ~45 min                          │                               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## W11. Deploy Tab — Guidance Content

Currently renders nothing. Must show actionable deployment guidance.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Deploy Your Fine-tuned Model                                               │
│                                                                              │
│  Your trained model weights are available from the Fine-tune tab.           │
│                                                                              │
│  Step 1: Download Weights                                                   │
│  Go to the Fine-tune tab -> select a completed job ->                       │
│  click "Download Weights" to get the LoRA adapter files.                    │
│                                         [-> Go to Fine-tune]                │
│                                                                              │
│  Step 2: Load the Adapter                                                   │
│  from peft import PeftModel                                                 │
│  model = PeftModel.from_pretrained(base_model, "path/to/adapter")           │
│                                                                              │
│  Step 3: Run Inference                                                      │
│  output = model.generate(input_ids, max_length=512)                         │
│                                                                              │
│  Resources:                                                                  │
│  * PEFT Documentation                                                       │
│  * vLLM Serving Guide                                                       │
│  * Hugging Face Model Hub                                                   │
│                                                                              │
│  Full deployment integration coming soon.                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## W12. Collapsed Sidebar States

```
IDLE             PROCESSING       EXECUTING        UNREAD           ERROR
┌──────┐        ┌──────┐        ┌──────┐        ┌──────┐        ┌──────┐
│      │        │ pulse │        │ pulse │        │      │        │ red  │
│      │        │      │        │      │        │      │        │      │
│ [L]  │        │ [L]  │        │ [L]  │        │ [L]  │        │ [L]  │
│      │        │      │        │      │        │      │        │      │
│      │        │      │        │ 4/7  │        │ dot-2│        │  !   │
│      │        │      │        │      │        │      │        │      │
│ [expand]│      │ [expand]│      │ [expand]│      │ [expand]│      │ [expand]│
└──────┘        └──────┘        └──────┘        └──────┘        └──────┘

IDLE:       Just the Lucy avatar. No activity.
PROCESSING: Pulsing themed dot (--theme-500). Lucy is thinking/generating.
EXECUTING:  Pulsing dot + step counter "4/7". Plan is running.
UNREAD:     Badge with message count. User has unread messages.
ERROR:      Red dot + "!" indicator. Connection lost or error.
```

---

## W13. Connection Error — With Retry

```
┌──────────────────────────────────┐
│ LUCY SIDEBAR                     │
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │    Connection Lost         │  │
│  │                            │  │
│  │  Could not connect to the  │  │
│  │  assistant server.         │  │
│  │                            │  │
│  │  * Check gateway is running│  │
│  │  * Verify network access   │  │
│  │                            │  │
│  │     [Retry Connection]     │  │
│  │                            │  │
│  │  Auto-retry in 12s...      │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

## W14. Chat Error — With Retry and Dismiss

```
┌──────────────────────────────────┐
│  ┌─ Error ────────────────────┐  │
│  │ Failed to send message     │  │
│  │                            │  │
│  │ The request timed out.     │  │
│  │ Your message was saved.    │  │
│  │                            │  │
│  │ [Retry]  [Dismiss]         │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

---

## W15. Progressive Timeout — Plan Generation

```
After 10s:  "Lucy is still working..."  (no action)
After 30s:  "This is taking longer than expected."  [Retry] [Cancel]
After 60s:  "Lucy may be experiencing issues."  [Retry] [Cancel]
```

---

## W17. Chat Panel — Flat IDE Style (Before/After)

Comparison of the current bubble-style chat vs the target flat IDE-panel style within the sidebar.

### Before: Bubble Style

```
┌──────────────────────────────────┐
│ [Explorer] [Lucy]        [collapse] │
├──────────────────────────────────┤
│ [avatar] Lucy Assistant BETA     │
│                                  │
│                     You • 2:15 🧑│  ← right-aligned, avatar right
│    ╭─────────────────────────╮   │
│    │ Can you analyze my      │   │  ← bg-muted/40, rounded-2xl
│    │ dataset?                │   │     border, shadow-sm
│    ╰─────────────────────────╯   │
│                                  │  ← 16px gap (space-y-4)
│  🤖 Lucy • 2:15                 │  ← 24px avatar
│  ╭───────────────────────────╮   │
│  │ I've analyzed your docs.  │   │  ← bg-muted/40, rounded-2xl
│  │ Strong coverage in        │   │     border, shadow-sm
│  │ openings, needs more      │   │
│  │ endgame data.             │   │
│  ╰───────────────────────────╯   │
│                                  │
│  ╭─ configure_topics ────────╮   │  ← rounded-lg card
│  │ ⏳ Configuring topics...  │   │     themed border, bg-card, p-3
│  ╰───────────────────────────╯   │
│                                  │
│  ╭───────────────────────────╮   │
│  │ Ask Lucy...        📎 🎤 │   │  ← rounded-xl, glow shadow
│  │                        ▶ │   │
│  ╰───────────────────────────╯   │
└──────────────────────────────────┘
```

### After: Flat IDE Style

```
┌──────────────────────────────────┐
│ [Explorer] [Lucy]        [collapse] │
├──────────────────────────────────┤
│ [avatar] Lucy Assistant BETA     │
│                                  │
│  You • 2:15 PM                   │  ← left-aligned, no avatar
│  Can you analyze my dataset?     │  ← no bubble, no bg, no border
│                                  │  ← 8px gap (space-y-2)
│  🤖 Lucy • 2:15 PM              │  ← 14px tiny icon
│  I've analyzed your docs.        │  ← no bubble, content flows
│  Strong coverage in openings,    │     directly
│  needs more endgame data.        │
│                                  │
│  ┃ ⏳ configure_topics           │  ← left-border accent (2px)
│  ┃   Configuring topics...       │     no card, no rounded corners
│                                  │
│  ┃ ✓ configure_topics  1.2s  ▶  │  ← muted left-border, compact
│                                  │
│  ╭──────────────────────────────╮│
│  │ Ask Lucy...           📎 🎤 ││  ← rounded-lg, no glow
│  │                           ▶ ││     simple border focus
│  ╰──────────────────────────────╯│
└──────────────────────────────────┘
```

**Key differences:**
- Messages: left-aligned, no bubbles, no backgrounds, no shadows
- User: no avatar, just "You" text label
- Assistant: tiny 14px icon instead of 24px avatar
- Tool calls: left-border accent rows instead of card containers
- Spacing: 8px between messages (was 16px) — 2x density increase
- Input: `rounded-lg` (less rounded), no glow shadow effect
- See [10-chat-panel-redesign.md](./10-chat-panel-redesign.md) for full component spec

---

## W16. Drawers — Consistent Widths

Both drawers use the same width for consistency.

```
BEFORE (inconsistent):                    AFTER (standardized):
ReadmeDrawer: w-[60vw] !max-w-[60vw]     ReadmeDrawer: w-[50vw] max-w-[700px] min-w-[400px]
DocsDrawer:   w-[50vw] max-w-[600px]     DocsDrawer:   w-[50vw] max-w-[700px] min-w-[400px]
```

```
┌──────────────────────────────────────────────────────────┬─────────────────────────────────────┐
│ (workspace partially visible)                            │ DRAWER (50vw, max 700px)            │
│                                                          │                                     │
│                                                          │  Dataset README                     │
│                                                          │                                     │
│ ░░░░░░░ workspace content ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  # Chess Training Dataset           │
│ ░░░░░░░ dimmed behind drawer ░░░░░░░░░░░░░░░░░░░░░░░░░  │                                     │
│                                                          │  ## Overview                        │
│                                                          │  This dataset contains 247          │
│                                                          │  training records...                │
│                                                          │                                     │
│                                                          │  [Export] [Regenerate]               │
└──────────────────────────────────────────────────────────┴─────────────────────────────────────┘
```

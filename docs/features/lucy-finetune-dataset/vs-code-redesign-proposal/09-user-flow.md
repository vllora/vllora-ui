# User Flow — End-to-End Journey

> How users move through the redesigned Lucy Finetune experience, step by step.
> Each flow shows: what the user sees, what they do, and what happens next.

---

## Flow Overview — The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│   CREATE          UPLOAD           PLAN            BUILD           DEPLOY        │
│   DATASET    →    DOCS        →   REVIEW     →    & TRAIN    →    MODEL         │
│                                                                                 │
│   ┌───────┐      ┌───────┐       ┌───────┐       ┌───────┐      ┌───────┐     │
│   │ Empty │      │ Lucy  │       │ Plan  │       │ Exec  │      │ Done  │     │
│   │ state │─────>│ anal- │──────>│ card  │──────>│ steps │─────>│ card  │     │
│   │       │      │ yzes  │       │ shown │       │ 1..7  │      │       │     │
│   └───────┘      └───────┘       └───────┘       └───────┘      └───────┘     │
│       │              │               │                │              │          │
│       v              v               v                v              v          │
│   User fills     Lucy chat       Sidebar:          Sidebar:       User goes    │
│   objective,     shows           PlanCard          progress       to Data,     │
│   uploads        analysis        Workspace:        checklist      Eval, or     │
│   files          + insights      Plan preview      Data tab:      Fine-tune    │
│                                                    records        tab          │
│                                                    appearing                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 1 — New Dataset Creation

**Starting point:** User clicks "+ New Dataset" from the datasets list.

```
USER ACTION                    WHAT THEY SEE                     SYSTEM RESPONSE
───────────────────────────    ──────────────────────────────    ────────────────────────────

1. Click "+ New Dataset"  ───> Empty dataset page appears
                               ┌─────────────────────────────┐
                               │ Name: [Untitled Dataset    ] │
                               │ Objective: [               ] │
                               │                              │
                               │ Upload reference documents:   │
                               │ [Drop files here or browse]   │
                               │                              │
                               │ Quick suggestions:            │
                               │ [Chess] [Code review] [Math]  │
                               └─────────────────────────────┘
                                         │
2. Type name + objective  ───> Fields update                 ───> Saved to IndexedDB
                                         │
3. Upload PDF/docs        ───> Files appear with status      ───> Docs stored, processing
                               chess-openings.pdf  [loading]       starts
                               tactics-guide.pdf   [loading]
                                         │
4. Files finish processing ──> Status updates                ───> Lucy auto-triggers
                               chess-openings.pdf  [done]          analysis
                               tactics-guide.pdf   [done]
                                         │
                                         v
                              ┌──── GO TO FLOW 2 ────┐
                              │  Lucy Analyzes Docs   │
                              └───────────────────────┘
```

---

## Flow 2 — Lucy Analyzes & Proposes Plan

**Starting point:** Docs are processed. Lucy auto-analyzes (or user clicks "Start training setup").

```
USER ACTION                    SIDEBAR (Lucy)                    WORKSPACE
───────────────────────────    ──────────────────────────────    ────────────────────────

                               Lucy is thinking...               Data tab (empty)
                               [pulsing dot]                     "No records yet"
                                         │
                                         │ (5-15 seconds)
                                         v
                               ┌────────────────────────────┐
                               │ "I've analyzed your 2 docs │    Data tab unchanged
                               │ and here's what I found:   │
                               │                            │
                               │ * Strong coverage in       │
                               │   openings (60+ positions) │
                               │ * Good endgame material    │
                               │ * No tactics content       │
                               │                            │
                               │ I'll create a training     │
                               │ plan for you..."           │
                               └────────────────────────────┘
                                         │
                                         │ (Lucy calls propose_plan tool)
                                         v
                               ┌ PlanCard (sticky) ─────────┐
                               │ Chess Training Plan         │   Plan preview opens
                               │                            │   in workspace as tab
                               │ 5 topics · 250 records     │   ┌──────────────────┐
                               │ 2 eval criteria            │   │ # Chess Training │
                               │ ~8 min estimated           │   │                  │
                               │                            │   │ ## Topics        │
                               │ [Approve] [Edit] [Dismiss] │   │ | Openings | 50 |│
                               │                            │   │ | Endgames | 50 |│
                               │ View full plan             │   │ ...              │
                               └────────────────────────────┘   └──────────────────┘
                                         │
                                         v
                              ┌──── GO TO FLOW 3 ────┐
                              │    Plan Review        │
                              └───────────────────────┘
```

---

## Flow 3 — Plan Review (User Decides)

**Starting point:** PlanCard is visible in sidebar. Plan preview is in workspace.

```
                               SIDEBAR                           WORKSPACE
                               ┌────────────────────────┐       ┌────────────────────────┐
                               │ PlanCard (sticky)       │       │ [Data] [Plan dot]      │
                               │ [Approve] [Edit] [X]   │       │ Plan content...        │
                               └────────────────────────┘       └────────────────────────┘
                                         │
                     ┌───────────────────┼───────────────────┐
                     │                   │                   │
                     v                   v                   v
              USER APPROVES       USER EDITS           USER DISMISSES
                     │                   │                   │
                     v                   v                   v
              Confirmation        Plan Preview          PlanCard removed
              dialog opens        switches to           Plan dismissed
              ┌──────────────┐    edit mode             Lucy says:
              │ Approve &    │    ┌──────────────┐      "OK, dismissed.
              │ Execute?     │    │ Edit topics, │       Ask me anytime
              │              │    │ counts, etc. │       to create a
              │ * 250 recs   │    │              │       new one."
              │ * ~8 min     │    │ [Save] [Back]│              │
              │ * costs $$   │    └──────────────┘              │
              │              │           │                      │
              │ [Cancel]     │           v                      v
              │ [Approve]    │    Lucy receives          User continues
              └──────────────┘    edited plan,           manually or
                     │            re-proposes             asks Lucy later
                     │            ┌──────────┐
                     │            │ Updated  │
                     │            │ PlanCard │
                     │            └──────────┘
                     │                │
                     │    (back to top of Flow 3)
                     v
              ┌──── GO TO FLOW 4 ────┐
              │   Plan Execution      │
              └───────────────────────┘
```

---

## Flow 4 — Plan Execution (7-Step Pipeline)

**Starting point:** User confirmed "Approve & Execute" in the confirmation dialog.

```
TIME    SIDEBAR PROGRESS              WORKSPACE                    COLLAPSED SIDEBAR
─────   ───────────────────────────   ──────────────────────────   ──────────────────
0:00    ┌──────────────────────────┐  Banner: "Executing 1/7"     ┌──────┐
        │ Starting setup plan...   │  [Data 0] tab active         │ pulse│
        │                          │                               │ [L]  │
        │ [running] Configure      │  Empty data tab               │      │
        │           topics         │                               │ 1/7  │
        │ [ ] Generate data        │                               └──────┘
        │ [ ] Set up evaluator     │
        │ [ ] Upload dataset       │
        │ [ ] Dry run              │
        │ [ ] Generate readme      │
        │ [ ] Start fine-tuning    │
        │                          │
        │ Step 1/7                 │
        └──────────────────────────┘
                    │
0:30    ┌──────────────────────────┐  Banner: "Executing 2/7"     ┌──────┐
        │ [done] Topics (5)        │  [Data 0->50] animating      │ pulse│
        │ [running] Generating     │                               │ [L]  │
        │           data (50/250)  │  Records appearing:           │      │
        │ [ ] Set up evaluator     │  > Openings (10)              │ 2/7  │
        │ [ ] Upload dataset       │  > Endgames (10)              └──────┘
        │ ...                      │  > Tactics (10)
        │                          │  > Strategy (10)
        │ Step 2/7 · ~5 min left   │  > Puzzles (10)
        └──────────────────────────┘
                    │
                    │  USER CAN FREELY SWITCH TABS HERE
                    │  ┌──────────────────────────────────────────────┐
                    │  │ Banner stays: "Executing 3/7"     [Cancel]  │
                    │  │ [Data 150] [Evaluation] [Fine-tune] [Deploy]│
                    │  │                                              │
                    │  │ User clicks [Evaluation] tab                 │
                    │  │ -> sees evaluation content (maybe empty)     │
                    │  │ -> banner still shows progress above         │
                    │  │ -> can switch back to Data anytime           │
                    │  └──────────────────────────────────────────────┘
                    │
5:00    ┌──────────────────────────┐  Banner: "Executing 5/7"
        │ [done] Topics (5)        │  [Data 247] [Eval done]
        │ [done] Data (247/250)    │
        │ [done] Evaluator         │  Data tab shows 247 records
        │ [done] Uploaded          │  grouped by topic
        │ [running] Dry run...     │
        │ [ ] Generate readme      │
        │ [ ] Start fine-tuning    │
        │                          │
        │ Step 5/7 · ~2 min left   │
        └──────────────────────────┘
                    │
8:00    ┌──────────────────────────┐  Banner: "Complete!"          ┌──────┐
        │ [done] All 7 steps!      │  [Data 247] [Eval done]      │      │
        │                          │  [Fine-tune 1]               │ [L]  │
        │                          │                               │      │
        └──────────────────────────┘                               └──────┘
                    │
                    v
              ┌──── GO TO FLOW 5 ────┐
              │   Completion          │
              └───────────────────────┘
```

### Cancel During Execution

```
User clicks [Cancel] in banner at any point:
         │
         v
┌─────────────────────────────────────┐
│  Cancel Plan Execution?             │
│                                     │
│  Progress so far will be kept:      │
│  * 150 records generated            │
│  * Evaluator configured             │
│                                     │
│  Remaining steps will not run.      │
│                                     │
│  [Continue Executing]  [Cancel]     │
└─────────────────────────────────────┘
         │                    │
         v                    v
   Execution             Execution stops.
   continues.            Data generated so far
                         is preserved.
                         Lucy: "Execution cancelled.
                         You can resume later or
                         start fresh."
```

---

## Flow 5 — Post-Completion (What's Next?)

**Starting point:** All 7 steps completed successfully.

```
                               SIDEBAR                           WORKSPACE
                               ┌────────────────────────────┐
                               │ [done] Setup complete!      │   [Data 247] [Eval done]
                               │                            │   [Fine-tune 1] [Deploy]
                               │ Here's what was created:   │
                               │ * 247 training records     │   Data tab active showing
                               │ * 5 topic categories       │   all records grouped
                               │ * Accuracy + Relevance     │
                               │   evaluation criteria      │
                               │ * Fine-tune job #ft-abc123 │
                               │                            │
                               │ [View Data] [Check Job]    │
                               │                            │
                               │ What would you like to     │
                               │ do next?                   │
                               └────────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              v                          v                          v
       "View Data"              "Check Job"                  Ask Lucy anything
              │                          │                          │
              v                          v                          v
       Switches to              Switches to                  Continue chatting:
       Data tab                 Fine-tune tab                "Add more endgame
       ┌─────────────┐         ┌─────────────┐              examples"
       │ 247 records  │         │ ft-abc123   │              "Re-run evaluation"
       │ grouped by   │         │ Running 3/5 │              "Change topics"
       │ topic        │         │ Loss: 0.128 │
       └─────────────┘         └─────────────┘

                               QUICK ACTIONS UPDATE:
                               ┌────────────────────────────┐
                               │ [Check data variety]        │
                               │ [Create more examples]      │
                               │ [Re-run evaluation]         │
                               │ [Start another fine-tune]   │
                               └────────────────────────────┘
```

---

## Flow 6 — Sidebar Navigation (Explorer ↔ Lucy)

**How the two sidebar views interact with the workspace.**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  SIDEBAR STATE                            WORKSPACE EFFECT                      │
│                                                                                 │
│  ┌──────────────┐   click Lucy tab   ┌──────────────────────────────────────┐  │
│  │              │ ─────────────────> │                                      │  │
│  │   EXPLORER   │                    │  No change to workspace.             │  │
│  │              │ <───────────────── │  Tabs stay as they were.             │  │
│  │  Topics      │   click Explorer   │  Whatever tab was active remains.    │  │
│  │  Documents   │       tab          │                                      │  │
│  │  Pipeline    │                    └──────────────────────────────────────┘  │
│  │  Stats       │                                                              │
│  │              │   click topic      ┌──────────────────────────────────────┐  │
│  │              │ ─────────────────> │  Data tab activates with filter      │  │
│  │              │                    │  showing only that topic's records   │  │
│  │              │   click doc        │                                      │  │
│  │              │ ─────────────────> │  Document viewer opens               │  │
│  │              │                    │  (or Docs drawer opens)              │  │
│  │              │   click pipeline   │                                      │  │
│  │              │      step          │  Corresponding tab activates:        │  │
│  │              │ ─────────────────> │  Evaluation/Fine-tune/Deploy         │  │
│  └──────────────┘                    └──────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────┐                    ┌──────────────────────────────────────┐  │
│  │              │   send message     │                                      │  │
│  │   LUCY CHAT  │ ─────────────────> │  No direct workspace change.         │  │
│  │              │                    │  Lucy may trigger tool calls that    │  │
│  │  Messages    │   Lucy calls       │  update data (records appear,       │  │
│  │  PlanCard    │   tools            │  plan proposed, etc.)               │  │
│  │  Quick       │ ─────────────────> │                                      │  │
│  │  Actions     │                    │  Tool results update workspace      │  │
│  │              │   quick action     │  automatically via events/context.  │  │
│  │              │   clicked          │                                      │  │
│  │              │ ─────────────────> │  Sends structured prompt to Lucy    │  │
│  └──────────────┘                    └──────────────────────────────────────┘  │
│                                                                                 │
│  BADGES & INDICATORS:                                                           │
│                                                                                 │
│  Explorer active + Lucy has messages  -->  Lucy tab shows "dot-2" badge         │
│  Lucy active + Explorer irrelevant    -->  Explorer tab has no badge            │
│  Lucy proposing plan                  -->  Auto-switch to Lucy + toast          │
│  Lucy processing (either tab)         -->  Pulsing dot on Lucy tab              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 7 — Sidebar Collapse / Expand States

```
EXPANDED (340px)                     TRIGGER                      COLLAPSED (56px)
┌───────────────────────────────┐                                ┌──────┐
│ [Explorer] [Lucy]    [collapse] │ ── user clicks [collapse] ──> │      │
│                               │    OR viewport < 1024px        │  ??  │ ← indicator
│ (Explorer or Lucy content)    │                                │      │
│                               │                                │ [L]  │ ← avatar
│                               │                                │      │
│                               │                                │  ??  │ ← badge
│                               │                                │      │
│                               │ <── user clicks [expand] ───── │[expand]│
│                               │    OR clicks Lucy avatar       │      │
└───────────────────────────────┘                                └──────┘

WHAT THE COLLAPSED INDICATORS SHOW:

  State              Top indicator    Middle    Bottom
  ─────────────────  ──────────────  ────────  ─────────
  Idle               (nothing)       [L]       (nothing)
  Lucy thinking      [pulse dot]     [L]       (nothing)
  Plan executing     [pulse dot]     [L]       "3/7"
  Unread messages    (nothing)       [L]       "dot-2"
  Connection error   [red dot]       [L]       "!"
  API key missing    [red dot]       [L]       (nothing)

  Priority (only one state shows):
  Error > Executing > Processing > Unread > Idle
```

---

## Flow 8 — Plan Lifecycle State Machine

```
                    ┌──────────┐
                    │   EMPTY  │ ← initial state (no plan exists)
                    └────┬─────┘
                         │
                         │ User says "create plan" or clicks quick action
                         │ or Lucy auto-triggers after doc analysis
                         v
                    ┌──────────┐
               ┌───>│GENERATING│ ← Lucy is calling propose_plan tool
               │    └────┬─────┘
               │         │
               │    ┌────┼───────────────────────────────────────────┐
               │    │    │ progressive timeout                       │
               │    │    │                                           │
               │    │    │ 10s: "Still working..." (no action)       │
               │    │    │ 30s: "Taking longer..." [Retry] [Cancel]  │
               │    │    │ 60s: "May have issues" [Retry] [Cancel]   │
               │    │    │                                           │
               │    │    │ [Cancel] ──> back to EMPTY                │
               │    │    │ [Retry]  ──> re-send request              │
               │    └────┼───────────────────────────────────────────┘
               │         │
               │         │ propose_plan tool returns plan data
               │         v
               │    ┌──────────┐
               │    │ PROPOSED │ ← PlanCard visible in sidebar
               │    └────┬─────┘   Plan preview available in workspace
               │         │
               │    ┌────┼────────────────────────────┐
               │    │    │                             │
               │    │    v            v            v   │
               │    │ [Approve]   [Edit]      [Dismiss]│
               │    │    │           │            │    │
               │    │    │           │            │    │
               │    │    │           v            v    │
               │    │    │     ┌──────────┐  ┌──────┐ │
               │    │    │     │ EDITING  │  │EMPTY │ │  ← plan discarded
               │    │    │     └────┬─────┘  └──────┘ │
               │    │    │          │                  │
               │    │    │          │ [Save]           │
               │    │    │          │ Lucy re-proposes │
               │    │    │          v                  │
               │    │    │     back to PROPOSED        │
               │    └────┼────────────────────────────┘
               │         │
               │         │ User confirms in AlertDialog
               │         v
               │    ┌──────────┐
               │    │EXECUTING │ ← 7-step pipeline running
               │    └────┬─────┘   Progress in sidebar + banner
               │         │
               │    ┌────┼─────────────────────┐
               │    │    │                      │
               │    │    v                      v
               │    │ [completes]          [Cancel]
               │    │    │                      │
               │    │    v                      v
               │    │ ┌──────────┐    ┌───────────────┐
               │    │ │COMPLETED │    │  CANCELLED    │
               │    │ │          │    │  (data kept)  │
               │    │ └────┬─────┘    └───────┬───────┘
               │    └────┼─────────────────────┘
               │         │
               │         │ User clicks "Clear" or starts new plan
               │         v
               │    ┌──────────┐
               └────│   EMPTY  │ ← cycle restarts
                    └──────────┘


PLAN STATUS → UI MAPPING:

  Plan Status    PlanCard    Plan Tab    Banner         Sidebar indicators
  ───────────    ────────    ────────    ──────         ──────────────────
  EMPTY          hidden      hidden      hidden         (none)
  GENERATING     hidden      hidden      hidden         pulsing dot
  PROPOSED       visible     available   hidden         (none)
  EDITING        visible     edit mode   hidden         (none)
  EXECUTING      hidden      available   "step X/7"     pulsing dot + "X/7"
  COMPLETED      hidden      available   "Complete!"    (none)
  CANCELLED      hidden      available   hidden         (none)
```

---

## Flow 9 — Error Recovery Paths

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ERROR: Connection Lost                                                          │
│                                                                                 │
│  Normal ──> Connecting... (spinner) ──> 15s timeout ──> Connection Failed       │
│                                                              │                  │
│                                              ┌───────────────┼──────────────┐   │
│                                              │               │              │   │
│                                              v               v              │   │
│                                         [Retry]        Auto-retry          │   │
│                                              │          countdown           │   │
│                                              v          (12s, 24s, 48s)     │   │
│                                         Connecting...        │              │   │
│                                              │               v              │   │
│                                              v          Connecting...       │   │
│                                         Connected!           │              │   │
│                                         (resume)             v              │   │
│                                                         Connected!          │   │
│                                                         (resume)            │   │
│                                                                             │   │
│  Collapsed sidebar shows: [red dot] + "!" during any error state            │   │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│ ERROR: Chat Message Failed                                                      │
│                                                                                 │
│  User sends message ──> Request fails (timeout/network)                         │
│                              │                                                  │
│                              v                                                  │
│                    ┃ "Failed to send message"                                    │
│                    ┃ "Your message was saved."                                   │
│                    ┃                                                             │
│                    ┃ [Retry]     [Dismiss]                                       │
│                    (flat: left-border red accent, no card wrapper)               │
│                        │              │                                          │
│                        v              v                                          │
│                   Re-sends       Error row                                      │
│                   same message   removed.                                       │
│                   from queue     Message stays                                  │
│                        │         in input for                                   │
│                        v         user to try                                    │
│                   Success!       manually later.                                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│ ERROR: Plan Execution Step Fails                                                │
│                                                                                 │
│  Executing step 4/7 ──> Tool call fails                                        │
│                              │                                                  │
│                              v                                                  │
│  Sidebar:                                          Workspace:                   │
│  ┌─────────────────────────────────┐              Banner turns red:             │
│  │ [done] Topics configured        │              "Step 4 failed"               │
│  │ [done] Data generated (200)     │              [Retry Step] [Skip] [Cancel]  │
│  │ [done] Evaluator set up         │                                            │
│  │ [FAILED] Upload dataset         │                                            │
│  │   "Connection refused"          │                                            │
│  │ [ ] Dry run                     │                                            │
│  │ [ ] Generate readme             │                                            │
│  │ [ ] Start fine-tuning           │                                            │
│  └─────────────────────────────────┘                                            │
│                                                                                 │
│  User choices:                                                                  │
│  [Retry Step] ──> Re-runs step 4, continues from there if successful           │
│  [Skip]       ──> Marks step 4 skipped, continues to step 5                    │
│  [Cancel]     ──> Stops execution, preserves completed work                    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 10 — Tab Navigation & Content Mapping

```
USER CLICKS TAB          CONTENT SHOWN                        TAB BADGE MEANING
──────────────────────   ──────────────────────────────────   ──────────────────
[Overview]               Dashboard: stats, project health      (none)
                         Links to other tabs
                         Activity timeline

[Data 247]               Records table/canvas                  "247" = record count
                         Topic groups, filters                 animates during generation
                         Import/Export buttons
                         Table ↔ Canvas toggle

[Evaluation done]        Grader script editor (Monaco)         "done" = configured
                         Run button, results panel             spinner = running dry-run
                         Template picker

[Fine-tune 2]            Job list + job detail                 "2" = number of jobs
                         Training progress bar                 spinner = job running
                         Config panel

[Deploy]                 Deployment guidance                   (none)
                         Step-by-step instructions
                         Code snippets
                         Resource links


TAB LOCKING RULES:

  Tab            When Locked                          Visual
  ───────────    ──────────────────────────────────   ───────────────
  Overview       Never locked                         Always clickable
  Data           Never locked                         Always clickable
  Evaluation     When 0 records exist                 opacity-50, cursor-not-allowed
  Fine-tune      When evaluation not configured       opacity-50, cursor-not-allowed
  Deploy         When no fine-tune jobs exist         opacity-50, cursor-not-allowed


TAB ACTIVATION RULES:

  Event                                    Tab Auto-Activated?
  ─────────────────────────────────────    ─────────────────────────────────
  Dataset first opened                     Overview (default)
  Records generated by Lucy                NO auto-switch. Toast: "150 records added"
  Evaluation configured                    NO auto-switch. Badge updates to "done"
  Fine-tune job started                    NO auto-switch. Badge updates to count
  Plan execution starts                    Stays on current tab. Banner appears.
  Plan execution completes                 NO auto-switch. Completion card in sidebar.
  User clicks "View Data" in sidebar       YES — switches to Data tab
  User clicks "Check Job" in sidebar       YES — switches to Fine-tune tab
```

---

## Flow 11 — Complete User Journey (Timeline View)

```
TIME     USER                        LUCY (sidebar)                WORKSPACE
──────   ─────────────────────────   ────────────────────────────  ────────────────────────
0:00     Creates dataset             Waiting for connection...     Empty state
         Types name + objective      Connected!                    Name/objective form

0:30     Uploads 2 PDFs              "Processing documents..."     Docs show [loading]

1:00     (waits)                     "I've analyzed your docs.     Docs show [done]
                                      Strong openings coverage,
                                      needs more endgame data."

1:30     (waits)                     PlanCard appears:             Plan preview opens
                                     "5 topics, 250 records,       as workspace tab
                                      ~8 min"

2:00     Reads plan in workspace     PlanCard sticky in sidebar    Plan content visible
         "Looks good, but add                                      alongside Data tab
          a Puzzles topic"

2:30     (waits)                     "Updated plan with Puzzles.   Plan preview updates
                                      Now 6 topics, 300 records."
                                     PlanCard updates

3:00     Clicks [Approve]            Confirmation dialog pops up

3:15     Confirms [Approve &                                       Banner: "Executing 1/7"
         Execute]                    Progress checklist appears:
                                     [running] Topics...

3:30                                 [done] Topics (6)             Data tab: records
                                     [running] Generating (0/300)  start appearing

5:00     Switches to Eval tab        [done] Data (150/300)         Eval tab content
         to check script             [running] still generating    Banner: "3/7"

6:00     Switches back to Data       [done] Data (300)             300 records visible
                                     [done] Evaluator
                                     [running] Uploading...

8:00                                 [done] All 7 steps!           Banner: "Complete!"
                                     Completion card:              Data tab: 300 records
                                     "247 records, 6 topics,       Eval tab: done badge
                                      job #ft-abc123"              Fine-tune: 1 job

8:30     Clicks [Check Job]                                        Fine-tune tab:
                                                                   ft-abc123 running
                                                                   Progress bar: 10%

9:00     "Add 50 more endgame        "Sure! Generating 50 more     Data tab badge
          examples"                   endgame records..."           animates: 300->350

20:00    Checks Fine-tune tab                                      ft-abc123: complete!
                                                                   Loss: 0.128

20:30    Clicks Deploy tab                                         Deploy guidance:
                                                                   Download weights,
                                                                   load adapter,
                                                                   run inference

21:00    Done! Model is trained.     "Great work! Your model is
                                      ready. Let me know if you
                                      need anything else."
```

---

## Quick Reference — State → UI Element Map

```
┌─────────────────────────┬────────────┬──────────────┬───────────┬───────────────┐
│ State                   │ PlanCard   │ Plan Banner  │ Sidebar   │ Tabs          │
│                         │ (sidebar)  │ (workspace)  │ Indicator │               │
├─────────────────────────┼────────────┼──────────────┼───────────┼───────────────┤
│ No plan                 │ hidden     │ hidden       │ idle      │ normal        │
│ Lucy analyzing docs     │ hidden     │ hidden       │ pulse     │ normal        │
│ Plan generating         │ hidden     │ hidden       │ pulse     │ normal        │
│ Plan proposed           │ VISIBLE    │ hidden       │ idle      │ Plan has dot  │
│ Plan editing            │ visible    │ hidden       │ idle      │ Plan active   │
│ Plan executing          │ hidden     │ "step X/Y"   │ pulse+X/Y │ badges update │
│ Plan completed          │ hidden     │ "Complete!"  │ idle      │ badges final  │
│ Plan cancelled          │ hidden     │ hidden       │ idle      │ badges kept   │
│ Plan step failed        │ hidden     │ "Failed" red │ red dot   │ unchanged     │
│ Connection error        │ hidden     │ hidden       │ red + "!" │ unchanged     │
│ Unread messages         │ (depends)  │ hidden       │ "dot-N"   │ unchanged     │
└─────────────────────────┴────────────┴──────────────┴───────────┴───────────────┘
```

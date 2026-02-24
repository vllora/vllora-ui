# Sidebar Redesign

---

## 1. PlanCard Always Visible (Sticky Above Chat)

**Current bug:** `LucyDatasetAssistant.tsx:445` only renders PlanCard when `messages.length === 0`:

```tsx
// BEFORE
{!!proposedPlan && planStatus === 'proposed' && messages.length === 0 && (
  <div className="px-3 pt-3 shrink-0">
    <PlanCard />
  </div>
)}
```

This means the PlanCard disappears as soon as any message exists in chat.

```tsx
// AFTER — always show when plan is proposed
{!!proposedPlan && planStatus === 'proposed' && (
  <div className="px-3 pt-3 shrink-0">
    <PlanCard />
  </div>
)}
```

The PlanCard should be **sticky** at the top of the sidebar (above the chat scroll area), so it never scrolls away.

---

## 2. Collapsed Sidebar Activity Indicators

**Current state:** Collapsed sidebar shows only the Lucy avatar and an API key error dot.

**Proposed implementation in `LucyDatasetAssistant.tsx`** (collapsed header section, lines 488-521):

```tsx
{isCollapsed && (
  <>
    {/* Processing dot — pulsing themed color */}
    {(agentLoading || isGeneratingPlan || isExecuting) && (
      <span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--theme-500))] animate-pulse" />
    )}

    {/* Step counter during plan execution */}
    {isExecuting && executionProgress && (
      <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
        {executionProgress.current_step}/{executionProgress.total_steps}
      </span>
    )}

    {/* Unread message count */}
    {unreadCount > 0 && !isExecuting && (
      <span className="text-[10px] font-bold text-[rgb(var(--theme-500))]">
        •{unreadCount}
      </span>
    )}
  </>
)}
```

**Files affected:** `LucyDatasetAssistant.tsx` lines 488-521

---

## 3. Connection Timeout With Retry

**Current state:** Forever spinner with "Connecting..." and no timeout/retry (`LucyDatasetAssistant.tsx:463-472`).

**Proposed:** Add 15s timeout -> show error state with retry button.

```tsx
const [connectionTimedOut, setConnectionTimedOut] = useState(false);

useEffect(() => {
  if (!isConnected && !agentLoading) {
    const timer = setTimeout(() => setConnectionTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }
  if (isConnected) setConnectionTimedOut(false);
}, [isConnected, agentLoading]);

// In render:
{connectionTimedOut ? (
  <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
    <Plug className="h-6 w-6 text-destructive" />
    <p className="text-sm font-medium">Connection failed</p>
    <p className="text-xs text-muted-foreground">
      Could not connect to the assistant server.
    </p>
    <Button variant="outline" size="sm" onClick={reconnect} className="gap-1.5">
      <RefreshCw className="h-3.5 w-3.5" />
      Retry Connection
    </Button>
  </div>
) : (
  // existing connecting state
)}
```

---

## 4. Chat Error Recovery

**Current state:** Chat errors show bare red div (from @distri/react). No retry/dismiss.

This is partially an upstream issue (`MessageRenderer.tsx:202` in @distri/react — retry button has no onClick handler). For now, wrap errors in the local UI.

**Files affected:** `LucyChat.tsx` or `LucyDatasetAssistant.tsx` — add error boundary/wrapper

---

## 5. Quick Actions Mapped to Structured Prompts

**Current bug:** Quick actions send their label as a literal message.

**Proposed mapping:**

| Quick Action Label | Structured Prompt |
|---|---|
| "Start training setup" | "Please analyze my dataset and create a setup plan using the propose_plan tool." |
| "Check progress" | "Please check the current workflow state and tell me what's been done and what's next." |
| "Check data variety" | "Please analyze the coverage and diversity of my training data using the analyze_coverage tool." |
| "Create more training examples" | "Please generate more synthetic training data for topics that need more examples." |
| "Set up evaluation" | "Please help me configure an evaluation function for my training data using configure_grader." |
| "Test before training" | "Please run a dry-run evaluation to test the grader on a sample of records." |
| "Start training" | "Please start a fine-tuning job with the current dataset and configuration." |

**Files affected:** `LucyDatasetAssistant.tsx` lines 52-60 — add `prompt` field to QuickAction type

---

## 6. Confirmation Before Plan Approval

**Current state:** Clicking "Approve" in PlanCard immediately triggers execution. No summary, no cost warning.

**Proposed:** Use shadcn `AlertDialog` in both `PlanCard.tsx` and `PlanPreview.tsx`:

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button>Approve & Execute</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Approve & Execute Plan?</AlertDialogTitle>
      <AlertDialogDescription>
        This will generate ~{recordTarget} records, configure evaluation,
        and start a fine-tuning job. Estimated time: ~{estimatedDuration}.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleApprove}>
        Approve & Execute
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Files affected:**
- `PlanCard.tsx` — wrap Approve button
- `PlanPreview.tsx` (PlanDisplayView) — wrap Approve & Execute button

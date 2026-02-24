# Tab Redesign

> Applies to **Vision B** (fixed tabs). See [README](./README.md) for the architectural decision.

---

## Current State

- `SectionTabs.tsx` uses `ArrowSegment.tsx` for arrow-shaped SVG tabs
- 5 tabs: Overview, Data, Evaluation, Fine-tune, Deploy
- Locked tabs show `cursor-pointer` and hover states (look clickable)
- `ArrowSegment` has `isOptional` dashed borders adding visual noise
- Tabs hidden during plan preview (`DatasetDetailContentV2.tsx:499`)

## Proposed Changes

### 1. Replace ArrowSegment with Simple Horizontal Tabs

Remove the arrow stepper entirely. Use standard shadcn/ui-style tabs:

```
BEFORE (arrows with SVG):
-- Overview -->-- Data -->-- Evaluation -->-- Fine-tune -->-- Deploy --

AFTER (simple horizontal tabs):
[Overview]  [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]
```

Each tab is a simple button with:
- Icon (same icons as current)
- Label
- Optional badge (count or checkmark)
- Optional spinner (when processing)
- Active state: themed bottom border + themed text
- Locked state: `cursor-not-allowed`, `opacity-50`, no hover effect
- Completed state: subtle checkmark, theme-tinted text

**Files affected:**
- `SectionTabs.tsx` — full rewrite, remove ArrowSegment import
- `ArrowSegment.tsx` — **DELETE**

### 2. Evaluate Overview Tab Necessity

The Info Architecture reviewer proposed removing Overview entirely because:
- It duplicates Data tab's stat chips and overview card
- The README viewer is in the ReadmeDrawer
- The activity timeline is unique but low-traffic

**Recommendation: KEEP Overview but simplify.** It serves as a dashboard/landing page showing project health at a glance. The alternative (landing on Data tab with 0 records) is less welcoming. However, prevent duplication:
- Overview stat cards should link to respective tabs (click coverage -> Data tab)
- Overview README section should open ReadmeDrawer, not embed viewer
- Overview should NOT show the `DatasetOverviewCard` that also appears in Data tab

### 3. Show Tabs During Plan Preview

**Current bug:** `DatasetDetailContentV2.tsx:499` hides tabs when `isPlanPreviewActive`. The spec says tabs should always be visible.

```tsx
// BEFORE (DatasetDetailContentV2.tsx:498-499)
{!isPlanPreviewActive && (
  <DatasetUtilityBar ... />
)}

// AFTER — always show tabs
<DatasetUtilityBar ... />
```

When the user clicks a tab during plan preview, the workspace switches to that tab content and `isPlanPreviewActive` becomes false. The `ActivePlanBanner` appears to let them return.

### 4. Fix Locked Tab Interaction

**Current bug:** Locked tabs pass `onClick={() => {}}` making them focusable buttons with pointer cursor.

```tsx
// BEFORE (SectionTabs.tsx:177)
onClick={isLocked ? () => {} : () => onSectionChange(tab.id)}

// AFTER — locked tabs should not have click handler
// and should show cursor-not-allowed
```

---

## Files Affected

| File | Change |
|------|--------|
| `SectionTabs.tsx` | Rewrite: remove ArrowSegment, simple tabs with bottom-border active state |
| `ArrowSegment.tsx` | **DELETE** |
| `DatasetDetailContentV2.tsx:498-499` | Show tabs during plan preview |

# Open Issues & Validation Checklist

---

## Out-of-Scope Issues

These items were identified by reviewers but are **out of scope** for this proposal:

1. **Simple Mode for evaluation**: Form-based evaluator for non-technical users (P1, significant effort)
2. **VS Code patterns** (status bar, command palette): Aspirational; implement incrementally
3. **Mobile responsiveness**: Desktop-focused for now
4. **Tool result renderers**: Only 2 of 35 tools have custom renderers; needs separate effort
5. **Plan versioning UI**: Version history in plan editor drawer (deferred to post-Phase B)
6. **Progressive disclosure for new users**: Welcome overlay/tutorial (needs design exploration)
7. **Race condition in auto-trigger**: `LucyDatasetAssistant.tsx:169-217` timer + event race (needs careful refactor)

---

## Validation Checklist

After implementation, verify:

### P0 — Blockers
- [ ] PlanCard visible in sidebar when plan exists, regardless of message count
- [ ] Workspace tabs visible during plan preview
- [ ] Clicking a tab during plan preview switches to tab content, shows ActivePlanBanner
- [ ] Confirmation dialog appears before plan approval (both PlanCard and PlanPreview)
- [ ] Connection state shows retry after 15s, not forever spinner
- [ ] Chat errors have retry and dismiss buttons
- [ ] ArrowSegment fully removed, simple horizontal tabs render
- [ ] Terminology standardized: "evaluation" not "grader/quality scoring"

### P1 — Structural
- [ ] Collapsed sidebar shows activity indicators (pulsing dot, step counter)
- [ ] Locked tabs show `cursor-not-allowed`, no hover effects
- [ ] Deploy tab shows deployment guidance (not empty)
- [ ] Quick actions send structured prompts, not label text
- [ ] ReadmeDrawer and DocsDrawer use consistent width (50vw)
- [ ] Plan execution has cancel mechanism
- [ ] Plan execution persists through page refresh
- [ ] No zinc-* hardcoded colors in EvaluationConfigPanel
- [ ] No zinc-* hardcoded colors in FinetuneConfigPanel

### P1 — Explorer File-Tree + Dynamic Tabs (Phase B8-B9, Vision A)
- [ ] Sidebar tab strip shows Explorer and Lucy tabs
- [ ] Explorer panel shows VS Code-style file tree (readme.md, plan.md, tasks.md, logs.md, documents/, topics/, evaluations/, finetune/, quick-stats/)
- [ ] Single-clicking a file opens it as a preview tab (italic title, replaced by next preview)
- [ ] Double-clicking a file pins the tab (normal title, persists)
- [ ] Tab close (×) closes the tab; if active, activates the next tab
- [ ] File tree updates in real-time as Lucy works (new records, job status changes, etc.)
- [ ] Lucy tab shows unread badge when Explorer is active and Lucy has new messages
- [ ] Sidebar collapse/expand preserves last active tab
- [ ] Open tabs saved to localStorage and restored on revisit

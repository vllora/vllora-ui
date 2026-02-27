# Dataset README Generation

## Overview

Each dataset can have a README — a markdown document authored by the Lucy agent that provides a narrative overview of the dataset, its structure, quality, and provenance.

## How It Works

The README is **agent-authored only**. Lucy writes it via the `update_dataset_readme` tool. There is no template generator or auto-update fallback — if Lucy hasn't written a README, the dataset shows an empty state.

### `readmeSource` Field

The `Dataset.readmeSource` field is always `'agent'` for READMEs written by Lucy via `update_dataset_readme`. Datasets without a README have `readme` as `undefined`.

## Agent README Flow

During plan execution:
1. Agent executes all plan steps (topics -> data -> grader -> eval -> training)
2. As the **final step**, agent writes a comprehensive README based on its execution context
3. Calls `update_dataset_readme({ dataset_id, readme_content: "..." })`
4. Content is saved to IndexedDB with `readmeSource: 'agent'`

Outside plan execution (user asks "update the readme" or clicks regenerate button):
1. The regenerate button in `ReadmeHeaderActions` (or the CTA in `ReadmeEmptyState`) emits `vllora_lucy_prompt` with a prompt asking Lucy to write/update the README
2. Agent calls `get_dataset_state` to gather context
3. Writes the README
4. Calls `update_dataset_readme`

## Data Model

```typescript
interface Dataset {
  // ... existing fields

  /** Agent-written README markdown content */
  readme?: string;

  /** Last time README was updated */
  readmeUpdatedAt?: number;

  /** Source of the README content — always 'agent' */
  readmeSource?: 'agent';
}
```

## Hook: `useDatasetReadme`

Located at `src/hooks/useDatasetReadme.ts`. A minimal hook (~45 lines) that exposes:

- `readme: string | null` — from `dataset.readme`
- `readmeUpdatedAt: number | null` — from `dataset.readmeUpdatedAt`
- `exportReadme()` — downloads the README as a `.md` file

No auto-generation, no data watchers, no event listeners.

## UI Components

### README Viewer (`src/components/datasets/readme-viewer/`)

- `DatasetReadmeViewer` — renders the markdown with header actions
- `ReadmeHeaderActions` — copy to clipboard + export as file + "Ask Lucy to rewrite" buttons
- `ReadmeEmptyState` — shown when no README exists, with CTA to ask Lucy to write one

### Where It Appears

1. **Overview tab** (`DatasetOverviewPanel`) — dual-pane layout with Overview + README tabs on the left
2. **readme.md tab** — standalone full-height viewer opened from the explorer sidebar

## Tool: `update_dataset_readme`

Located at `src/lib/distri-finetune-tools/steps/update-dataset-readme.ts`.

```typescript
// Parameters
{
  dataset_id: string;
  readme_content: string;  // Full markdown content
}
```

Saves the README to IndexedDB and emits a refresh event.

## Files

| File | Purpose |
|------|---------|
| `src/hooks/useDatasetReadme.ts` | Hook exposing readme + export |
| `src/components/datasets/readme-viewer/index.tsx` | Main viewer component |
| `src/components/datasets/readme-viewer/ReadmeHeaderActions.tsx` | Copy + export + regenerate (via Lucy) buttons |
| `src/components/datasets/readme-viewer/ReadmeEmptyState.tsx` | Empty state with CTA to ask Lucy |
| `src/lib/distri-finetune-tools/steps/update-dataset-readme.ts` | Agent tool to write README |

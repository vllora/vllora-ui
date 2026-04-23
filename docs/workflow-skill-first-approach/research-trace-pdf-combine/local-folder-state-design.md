# Local Folder as Source of Truth — Design Document

> **Purpose**: Fix the local-files-vs-gateway-state divergence that confuses agents and users.
> **Problem**: Local `topics.json` has 10 flat leaves, but gateway has 16 topics with hierarchy. Anyone reading local files gets the wrong picture. AI agents waste time investigating non-issues.
> **Date**: 2026-04-15
> **Status**: Design

## Problem

The finetune pipeline agent creates artifacts locally and uploads them to the gateway. But these two states diverge:

| Artifact | Local file | Gateway state | Divergence |
|----------|-----------|---------------|------------|
| Topics | 10 leaf topics (flat) | 16 topics (6 parents + 10 leaves with parent_id) | Agent created parents via API, not in file |
| Records | 299 in training.jsonl | 200 uploaded (partial batch) | Upload may be incomplete |
| Knowledge | knowledge_parts.json | knowledge source with parts | Names differ (.pdf vs no extension) |
| Grader | quality-checker/grader.js | evaluator version in gateway | Multiple versions in gateway |

This causes:
1. **Debugging confusion**: Agents read local files, draw wrong conclusions
2. **Re-upload failures**: Agent doesn't know what's already uploaded
3. **User confusion**: Inspecting local files shows incomplete picture
4. **Subagent coordination**: Multiple agents can't tell what others uploaded

## Research: How Other Tools Solve This

| Tool | Approach | Local is... | Remote is... |
|------|----------|-------------|-------------|
| **Terraform** | State file (.tfstate) bridges config↔remote | Desired state | Actual state, with state file as cache |
| **Kubernetes** | Cluster is source of truth, local is desired | Desired state | Source of truth |
| **dbt** | Local SQL is source of truth, warehouse is derived | Source of truth | Derived |
| **Git** | Full state local (.git/), remote is sync target | Source of truth | Sync target |
| **MLflow** | Tracking server is source of truth | Upload source | Source of truth |

## Recommendation: Local-First (dbt/Git model)

**Local files are the complete source of truth. Gateway is derived.**

This matches the existing "skill-first" architecture — the skill drives the pipeline, the gateway persists results. The agent and user both read files. Files work offline.

### Principle: Every local file is self-contained

Each artifact file must contain the FULL picture. No information should only exist in the gateway.

| File | Must contain |
|------|-------------|
| `topics.json` | ALL topics (parents + leaves) with full hierarchy (`children` arrays) |
| `training.jsonl` | ALL records (one per line) |
| `relations.json` | ALL topic-part relations |
| `config.json` | Workflow ID, gateway URL, input mode, objective |
| `analysis.json` | ALL section analyses (sources, trace-influence, training-data, quality) |

### Sync manifest: `finetune-project/.sync-state.json`

Tracks what has been uploaded to the gateway (like `.tfstate`):

```json
{
  "workflow_id": "23f78995-...",
  "gateway_url": "http://localhost:9090",
  "last_sync": "2026-04-15T14:00:00Z",
  "artifacts": {
    "topics.json": {
      "hash": "sha256:abc123...",
      "uploaded_at": "2026-04-15T13:45:00Z",
      "gateway_count": 16,
      "status": "synced"
    },
    "training.jsonl": {
      "hash": "sha256:def456...",
      "uploaded_at": "2026-04-15T13:50:00Z",
      "gateway_count": 299,
      "status": "synced"
    },
    "quality-checker/grader.js": {
      "hash": "sha256:ghi789...",
      "uploaded_at": "2026-04-15T13:55:00Z",
      "status": "synced"
    }
  }
}
```

### Sync protocol

1. **Write locally first**: Agent writes `topics.json` with full hierarchy
2. **Upload via `finetune sync`**: Reads local file, computes hash, compares to `.sync-state.json`
   - If hash unchanged: skip (already uploaded)
   - If hash changed: upload (PUT semantics — replace all)
   - Update `.sync-state.json` after success
3. **Drift detection**: `finetune diff` compares local hash vs sync-state hash (local drift) and optionally queries gateway (remote drift)
4. **Pull from gateway**: `finetune sync --pull` downloads gateway state into local files (for recovery)

### Upload semantics: PUT not POST

Current `upload-topics` uses POST (append), which causes duplicates on retry. Change to PUT semantics:
- Delete all existing topics for workflow
- Upload all topics from local file
- This is idempotent — safe to retry

### For AI agents: Read `.sync-state.json` to understand state

Instead of querying the gateway, the agent reads `.sync-state.json`:
```
if .sync-state.json says topics.json hash matches and status=synced:
  → topics are uploaded, no need to re-upload
if .sync-state.json doesn't exist or hash differs:
  → need to upload
```

### What changes in SKILL.md

1. Agent MUST write complete artifacts locally FIRST
2. Agent uses `finetune sync` instead of individual upload commands
3. Agent reads `.sync-state.json` to check upload status
4. Never create gateway objects via raw API calls — always write file first, then sync

## Implementation Plan

### Phase 1: Enforce complete local files (immediate)
- SKILL.md: mandate full hierarchy in topics.json
- `upload-topics`: after upload, write back full hierarchy to topics.json (including parent_ids assigned by gateway)

### Phase 2: Sync manifest (short-term)
- Add `.sync-state.json` tracking
- `upload-*` commands update sync state after success
- Agent reads sync state before uploading

### Phase 3: Unified sync command (medium-term)
- `finetune sync` replaces individual upload commands
- `finetune diff` shows local vs gateway drift
- `finetune sync --pull` for recovery

## References

- Terraform State: https://developer.hashicorp.com/terraform/language/state
- Kubernetes Apply: https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/
- dbt Manifest: https://docs.getdbt.com/reference/artifacts/manifest-json
- Git Internals: https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain

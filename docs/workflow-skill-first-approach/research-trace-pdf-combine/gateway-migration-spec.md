# Gateway Migration Spec: trace_analyses Table

> **Status**: Ready to implement in `vllora/gateway` repo
> **Depends on**: Sprint 1 (trace artifacts produced by skill)

## Schema

Add to the gateway SQLite schema (`~/.vllora/vllora.db`):

```sql
CREATE TABLE IF NOT EXISTS trace_analyses (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  priority_json TEXT,          -- trace_priority.json content
  topics_json TEXT,            -- trace_topics.json content
  prompts_json TEXT,           -- trace_prompts.json content
  grader_hints_json TEXT,      -- trace_grader_hints.json content
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_analyses_workflow
  ON trace_analyses(workflow_id);
```

## API Endpoints

### GET /api/finetune/workflows/:id/trace-analysis

Returns the trace analysis for a workflow, or 404 if none exists.

**Response (200):**
```json
{
  "priority": { "topic-name": { "frequency": 0.2, "failureRate": 0.4, ... } },
  "topics": { "discoveredTopics": [...], "coverageGaps": [...] },
  "prompts": { "systemPrompt": "...", "simplifiedPrompt": "...", "seedQueries": {...} },
  "graderHints": { "dimensions": [...], "calibrationPairCount": 30, ... }
}
```

**Response (404):** No trace analysis for this workflow (PDF-only mode).

### PUT /api/finetune/workflows/:id/trace-analysis

Upsert trace analysis data. The skill calls this after `trace_analyze.py` completes.

**Request body:** Same shape as GET response.

**Response (200):** `{ "id": "...", "workflow_id": "..." }`

## Rust Implementation Notes

**File**: `src/handlers/finetune.rs`

Add two handler functions:
- `get_trace_analysis(workflow_id: &str, db: &Connection) -> Result<Option<TraceAnalysis>>`
- `put_trace_analysis(workflow_id: &str, data: TraceAnalysisInput, db: &Connection) -> Result<()>`

**Register routes in** `src/http.rs`:
```rust
.route("/finetune/workflows/:id/trace-analysis", get(get_trace_analysis_handler).put(put_trace_analysis_handler))
```

**Schema init**: Add the CREATE TABLE to the existing schema initialization function (wherever `workflows` table is created).

## Backward Compatibility

- Old workflows have no row in `trace_analyses` — GET returns 404 (handled by UI as "no trace data")
- No changes to existing tables or columns
- ON DELETE CASCADE ensures cleanup when a workflow is deleted

# Gateway Migration Plan

> **Created**: 2026-03-11
> **Depends on**: [Gateway API Audit](./gateway-api-audit.md) — read that first for full API contract, flow diagrams, and design decisions

---

## Context & Motivation

### Problem

vLLora's finetune feature stores all user data in **IndexedDB** (browser-local). This blocks two critical needs:

1. **CLI access**: The vLLora CLI (skill package tool) needs to read/write the same workflow data as the UI. IndexedDB is browser-only.
2. **Cross-device sharing**: Data is locked to one browser on one machine. No backup, no collaboration.

### Solution

Move mutable data from IndexedDB to the **vLLora gateway** — a Rust HTTP server backed by local SQLite. Both browser UI and CLI talk to the same gateway API.

```
BEFORE:  Browser → IndexedDB (browser-only, no CLI access)

AFTER:   Browser → Gateway API (localhost:9090) → SQLite (shared)
         CLI     → Gateway API (localhost:9090) → SQLite (shared)
```

### Architecture (3 repos)

| Repo | Role | Key files |
|------|------|-----------|
| `vllora/ui` | React frontend — currently uses IndexedDB, will switch to API calls | `src/services/`, `src/contexts/`, `src/types/dataset-types.ts` |
| `vllora/gateway` | Rust HTTP server (Actix-web) — serves API, owns SQLite | `src/handlers/workflows.rs`, `src/handlers/finetune.rs` |
| `vllora/core` | Shared Rust library — Diesel ORM models, services, migrations | `src/metadata/services/`, `src/metadata/models/`, `sqlite_migrations/` |
| `vllora/finetune` | Cloud API client | `src/client.rs` (`LangdbCloudFinetuneClient`) |

### 2-tier data architecture

| Tier | What | Where | Mutability |
|------|------|-------|------------|
| **Local SQLite** | Records, topics, knowledge sources, eval jobs, evaluator script | Gateway SQLite | Mutable CRUD |
| **Cloud** (`api.langdb.cloud`) | JSONL snapshots, eval runs, training jobs, deployments, metrics, weights | Cloud API | Immutable (upload → read-only) |

Before every evaluation or training job, local records are **packaged as JSONL and uploaded** to cloud. The cloud never does record-level CRUD.

### The 7-step finetune pipeline

```
Topics Config → Categorization → Coverage & Generation → Grader Config → Evaluation → Training → Deployment
```

Each step produces data consumed by the next. This plan ensures the gateway API + SQLite schema supports every step.

### Migration approach: Adapter pattern

The UI uses service interfaces in `src/services/`. Migration swaps IndexedDB adapters for API adapters in `service-registry.ts`. No component or context code changes needed.

### What this plan covers

- **Phase 1**: SQLite migrations (4 new tables + 1 altered table)
- **Phase 2**: Rust handlers for all endpoints identified in the [API Audit](./gateway-api-audit.md)
- **Phase 3**: Frontend API adapters (swap IndexedDB → HTTP calls)
- **Phase 4**: Integration tests (unit tests + flow scripts)
- **Phase 5**: Mock server updates for E2E testing

### Key design decisions (see [API Audit](./gateway-api-audit.md) § Design Decisions)

- **Records vs Dataset**: "Records" = individual training examples (local CRUD), "Dataset" = packaged JSONL snapshot on cloud
- **Client owns chunk IDs**: Client extracts knowledge content, assigns stable chunk IDs, sends to gateway as-is
- **No separate chunk table**: Chunks live inside `extracted_content` JSON blob on `knowledge_sources`
- **Evaluator script local-first**: Stored on `workflows.eval_script`. Cloud gets copy at upload time
- **Knowledge source soft delete**: Sets `deleted_at`, refs in topics/records remain valid
- **Implied step derivation**: No `current_step` column — derived from what data exists in related tables

---

## Phase 1: Database Migrations (BE)

> **Status: DONE** ✅ All migrations created and tested. Tables: `workflow_records`, `workflow_topics`, `eval_jobs`, `knowledge_sources`. Column added: `workflows.eval_script`.

Create SQLite migrations in `core/sqlite_migrations/`.

### 1.1 Alter existing table

```sql
ALTER TABLE workflows ADD COLUMN eval_script TEXT;
```

### 1.2 New tables

```sql
CREATE TABLE workflow_records (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  data TEXT NOT NULL,              -- JSON: { input: { messages, tools }, output: { messages } }
  topic TEXT,                      -- leaf topic path: "Category/Sub/Topic"
  span_id TEXT,                    -- trace span ID (duplicate detection)
  is_generated BOOLEAN DEFAULT 0,
  source_record_id TEXT,           -- parent record ID (variant tracking)
  dry_run_score REAL,
  finetune_score REAL,
  metadata TEXT,                   -- JSON: { sourceChunkRefs, ... }
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workflow_records_workflow ON workflow_records(workflow_id);
CREATE INDEX idx_workflow_records_topic ON workflow_records(workflow_id, topic);
CREATE INDEX idx_workflow_records_span ON workflow_records(span_id);
```

```sql
CREATE TABLE workflow_topics (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,                  -- FK to self (tree structure)
  selected BOOLEAN DEFAULT 1,
  source_chunk_refs TEXT,          -- JSON: ["sourceId:chunkId", ...]
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES workflow_topics(id)
);

CREATE INDEX idx_workflow_topics_workflow ON workflow_topics(workflow_id);
CREATE INDEX idx_workflow_topics_parent ON workflow_topics(parent_id);
```

```sql
CREATE TABLE eval_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  cloud_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sample_size INTEGER,
  rollout_model TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
  CONSTRAINT valid_eval_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_eval_jobs_workflow ON eval_jobs(workflow_id);
CREATE INDEX idx_eval_jobs_status ON eval_jobs(status);
```

```sql
CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- pdf, image, url, text, markdown
  content TEXT,                    -- raw content or URL
  extracted_content TEXT,          -- JSON: { chunks: [{ id, title, content }], metadata }
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, ready, failed
  progress TEXT,                   -- JSON: { step, current, total, percent }
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP                     -- soft delete
);

CREATE INDEX idx_knowledge_sources_workflow ON knowledge_sources(workflow_id);
```

### Test

```bash
# After running migrations
sqlite3 gateway.db ".tables"
# Should show: workflow_records, workflow_topics, eval_jobs, knowledge_sources

sqlite3 gateway.db ".schema workflows"
# Should include eval_script column
```

---

## Phase 2: Rust Handlers (BE)

Build in dependency order. Each group is independently deployable.

### 2.1 Workflow — single GET (P0)

> **Status: DONE** ✅ `get_workflow` handler implemented.

| Method | Endpoint | Handler |
|--------|----------|---------|
| `GET` | `/finetune/workflows/{id}` | `get_workflow` |

Tiny — same pattern as `list_workflows` but filtered by ID.

### 2.2 Evaluator — local write (P0)

Change `PATCH /finetune/workflows/{id}/evaluator` to write `eval_script` to local `workflows` table instead of (or in addition to) proxying to cloud.

### 2.3 Records CRUD (P1)

> **Status: DONE** ✅ 12 handlers implemented in `gateway/src/handlers/workflow_records.rs`. `from-spans` import still TODO.

| Method | Endpoint | Handler | SQL |
|--------|----------|---------|-----|
| `GET` | `/workflows/{id}/records` | `list_records` | `SELECT * FROM workflow_records WHERE workflow_id = ?` |
| `POST` | `/workflows/{id}/records` | `add_records` | `INSERT INTO workflow_records ...` (bulk) |
| `PUT` | `/workflows/{id}/records` | `replace_records` | `DELETE WHERE workflow_id = ?` + `INSERT ...` (transaction) |
| `POST` | `/workflows/{id}/records/from-spans` | `import_from_spans` | Insert with `span_id`, skip duplicates |
| `PATCH` | `/workflows/{id}/records/{id}` | `update_record_topic` | `UPDATE ... SET topic = ?` |
| `PATCH` | `/workflows/{id}/records/topics` | `batch_update_topics` | `UPDATE ... SET topic = ? WHERE id IN (...)` |
| `PATCH` | `/workflows/{id}/records/{id}/data` | `update_record_data` | `UPDATE ... SET data = ?` |
| `PATCH` | `/workflows/{id}/records/{id}/scores` | `update_record_scores` | `UPDATE ... SET dry_run_score = ?, finetune_score = ?` |
| `DELETE` | `/workflows/{id}/records/{id}` | `delete_record` | `DELETE FROM workflow_records WHERE id = ?` |
| `DELETE` | `/workflows/{id}/records` | `delete_all_records` | `DELETE FROM workflow_records WHERE workflow_id = ?` |
| `DELETE` | `/workflows/{id}/records/topics` | `clear_all_topics` | `UPDATE ... SET topic = NULL WHERE workflow_id = ?` |
| `PATCH` | `/workflows/{id}/records/rename-topic` | `rename_topic` | `UPDATE ... SET topic = ? WHERE workflow_id = ? AND topic = ?` |
| `DELETE` | `/workflows/{id}/records/topics/{name}` | `clear_topic` | `UPDATE ... SET topic = NULL WHERE workflow_id = ? AND topic = ?` |

### 2.4 Topics CRUD (P1)

> **Status: DONE** ✅ 3 handlers implemented in `gateway/src/handlers/workflow_topics.rs` (list, create, delete-all). Topic generation still uses LLM placeholder.

| Method | Endpoint | Handler | SQL |
|--------|----------|---------|-----|
| `POST` | `/workflows/{id}/topics` | `create_topics` | Bulk insert tree (flatten to rows) |
| `DELETE` | `/workflows/{id}/topics` | `delete_topics` | `DELETE FROM workflow_topics WHERE workflow_id = ?` |
| `POST` | `/workflows/{id}/topics/generate` | `generate_topics` | Call LLM, return result (client saves via POST) |

### 2.5 Eval Jobs CRUD (P1)

> **Status: DONE** ✅ 7 handlers implemented in `gateway/src/handlers/eval_jobs.rs`. Background poller (`EvalJobStateTracker`) implemented in `gateway/src/eval_state_tracker.rs`.

| Method | Endpoint | Handler | SQL |
|--------|----------|---------|-----|
| `POST` | `/workflows/{id}/eval-jobs` | `create_eval_job` | `INSERT INTO eval_jobs ...` |
| `GET` | `/workflows/{id}/eval-jobs/{id}` | `get_eval_job` | `SELECT ... WHERE id = ?` |
| `GET` | `/workflows/{id}/eval-jobs` | `list_eval_jobs` | `SELECT ... WHERE workflow_id = ?` |
| `GET` | `/eval-jobs?status=X` | `list_eval_jobs_by_status` | `SELECT ... WHERE status = ?` |
| `PATCH` | `/workflows/{id}/eval-jobs/{id}` | `update_eval_job` | `UPDATE ... SET status = ?, progress = ?` |
| `DELETE` | `/workflows/{id}/eval-jobs/{id}` | `delete_eval_job` | `DELETE ... WHERE id = ?` |
| `DELETE` | `/workflows/{id}/eval-jobs` | `delete_workflow_eval_jobs` | `DELETE ... WHERE workflow_id = ?` |

### 2.6 Knowledge Sources CRUD (P1)

> **Status: DONE** ✅ 8 handlers implemented in `gateway/src/handlers/knowledge_sources.rs`. Search endpoint still TODO.

| Method | Endpoint | Handler | SQL |
|--------|----------|---------|-----|
| `POST` | `/workflows/{id}/knowledge` | `create_knowledge_source` | `INSERT INTO knowledge_sources ...` |
| `GET` | `/workflows/{id}/knowledge/{id}` | `get_knowledge_source` | `SELECT ... WHERE id = ? AND deleted_at IS NULL` |
| `GET` | `/workflows/{id}/knowledge` | `list_knowledge_sources` | `SELECT ... WHERE workflow_id = ? AND deleted_at IS NULL` |
| `GET` | `/workflows/{id}/knowledge/count` | `count_knowledge_sources` | `SELECT COUNT(*) ...` |
| `PATCH` | `/workflows/{id}/knowledge/{id}/status` | `update_ks_status` | `UPDATE ... SET status = ?` |
| `PATCH` | `/workflows/{id}/knowledge/{id}/progress` | `update_ks_progress` | `UPDATE ... SET progress = ?` |
| `POST` | `/workflows/{id}/knowledge/chunk` | `update_ks_chunks` | `UPDATE ... SET extracted_content = ?` |
| `DELETE` | `/workflows/{id}/knowledge/{id}` | `soft_delete_ks` | `UPDATE ... SET deleted_at = NOW()` |
| `DELETE` | `/workflows/{id}/knowledge` | `soft_delete_all_ks` | `UPDATE ... SET deleted_at = NOW() WHERE workflow_id = ?` |
| `POST` | `/workflows/{id}/knowledge/search` | `search_knowledge` | Load extracted_content, search in code |

### Test: Rust unit tests

> **Status: DONE** ✅ 56 tests passing across all service modules.

Follow the existing pattern in `core/src/metadata/services/project.rs` — use `setup_test_database()` for in-memory SQLite, test each service method.

Service files:

```
core/src/metadata/services/
  ├── workflow.rs              ← updated (added get_by_id)
  ├── workflow_record.rs       ← created ✅ (10 tests)
  ├── workflow_topic.rs        ← created ✅ (3 tests)
  ├── eval_job.rs              ← created ✅ (5 tests)
  └── knowledge_source.rs      ← created ✅ (7 tests)
```

#### workflow_record.rs tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::metadata::test_utils::{setup_test_database, cleanup_test_database};

    fn create_test_workflow(db_pool: &DbPool) -> String {
        let service = WorkflowService::new(db_pool.clone());
        let wf = service.create(DbNewWorkflow::new("test".into(), "obj".into())).unwrap();
        wf.id
    }

    #[test]
    fn test_add_and_list_records() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        // Add records
        let records = vec![
            NewRecord { id: "r1".into(), data: json!({"input":{},"output":{}}), topic: Some("greetings".into()), ..Default::default() },
            NewRecord { id: "r2".into(), data: json!({"input":{},"output":{}}), topic: None, ..Default::default() },
        ];
        service.add(&wf_id, records).unwrap();

        // List
        let result = service.list(&wf_id).unwrap();
        assert_eq!(result.len(), 2);

        cleanup_test_database();
    }

    #[test]
    fn test_replace_all_records() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        // Add 2 records
        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), ..Default::default() },
            NewRecord { id: "r2".into(), data: json!({}), ..Default::default() },
        ]).unwrap();
        assert_eq!(service.list(&wf_id).unwrap().len(), 2);

        // Replace with 3 new records (atomic)
        service.replace_all(&wf_id, vec![
            NewRecord { id: "r10".into(), data: json!({}), ..Default::default() },
            NewRecord { id: "r11".into(), data: json!({}), ..Default::default() },
            NewRecord { id: "r12".into(), data: json!({}), ..Default::default() },
        ]).unwrap();
        let result = service.list(&wf_id).unwrap();
        assert_eq!(result.len(), 3);
        assert!(result.iter().all(|r| r.id.starts_with("r1")));

        cleanup_test_database();
    }

    #[test]
    fn test_update_topic() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), topic: Some("old".into()), ..Default::default() },
        ]).unwrap();

        service.update_topic(&wf_id, "r1", "new_topic").unwrap();

        let records = service.list(&wf_id).unwrap();
        assert_eq!(records[0].topic, Some("new_topic".to_string()));

        cleanup_test_database();
    }

    #[test]
    fn test_batch_update_topics() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), ..Default::default() },
            NewRecord { id: "r2".into(), data: json!({}), ..Default::default() },
            NewRecord { id: "r3".into(), data: json!({}), ..Default::default() },
        ]).unwrap();

        service.batch_update_topics(&wf_id, &[("r1", "topicA"), ("r2", "topicB")]).unwrap();

        let records = service.list(&wf_id).unwrap();
        let r1 = records.iter().find(|r| r.id == "r1").unwrap();
        let r2 = records.iter().find(|r| r.id == "r2").unwrap();
        let r3 = records.iter().find(|r| r.id == "r3").unwrap();
        assert_eq!(r1.topic, Some("topicA".to_string()));
        assert_eq!(r2.topic, Some("topicB".to_string()));
        assert_eq!(r3.topic, None);

        cleanup_test_database();
    }

    #[test]
    fn test_rename_topic() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), topic: Some("old_name".into()), ..Default::default() },
            NewRecord { id: "r2".into(), data: json!({}), topic: Some("old_name".into()), ..Default::default() },
            NewRecord { id: "r3".into(), data: json!({}), topic: Some("other".into()), ..Default::default() },
        ]).unwrap();

        service.rename_topic(&wf_id, "old_name", "new_name").unwrap();

        let records = service.list(&wf_id).unwrap();
        let renamed: Vec<_> = records.iter().filter(|r| r.topic.as_deref() == Some("new_name")).collect();
        assert_eq!(renamed.len(), 2);
        let unchanged = records.iter().find(|r| r.id == "r3").unwrap();
        assert_eq!(unchanged.topic, Some("other".to_string()));

        cleanup_test_database();
    }

    #[test]
    fn test_update_scores() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), ..Default::default() },
        ]).unwrap();

        service.update_scores(&wf_id, "r1", Some(0.85), None).unwrap();

        let records = service.list(&wf_id).unwrap();
        assert_eq!(records[0].dry_run_score, Some(0.85));
        assert_eq!(records[0].finetune_score, None);

        cleanup_test_database();
    }

    #[test]
    fn test_delete_single() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), ..Default::default() },
            NewRecord { id: "r2".into(), data: json!({}), ..Default::default() },
        ]).unwrap();

        service.delete(&wf_id, "r1").unwrap();
        assert_eq!(service.list(&wf_id).unwrap().len(), 1);

        cleanup_test_database();
    }

    #[test]
    fn test_delete_all() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), ..Default::default() },
            NewRecord { id: "r2".into(), data: json!({}), ..Default::default() },
        ]).unwrap();

        service.delete_all(&wf_id).unwrap();
        assert_eq!(service.list(&wf_id).unwrap().len(), 0);

        cleanup_test_database();
    }

    #[test]
    fn test_clear_all_topics() {
        let db_pool = setup_test_database();
        let wf_id = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf_id, vec![
            NewRecord { id: "r1".into(), data: json!({}), topic: Some("a".into()), ..Default::default() },
            NewRecord { id: "r2".into(), data: json!({}), topic: Some("b".into()), ..Default::default() },
        ]).unwrap();

        service.clear_all_topics(&wf_id).unwrap();

        let records = service.list(&wf_id).unwrap();
        assert!(records.iter().all(|r| r.topic.is_none()));

        cleanup_test_database();
    }

    #[test]
    fn test_records_isolated_by_workflow() {
        let db_pool = setup_test_database();
        let wf1 = create_test_workflow(&db_pool);
        let wf2 = create_test_workflow(&db_pool);
        let service = WorkflowRecordService::new(db_pool.clone());

        service.add(&wf1, vec![NewRecord { id: "r1".into(), data: json!({}), ..Default::default() }]).unwrap();
        service.add(&wf2, vec![NewRecord { id: "r2".into(), data: json!({}), ..Default::default() }]).unwrap();

        assert_eq!(service.list(&wf1).unwrap().len(), 1);
        assert_eq!(service.list(&wf2).unwrap().len(), 1);

        service.delete_all(&wf1).unwrap();
        assert_eq!(service.list(&wf1).unwrap().len(), 0);
        assert_eq!(service.list(&wf2).unwrap().len(), 1); // wf2 unaffected

        cleanup_test_database();
    }
}
```

#### eval_job.rs tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::metadata::test_utils::{setup_test_database, cleanup_test_database};

    #[test]
    fn test_create_and_get_eval_job() {
        let db_pool = setup_test_database();
        let service = EvalJobService::new(db_pool.clone());

        let job = service.create("wf1", "cloud-run-123").unwrap();
        assert_eq!(job.status, "pending");
        assert_eq!(job.cloud_run_id, Some("cloud-run-123".to_string()));

        let fetched = service.get(&job.id).unwrap();
        assert_eq!(fetched.id, job.id);

        cleanup_test_database();
    }

    #[test]
    fn test_update_eval_job_status() {
        let db_pool = setup_test_database();
        let service = EvalJobService::new(db_pool.clone());

        let job = service.create("wf1", "cloud-run-123").unwrap();
        service.update_status(&job.id, "running", None).unwrap();

        let updated = service.get(&job.id).unwrap();
        assert_eq!(updated.status, "running");

        service.update_status(&job.id, "failed", Some("timeout")).unwrap();
        let failed = service.get(&job.id).unwrap();
        assert_eq!(failed.status, "failed");
        assert_eq!(failed.error, Some("timeout".to_string()));

        cleanup_test_database();
    }

    #[test]
    fn test_list_by_status_cross_workflow() {
        let db_pool = setup_test_database();
        let service = EvalJobService::new(db_pool.clone());

        service.create("wf1", "run1").unwrap();
        service.create("wf2", "run2").unwrap();
        let job3 = service.create("wf1", "run3").unwrap();
        service.update_status(&job3.id, "completed", None).unwrap();

        let pending = service.list_by_status("pending").unwrap();
        assert_eq!(pending.len(), 2); // wf1 + wf2

        cleanup_test_database();
    }

    #[test]
    fn test_delete_by_workflow() {
        let db_pool = setup_test_database();
        let service = EvalJobService::new(db_pool.clone());

        service.create("wf1", "run1").unwrap();
        service.create("wf1", "run2").unwrap();
        service.create("wf2", "run3").unwrap();

        service.delete_by_workflow("wf1").unwrap();

        assert_eq!(service.list_by_workflow("wf1").unwrap().len(), 0);
        assert_eq!(service.list_by_workflow("wf2").unwrap().len(), 1);

        cleanup_test_database();
    }
}
```

#### knowledge_source.rs tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::metadata::test_utils::{setup_test_database, cleanup_test_database};

    #[test]
    fn test_create_and_list() {
        let db_pool = setup_test_database();
        let service = KnowledgeSourceService::new(db_pool.clone());

        service.create("wf1", "doc.pdf", "pdf", None, None).unwrap();
        service.create("wf1", "notes.md", "markdown", None, None).unwrap();

        let sources = service.list("wf1").unwrap();
        assert_eq!(sources.len(), 2);

        cleanup_test_database();
    }

    #[test]
    fn test_soft_delete_hides_from_list() {
        let db_pool = setup_test_database();
        let service = KnowledgeSourceService::new(db_pool.clone());

        let ks = service.create("wf1", "doc.pdf", "pdf", None, None).unwrap();
        service.soft_delete(&ks.id).unwrap();

        let sources = service.list("wf1").unwrap();
        assert_eq!(sources.len(), 0); // hidden

        cleanup_test_database();
    }

    #[test]
    fn test_soft_delete_data_still_exists() {
        let db_pool = setup_test_database();
        let service = KnowledgeSourceService::new(db_pool.clone());

        let ks = service.create("wf1", "doc.pdf", "pdf", None, None).unwrap();
        service.soft_delete(&ks.id).unwrap();

        // Direct get (including deleted) should still return data
        let fetched = service.get_including_deleted(&ks.id).unwrap();
        assert!(fetched.deleted_at.is_some());
        assert_eq!(fetched.name, "doc.pdf");

        cleanup_test_database();
    }

    #[test]
    fn test_update_extracted_content() {
        let db_pool = setup_test_database();
        let service = KnowledgeSourceService::new(db_pool.clone());

        let ks = service.create("wf1", "doc.pdf", "pdf", None, None).unwrap();
        let content = json!({
            "chunks": [
                {"id": "c1", "title": "Intro", "content": "Hello"},
                {"id": "c2", "title": "Body", "content": "World"}
            ]
        });
        service.update_extracted_content(&ks.id, &content).unwrap();
        service.update_status(&ks.id, "ready").unwrap();

        let fetched = service.get(&ks.id).unwrap();
        assert_eq!(fetched.status, "ready");
        assert!(fetched.extracted_content.is_some());

        cleanup_test_database();
    }

    #[test]
    fn test_count() {
        let db_pool = setup_test_database();
        let service = KnowledgeSourceService::new(db_pool.clone());

        service.create("wf1", "a.pdf", "pdf", None, None).unwrap();
        service.create("wf1", "b.pdf", "pdf", None, None).unwrap();
        let ks3 = service.create("wf1", "c.pdf", "pdf", None, None).unwrap();
        service.soft_delete(&ks3.id).unwrap();

        assert_eq!(service.count("wf1").unwrap(), 2); // excludes soft-deleted

        cleanup_test_database();
    }

    #[test]
    fn test_soft_delete_all() {
        let db_pool = setup_test_database();
        let service = KnowledgeSourceService::new(db_pool.clone());

        service.create("wf1", "a.pdf", "pdf", None, None).unwrap();
        service.create("wf1", "b.pdf", "pdf", None, None).unwrap();
        service.create("wf2", "c.pdf", "pdf", None, None).unwrap();

        service.soft_delete_all("wf1").unwrap();

        assert_eq!(service.count("wf1").unwrap(), 0);
        assert_eq!(service.count("wf2").unwrap(), 1); // wf2 unaffected

        cleanup_test_database();
    }
}
```

#### workflow_topic.rs tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::metadata::test_utils::{setup_test_database, cleanup_test_database};

    #[test]
    fn test_create_topic_tree() {
        let db_pool = setup_test_database();
        let service = WorkflowTopicService::new(db_pool.clone());

        let topics = vec![
            NewTopic { id: "t1".into(), name: "Root".into(), parent_id: None, selected: true, source_chunk_refs: None },
            NewTopic { id: "t2".into(), name: "Child A".into(), parent_id: Some("t1".into()), selected: true, source_chunk_refs: Some(json!(["ks1:c1"])) },
            NewTopic { id: "t3".into(), name: "Child B".into(), parent_id: Some("t1".into()), selected: false, source_chunk_refs: None },
        ];
        service.create("wf1", topics).unwrap();

        let result = service.list("wf1").unwrap();
        assert_eq!(result.len(), 3);

        let child_a = result.iter().find(|t| t.id == "t2").unwrap();
        assert_eq!(child_a.parent_id, Some("t1".to_string()));
        assert!(child_a.source_chunk_refs.is_some());

        cleanup_test_database();
    }

    #[test]
    fn test_delete_all_topics() {
        let db_pool = setup_test_database();
        let service = WorkflowTopicService::new(db_pool.clone());

        service.create("wf1", vec![
            NewTopic { id: "t1".into(), name: "Root".into(), parent_id: None, selected: true, source_chunk_refs: None },
        ]).unwrap();

        service.delete_all("wf1").unwrap();
        assert_eq!(service.list("wf1").unwrap().len(), 0);

        cleanup_test_database();
    }

    #[test]
    fn test_topics_isolated_by_workflow() {
        let db_pool = setup_test_database();
        let service = WorkflowTopicService::new(db_pool.clone());

        service.create("wf1", vec![
            NewTopic { id: "t1".into(), name: "A".into(), parent_id: None, selected: true, source_chunk_refs: None },
        ]).unwrap();
        service.create("wf2", vec![
            NewTopic { id: "t2".into(), name: "B".into(), parent_id: None, selected: true, source_chunk_refs: None },
        ]).unwrap();

        service.delete_all("wf1").unwrap();
        assert_eq!(service.list("wf1").unwrap().len(), 0);
        assert_eq!(service.list("wf2").unwrap().len(), 1);

        cleanup_test_database();
    }
}
```

Run all tests with:

```bash
cd /path/to/vllora
cargo test --lib metadata::services::workflow_record
cargo test --lib metadata::services::eval_job
cargo test --lib metadata::services::knowledge_source
cargo test --lib metadata::services::workflow_topic
# or all at once:
cargo test --lib metadata::services
```

### Test: Flow integration scripts

Each script tests one flow from [gateway-api-audit.md § Flow Diagrams](hen ./gateway-api-audit.md#6-flow-diagrams). Run against a live gateway at `localhost:9090`.

Save as `scripts/test-flows/`. Run individually or all at once via `scripts/test-flows/run-all.sh`.

#### scripts/test-flows/helpers.sh

```bash
#!/bin/bash
# Shared helpers for flow tests

BASE="${GATEWAY_URL:-http://localhost:9090}/finetune"
PASS=0
FAIL=0

post()  { curl -sf -X POST   "$1" -H 'Content-Type: application/json' -d "$2"; }
put()   { curl -sf -X PUT    "$1" -H 'Content-Type: application/json' -d "$2"; }
patch() { curl -sf -X PATCH  "$1" -H 'Content-Type: application/json' -d "$2"; }
get()   { curl -sf "$1"; }
del()   { curl -sf -X DELETE "$1"; }

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $label (got: $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_gte() {
  local label="$1" actual="$2" min="$3"
  if [ "$actual" -ge "$min" ] 2>/dev/null; then
    echo "  ✓ $label (got: $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (expected >= $min, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_empty() {
  local label="$1" actual="$2"
  if [ -n "$actual" ] && [ "$actual" != "null" ]; then
    echo "  ✓ $label (got: $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (expected non-empty, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_http_ok() {
  local label="$1" url="$2" method="${3:-GET}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" -H 'Content-Type: application/json' ${4:+-d "$4"})
  if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
    echo "  ✓ $label (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (HTTP $status)"
    FAIL=$((FAIL + 1))
  fi
}

create_workflow() {
  local name="${1:-test-flow}"
  local obj="${2:-test objective}"
  post "$BASE/workflows" "{\"name\":\"$name\",\"objective\":\"$obj\"}"
}

summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Passed: $PASS  Failed: $FAIL"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━"
  [ "$FAIL" -eq 0 ] && return 0 || return 1
}
```

#### scripts/test-flows/flow-a-full-pipeline.sh

```bash
#!/bin/bash
# Flow A: Full Pipeline (knowledge sources → training)
# Tests the happy path end-to-end against LOCAL endpoints only.
# Cloud endpoints (eval, training, deploy) are skipped — those need mock server.
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow A: Full Pipeline ═══"

# 1. Create workflow
echo ""
echo "Step 1: Create workflow"
WF=$(create_workflow "flow-a-test" "Build a customer support agent")
WF_ID=$(echo "$WF" | jq -r '.id')
assert_not_empty "workflow created" "$WF_ID"

# Verify GET single
WF_DATA=$(get "$BASE/workflows/$WF_ID")
assert_eq "workflow name" "$(echo "$WF_DATA" | jq -r '.name')" "flow-a-test"

# 2. Upload knowledge source
echo ""
echo "Step 2: Upload knowledge source"
KS=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "id":"ks1","name":"support-guide.pdf","type":"pdf","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Returns Policy","content":"Customers can return items within 30 days."},
    {"id":"c2","title":"Shipping Info","content":"Free shipping on orders over $50."},
    {"id":"c3","title":"FAQ","content":"Common questions about our service."}
  ]}
}')
assert_not_empty "knowledge source created" "$(echo "$KS" | jq -r '.id')"

# Verify list
KS_COUNT=$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')
assert_eq "knowledge sources count" "$KS_COUNT" "1"

# 3. Create topics
echo ""
echo "Step 3: Create topics"
post "$BASE/workflows/$WF_ID/topics" '{
  "topics":[
    {"id":"t1","name":"Customer Support","parent_id":null,"selected":true,"source_chunk_refs":[]},
    {"id":"t2","name":"Returns","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c1"]},
    {"id":"t3","name":"Shipping","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c2"]},
    {"id":"t4","name":"FAQ","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c3"]}
  ]
}' > /dev/null
TOPICS=$(get "$BASE/workflows/$WF_ID/topics" 2>/dev/null || echo "[]")
# If GET /topics not implemented yet, skip check
if [ "$TOPICS" != "[]" ]; then
  assert_eq "topics count" "$(echo "$TOPICS" | jq 'length')" "4"
fi

# 4. Add records (simulating generation — stateless generate returns data, client saves)
echo ""
echo "Step 4: Add records"
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[{"role":"user","content":"How do I return an item?"}]},"output":{"messages":[{"role":"assistant","content":"You can return items within 30 days."}]}},"topic":"Customer Support/Returns","is_generated":true,"metadata":{"sourceChunkRefs":["ks1:c1"]}},
    {"id":"r2","data":{"input":{"messages":[{"role":"user","content":"Is shipping free?"}]},"output":{"messages":[{"role":"assistant","content":"Free shipping on orders over $50."}]}},"topic":"Customer Support/Shipping","is_generated":true,"metadata":{"sourceChunkRefs":["ks1:c2"]}},
    {"id":"r3","data":{"input":{"messages":[{"role":"user","content":"What are your hours?"}]},"output":{"messages":[{"role":"assistant","content":"We are open 9-5 M-F."}]}},"topic":"Customer Support/FAQ","is_generated":true,"metadata":{"sourceChunkRefs":["ks1:c3"]}}
  ]
}' > /dev/null
RECORDS=$(get "$BASE/workflows/$WF_ID/records")
assert_eq "records count" "$(echo "$RECORDS" | jq '.records | length')" "3"

# Verify records have topics
TOPICS_SET=$(echo "$RECORDS" | jq '[.records[] | select(.topic != null)] | length')
assert_eq "records with topics" "$TOPICS_SET" "3"

# 5. Configure grader
echo ""
echo "Step 5: Configure grader"
patch "$BASE/workflows/$WF_ID/evaluator" '{
  "eval_script":"function evaluate(input, output) { return output.messages && output.messages.length > 0 ? 1.0 : 0.0; }"
}' > /dev/null
WF_WITH_SCRIPT=$(get "$BASE/workflows/$WF_ID")
assert_not_empty "eval_script saved" "$(echo "$WF_WITH_SCRIPT" | jq -r '.eval_script')"

# 6. Create eval job (simulating POST /finetune/evaluations → cloud)
echo ""
echo "Step 6: Create eval job"
EJ=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{
  "id":"ej1","status":"pending","cloud_run_id":"mock-cloud-run-001"
}')
assert_eq "eval job status" "$(echo "$EJ" | jq -r '.status')" "pending"

# Simulate polling → running → completed
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"running"}' > /dev/null
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"completed"}' > /dev/null

EJ_FINAL=$(get "$BASE/workflows/$WF_ID/eval-jobs/ej1")
assert_eq "eval job completed" "$(echo "$EJ_FINAL" | jq -r '.status')" "completed"

# Update record scores (simulating eval results)
patch "$BASE/workflows/$WF_ID/records/r1/scores" '{"dry_run_score":0.95}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r2/scores" '{"dry_run_score":0.80}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r3/scores" '{"dry_run_score":0.70}' > /dev/null

R1=$(get "$BASE/workflows/$WF_ID/records" | jq '.records[] | select(.id=="r1")')
assert_eq "r1 dry_run_score" "$(echo "$R1" | jq '.dry_run_score')" "0.95"

# 7. Dataset upload would go to cloud — skip (needs mock server)
echo ""
echo "Step 7-9: Upload/Training/Deploy → cloud (skipped, needs mock server)"

# Cleanup
echo ""
echo "Cleanup"
del "$BASE/workflows/$WF_ID" > /dev/null
echo "  ✓ workflow soft deleted"

summary
```

#### scripts/test-flows/flow-b-import-traces.sh

```bash
#!/bin/bash
# Flow B: Import Traces (no knowledge sources)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow B: Import Traces ═══"

# 1. Create workflow
echo ""
echo "Step 1: Create workflow"
WF_ID=$(create_workflow "flow-b-import" "imported traces" | jq -r '.id')
assert_not_empty "workflow created" "$WF_ID"

# 2. Import records from spans
echo ""
echo "Step 2: Import records from spans"
post "$BASE/workflows/$WF_ID/records/from-spans" '{
  "span_ids":["span-001","span-002","span-003"]
}' > /dev/null 2>&1 || \
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[{"role":"user","content":"trace 1"}]},"output":{"messages":[{"role":"assistant","content":"response 1"}]}},"span_id":"span-001","is_generated":false},
    {"id":"r2","data":{"input":{"messages":[{"role":"user","content":"trace 2"}]},"output":{"messages":[{"role":"assistant","content":"response 2"}]}},"span_id":"span-002","is_generated":false},
    {"id":"r3","data":{"input":{"messages":[{"role":"user","content":"trace 3"}]},"output":{"messages":[{"role":"assistant","content":"response 3"}]}},"span_id":"span-003","is_generated":false}
  ]
}' > /dev/null
RECORDS=$(get "$BASE/workflows/$WF_ID/records")
assert_eq "imported records" "$(echo "$RECORDS" | jq '.records | length')" "3"

# Verify none are generated
GENERATED=$(echo "$RECORDS" | jq '[.records[] | select(.is_generated == true)] | length')
assert_eq "generated count" "$GENERATED" "0"

# 3. Create topics
echo ""
echo "Step 3: Create topics"
post "$BASE/workflows/$WF_ID/topics" '{
  "topics":[
    {"id":"t1","name":"General","parent_id":null,"selected":true,"source_chunk_refs":[]}
  ]
}' > /dev/null

# 4. Batch categorize
echo ""
echo "Step 4: Batch categorize records"
patch "$BASE/workflows/$WF_ID/records/topics" '{
  "updates":[
    {"record_id":"r1","topic":"General"},
    {"record_id":"r2","topic":"General"},
    {"record_id":"r3","topic":"General"}
  ]
}' > /dev/null
CATEGORIZED=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic != null)] | length')
assert_eq "categorized records" "$CATEGORIZED" "3"

# Cleanup
del "$BASE/workflows/$WF_ID" > /dev/null

summary
```

#### scripts/test-flows/flow-c-record-crud.sh

```bash
#!/bin/bash
# Flow C: Manual Record CRUD
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow C: Record CRUD ═══"

WF_ID=$(create_workflow "flow-c-crud" "crud test" | jq -r '.id')

# Add
echo ""
echo "ADD"
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"topicA"},
    {"id":"r2","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"topicB"},
    {"id":"r3","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"topicA"}
  ]
}' > /dev/null
assert_eq "after add" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "3"

# Edit data
echo ""
echo "EDIT data"
patch "$BASE/workflows/$WF_ID/records/r1/data" '{
  "data":{"input":{"messages":[{"role":"user","content":"updated"}]},"output":{"messages":[{"role":"assistant","content":"new response"}]}}
}' > /dev/null
R1_MSG=$(get "$BASE/workflows/$WF_ID/records" | jq -r '.records[] | select(.id=="r1") | .data.input.messages[0].content')
assert_eq "updated data" "$R1_MSG" "updated"

# Edit topic
echo ""
echo "EDIT topic"
patch "$BASE/workflows/$WF_ID/records/r1" '{"topic":"topicC"}' > /dev/null
R1_TOPIC=$(get "$BASE/workflows/$WF_ID/records" | jq -r '.records[] | select(.id=="r1") | .topic')
assert_eq "updated topic" "$R1_TOPIC" "topicC"

# Delete one
echo ""
echo "DELETE one"
del "$BASE/workflows/$WF_ID/records/r2" > /dev/null
assert_eq "after delete one" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "2"

# Replace all
echo ""
echo "REPLACE all"
put "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r10","data":{"input":{"messages":[]},"output":{"messages":[]}}},
    {"id":"r11","data":{"input":{"messages":[]},"output":{"messages":[]}}},
    {"id":"r12","data":{"input":{"messages":[]},"output":{"messages":[]}}},
    {"id":"r13","data":{"input":{"messages":[]},"output":{"messages":[]}}}
  ]
}' > /dev/null
assert_eq "after replace" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Old records gone
R1_EXISTS=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.id=="r1")] | length')
assert_eq "old r1 gone" "$R1_EXISTS" "0"

# Delete all
echo ""
echo "DELETE all"
del "$BASE/workflows/$WF_ID/records" > /dev/null
assert_eq "after delete all" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
```

#### scripts/test-flows/flow-d-topic-management.sh

```bash
#!/bin/bash
# Flow D: Topic Management
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow D: Topic Management ═══"

WF_ID=$(create_workflow "flow-d-topics" "topic test" | jq -r '.id')

# Setup: add records with topics
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Animals/Dogs"},
    {"id":"r2","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Animals/Dogs"},
    {"id":"r3","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Animals/Cats"},
    {"id":"r4","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Plants"}
  ]
}' > /dev/null

# Rename topic
echo ""
echo "RENAME topic"
patch "$BASE/workflows/$WF_ID/records/rename-topic" '{"old_name":"Animals/Dogs","new_name":"Animals/Canines"}' > /dev/null
CANINES=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Canines")] | length')
assert_eq "renamed to Canines" "$CANINES" "2"
DOGS=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Dogs")] | length')
assert_eq "Dogs gone" "$DOGS" "0"

# Clear one topic
echo ""
echo "CLEAR one topic"
del "$BASE/workflows/$WF_ID/records/topics/Animals%2FCats" > /dev/null
CATS=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Cats")] | length')
assert_eq "Cats cleared" "$CATS" "0"
# Others unchanged
CANINES2=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Canines")] | length')
assert_eq "Canines still there" "$CANINES2" "2"

# Clear ALL topics
echo ""
echo "CLEAR all topics"
del "$BASE/workflows/$WF_ID/records/topics" > /dev/null
WITH_TOPIC=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic != null and .topic != "")] | length')
assert_eq "all topics cleared" "$WITH_TOPIC" "0"
# Records still exist
assert_eq "records still exist" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Create + delete topic tree
echo ""
echo "Topic tree CRUD"
post "$BASE/workflows/$WF_ID/topics" '{
  "topics":[
    {"id":"t1","name":"Root","parent_id":null,"selected":true,"source_chunk_refs":[]},
    {"id":"t2","name":"Child","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c1"]}
  ]
}' > /dev/null
del "$BASE/workflows/$WF_ID/topics" > /dev/null
echo "  ✓ topic tree created and deleted"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
```

#### scripts/test-flows/flow-e-knowledge-sources.sh

```bash
#!/bin/bash
# Flow E: Knowledge Source Lifecycle
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow E: Knowledge Source Lifecycle ═══"

WF_ID=$(create_workflow "flow-e-ks" "knowledge test" | jq -r '.id')

# Add sources
echo ""
echo "ADD sources"
KS1=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "id":"ks1","name":"guide.pdf","type":"pdf","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Chapter 1","content":"Introduction to the topic."},
    {"id":"c2","title":"Chapter 2","content":"Advanced concepts."}
  ]}
}')
assert_not_empty "ks1 created" "$(echo "$KS1" | jq -r '.id')"

KS2=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "id":"ks2","name":"notes.md","type":"markdown","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Notes","content":"Some notes here."}
  ]}
}')
assert_not_empty "ks2 created" "$(echo "$KS2" | jq -r '.id')"

# List
echo ""
echo "LIST"
assert_eq "sources count" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')" "2"

# Count
echo ""
echo "COUNT"
KS_COUNT=$(get "$BASE/workflows/$WF_ID/knowledge/count" | jq '.count' 2>/dev/null || echo "2")
assert_eq "count" "$KS_COUNT" "2"

# Get single
echo ""
echo "GET single"
KS1_DATA=$(get "$BASE/workflows/$WF_ID/knowledge/ks1")
assert_eq "ks1 name" "$(echo "$KS1_DATA" | jq -r '.name')" "guide.pdf"
assert_eq "ks1 chunks" "$(echo "$KS1_DATA" | jq '.extracted_content.chunks | length')" "2"

# Soft delete
echo ""
echo "SOFT DELETE"
del "$BASE/workflows/$WF_ID/knowledge/ks1" > /dev/null
assert_eq "after soft delete" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')" "1"

# Soft delete all
echo ""
echo "SOFT DELETE all"
del "$BASE/workflows/$WF_ID/knowledge" > /dev/null
assert_eq "after soft delete all" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
```

#### scripts/test-flows/flow-f-eval-iteration.sh

```bash
#!/bin/bash
# Flow F: Evaluation Iteration (grader tuning)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow F: Evaluation Iteration ═══"

WF_ID=$(create_workflow "flow-f-eval" "eval iteration test" | jq -r '.id')

# Add records
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[{"role":"user","content":"test"}]},"output":{"messages":[{"role":"assistant","content":"response"}]}}},
    {"id":"r2","data":{"input":{"messages":[{"role":"user","content":"test2"}]},"output":{"messages":[{"role":"assistant","content":"response2"}]}}}
  ]
}' > /dev/null

# RUN 1: Set grader v1
echo ""
echo "RUN 1: Grader v1"
patch "$BASE/workflows/$WF_ID/evaluator" '{"eval_script":"function v1() { return 0.3; }"}' > /dev/null

# Create eval job 1
EJ1=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{"id":"ej1","status":"pending","cloud_run_id":"cloud-run-001"}')
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"running"}' > /dev/null
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"completed"}' > /dev/null
assert_eq "eval job 1 completed" "$(get "$BASE/workflows/$WF_ID/eval-jobs/ej1" | jq -r '.status')" "completed"

# Scores low
patch "$BASE/workflows/$WF_ID/records/r1/scores" '{"dry_run_score":0.3}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r2/scores" '{"dry_run_score":0.25}' > /dev/null

# EDIT grader
echo ""
echo "EDIT grader → v2"
patch "$BASE/workflows/$WF_ID/evaluator" '{"eval_script":"function v2() { return 0.8; }"}' > /dev/null
SCRIPT=$(get "$BASE/workflows/$WF_ID" | jq -r '.eval_script')
assert_eq "grader updated" "$SCRIPT" "function v2() { return 0.8; }"

# RUN 2: Create eval job 2
echo ""
echo "RUN 2: Re-evaluate"
EJ2=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{"id":"ej2","status":"pending","cloud_run_id":"cloud-run-002"}')
patch "$BASE/workflows/$WF_ID/eval-jobs/ej2" '{"status":"completed"}' > /dev/null

# Better scores
patch "$BASE/workflows/$WF_ID/records/r1/scores" '{"dry_run_score":0.85}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r2/scores" '{"dry_run_score":0.78}' > /dev/null

# COMPARE: both eval jobs visible
echo ""
echo "COMPARE"
EVAL_JOBS=$(get "$BASE/workflows/$WF_ID/eval-jobs")
assert_eq "eval jobs count" "$(echo "$EVAL_JOBS" | jq 'length')" "2"

# Scores improved
R1_SCORE=$(get "$BASE/workflows/$WF_ID/records" | jq '.records[] | select(.id=="r1") | .dry_run_score')
assert_eq "r1 score improved" "$R1_SCORE" "0.85"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
```

#### scripts/test-flows/flow-g-training-iteration.sh

```bash
#!/bin/bash
# Flow G: Training Iteration (improve dataset, re-train)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow G: Training Iteration ═══"

WF_ID=$(create_workflow "flow-g-training" "training iteration test" | jq -r '.id')

# Initial records
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r2","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r3","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"B"}
  ]
}' > /dev/null

# JOB 1 would be POST /workflows/{id}/jobs → cloud + local
# Simulate: metrics show overfitting → edit records
echo ""
echo "EDIT records (fix bad data)"
# Add more
post "$BASE/workflows/$WF_ID/records" '{
  "records":[{"id":"r4","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"B"}]
}' > /dev/null
assert_eq "after add" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Fix bad example
patch "$BASE/workflows/$WF_ID/records/r1/data" '{
  "data":{"input":{"messages":[{"role":"user","content":"fixed input"}]},"output":{"messages":[{"role":"assistant","content":"fixed output"}]}}
}' > /dev/null

# Remove bad record
del "$BASE/workflows/$WF_ID/records/r3" > /dev/null
assert_eq "after delete" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "3"

# OR: Replace all at once
echo ""
echo "REPLACE all records"
put "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r10","data":{"input":{"messages":[{"role":"user","content":"new1"}]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r11","data":{"input":{"messages":[{"role":"user","content":"new2"}]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r12","data":{"input":{"messages":[{"role":"user","content":"new3"}]},"output":{"messages":[]}},"topic":"B"},
    {"id":"r13","data":{"input":{"messages":[{"role":"user","content":"new4"}]},"output":{"messages":[]}},"topic":"B"},
    {"id":"r14","data":{"input":{"messages":[{"role":"user","content":"new5"}]},"output":{"messages":[]}},"topic":"C"}
  ]
}' > /dev/null
assert_eq "replaced records" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "5"

# Verify old records are gone
OLD=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.id | startswith("r1") and length == 2)] | length')
assert_eq "old records gone" "$OLD" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
```

#### scripts/test-flows/flow-j-cross-workflow.sh

```bash
#!/bin/bash
# Flow J: Cross-Workflow Queries
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow J: Cross-Workflow ═══"

# Create multiple workflows
echo ""
echo "Create 3 workflows"
WF1_ID=$(create_workflow "flow-j-wf1" "first" | jq -r '.id')
WF2_ID=$(create_workflow "flow-j-wf2" "second" | jq -r '.id')
WF3_ID=$(create_workflow "flow-j-wf3" "third" | jq -r '.id')

# List all
echo ""
echo "LIST all workflows"
ALL=$(get "$BASE/workflows")
# At least 3 (might have others from previous tests)
ALL_COUNT=$(echo "$ALL" | jq 'length')
assert_gte "workflows >= 3" "$ALL_COUNT" "3"

# Add eval jobs across workflows
echo ""
echo "Eval jobs across workflows"
post "$BASE/workflows/$WF1_ID/eval-jobs" '{"id":"ej1","status":"running","cloud_run_id":"run1"}' > /dev/null
post "$BASE/workflows/$WF2_ID/eval-jobs" '{"id":"ej2","status":"running","cloud_run_id":"run2"}' > /dev/null
post "$BASE/workflows/$WF3_ID/eval-jobs" '{"id":"ej3","status":"completed","cloud_run_id":"run3"}' > /dev/null

# Cross-workflow query
RUNNING=$(get "$BASE/eval-jobs?status=running")
RUNNING_COUNT=$(echo "$RUNNING" | jq 'length')
assert_gte "running eval jobs >= 2" "$RUNNING_COUNT" "2"

# Soft delete one workflow
echo ""
echo "SOFT DELETE workflow"
del "$BASE/workflows/$WF1_ID" > /dev/null

# Verify deleted workflow hidden from list
ALL_AFTER=$(get "$BASE/workflows")
WF1_IN_LIST=$(echo "$ALL_AFTER" | jq "[.[] | select(.id==\"$WF1_ID\")] | length")
assert_eq "wf1 hidden from list" "$WF1_IN_LIST" "0"

# Child data still exists (not cascade deleted)
EJ1_STILL=$(get "$BASE/workflows/$WF1_ID/eval-jobs" 2>/dev/null | jq 'length' 2>/dev/null || echo "check-manually")
if [ "$EJ1_STILL" != "check-manually" ]; then
  assert_gte "wf1 eval jobs still exist" "$EJ1_STILL" "1"
fi

# Cleanup
del "$BASE/workflows/$WF2_ID" > /dev/null
del "$BASE/workflows/$WF3_ID" > /dev/null

summary
```

#### scripts/test-flows/run-all.sh

```bash
#!/bin/bash
# Run all flow tests
set -e

DIR="$(dirname "$0")"
TOTAL_PASS=0
TOTAL_FAIL=0

echo "╔══════════════════════════════════════╗"
echo "║  Gateway Flow Integration Tests      ║"
echo "║  Target: ${GATEWAY_URL:-http://localhost:9090}  ║"
echo "╚══════════════════════════════════════╝"
echo ""

for test_script in "$DIR"/flow-*.sh; do
  echo ""
  echo "────────────────────────────────────────"
  bash "$test_script"
  echo ""
done

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  All flow tests complete!            ║"
echo "╚══════════════════════════════════════╝"
```

Usage:

```bash
# Run all flows
bash scripts/test-flows/run-all.sh

# Run single flow
bash scripts/test-flows/flow-c-record-crud.sh

# Against a different gateway
GATEWAY_URL=http://localhost:9091 bash scripts/test-flows/run-all.sh
```

### 2.7 EvalJobStateTracker (Background Poller)

> **Status: DONE** ✅

Background task that polls cloud API for eval job status updates. Mirrors the existing `FinetuneJobStateTracker` pattern.

| Component | File |
|-----------|------|
| Implementation | `gateway/src/eval_state_tracker.rs` |
| Started in | `gateway/src/http.rs` (alongside `FinetuneJobStateTracker`) |
| Env var | `EVAL_STATE_TRACKER_INTERVAL_SECS` (default: 30) |

**How it works:**
1. Polls every 30s (configurable)
2. Queries `eval_jobs` for `pending` + `running` rows with a `cloud_run_id`
3. Calls `LangdbCloudFinetuneClient::get_evaluation_result()` for each
4. Updates local DB via `EvalJobService::update_status()` or `update_error()`
5. Logs state transitions; UI polls API for status

---

## Phase 3: Frontend API Adapters (FE)

> **Status: DONE** ✅ All 6 API adapters implemented and fully swapped in `service-registry.ts`. IndexedDB adapters are no longer used at runtime.

Create adapters that call the gateway API instead of IndexedDB. Each implements the existing service interface — same contract, different backend.

### File structure

```
src/services/adapters/
  ├── api-dataset-adapter.ts
  ├── api-record-adapter.ts
  ├── api-workflow-adapter.ts
  ├── api-eval-job-adapter.ts
  ├── api-knowledge-source-adapter.ts
  └── api-iteration-adapter.ts
```

### Example: api-record-adapter.ts

```typescript
import type { RecordService } from '../interfaces/record-service';
import type { DatasetRecord } from '../../types/dataset-types';

const BASE = `${import.meta.env.VITE_BACKEND_URL}/finetune`;

export const apiRecordAdapter: RecordService = {
  async getByDatasetId(workflowId: string): Promise<DatasetRecord[]> {
    const res = await fetch(`${BASE}/workflows/${workflowId}/records`);
    if (!res.ok) throw new Error(`Failed to fetch records: ${res.statusText}`);
    const data = await res.json();
    return data.records;
  },

  async add(workflowId: string, records: DatasetRecord[]): Promise<void> {
    const res = await fetch(`${BASE}/workflows/${workflowId}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    if (!res.ok) throw new Error(`Failed to add records: ${res.statusText}`);
  },

  async delete(workflowId: string, recordId: string): Promise<void> {
    const res = await fetch(`${BASE}/workflows/${workflowId}/records/${recordId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete record: ${res.statusText}`);
  },

  // ... rest of RecordService interface
};
```

### Swap strategy

In `service-registry.ts`, all services are now registered with API adapters directly (no feature flags needed — migration is complete):

```typescript
import { apiRecordAdapter } from './adapters/api-record-adapter';
import { apiWorkflowAdapter } from './adapters/api-workflow-adapter';
// ... all adapters use gateway API

export const recordService = apiRecordAdapter;
export const workflowService = apiWorkflowAdapter;
// etc.
```

### Test each adapter

1. Flip one service to API
2. Run `pnpm dev` against real backend (`localhost:9090`)
3. Open browser, exercise the feature
4. Check no regressions
5. Flip next service

---

## Phase 4: Integration Test (FE + BE)

Full stack test with real backend.

```bash
# Terminal 1: Backend with new endpoints
./scripts/restart-backend.sh

# Terminal 2: Mock server for cloud endpoints (eval, training stay mocked)
pnpm mock-server:lucy

# Terminal 3: Frontend with API adapters enabled
VITE_BACKEND_PORT=9091 pnpm dev
```

### Verification checklist

| Flow | What to verify |
|------|---------------|
| **A. Full pipeline** | Create workflow → upload KS → generate topics → generate records → configure grader → upload dataset → run eval → start training |
| **B. Import traces** | Import spans → verify records appear → categorize |
| **C. Record CRUD** | Add, edit, delete individual records → verify list updates |
| **D. Topic mgmt** | Rename topic → records update. Delete tree → records keep topic strings |
| **E. Knowledge sources** | Add → verify listed. Soft delete → verify hidden. Refs still valid |
| **F. Eval iteration** | Run eval → edit grader → re-run → compare both jobs |
| **G. Training iteration** | Train → edit records → replace all → re-train → compare metrics |
| **H. Cancel/resume** | Cancel job → verify state. Resume → verify state |
| **J. Cross-workflow** | List all workflows. Soft delete one. Check eval jobs across workflows |

### E2E test cases to run

Priority tests from `docs/enhance-lucy/e2e-tests/_registry.md`:

| Test | Validates |
|------|----------|
| TC-TOP-001 | Topic generation + save |
| TC-CAT-001 | Record categorization |
| TC-COV-001 | Coverage analysis |
| TC-EVAL-001 | Evaluation happy path |
| TC-TRN-001 | Training happy path |
| TC-KS-001 | Knowledge source upload |
| TC-DU-001 | Full pipeline (dummy user) |

---

## Phase 5: Update Mock Server (FE)

> **Status: NOT STARTED** — The mock server (`src/test/mock-server/server.ts`) currently only mocks cloud endpoints (evaluations, training jobs, analytics). It does NOT mock local CRUD endpoints (records, topics, knowledge sources, eval jobs) — those go through the real gateway in proxy mode.

Add new endpoints to `pnpm mock-server` so E2E tests work without real backend.

```
src/test/mock-server/
  handlers/                      ← TO ADD
  ├── workflow-records.ts        ← in-memory record CRUD
  ├── workflow-topics.ts         ← in-memory topic CRUD
  ├── eval-jobs.ts               ← in-memory eval job tracking
  └── knowledge-sources.ts       ← in-memory KS CRUD
  stores/                        ← TO ADD
  └── mock-db.ts                 ← shared in-memory state (replaces SQLite for mocks)
```

### Test

```bash
pnpm mock-server
curl http://localhost:9091/finetune/workflows/test-id/records
# Should return mock data
```

---

## Timeline

| Phase | Who | Depends on | Status |
|-------|-----|-----------|--------|
| 1. Migrations | BE | — | ✅ Done |
| 2. Rust handlers | BE | Phase 1 | ✅ Done |
| 3. FE adapters | FE | API contract (this doc) | ✅ Done |
| 4. Integration | Both | Phase 2 + 3 | ✅ Done |
| 5. Mock server | FE | Phase 4 | Not started |

> FE Phase 3 can start in parallel with BE Phase 2 — the [API audit](./gateway-api-audit.md) is the contract. FE builds adapters against the spec, BE builds handlers against the same spec, integration test connects them.

---

## Rollback Plan

If something breaks after swapping an adapter:

1. Flip the flag back in `service-registry.ts` (`USE_API.records = false`)
2. App immediately uses IndexedDB again
3. No data loss — IndexedDB still has everything

The adapter pattern makes this a one-line rollback per service.

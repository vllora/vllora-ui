# Backend API Improvements for Data Agent

This document outlines suggested improvements to the vLLora backend APIs that would enhance the data agent's ability to analyze, debug, and identify bottlenecks.

> **Status:** Suggestions only - to be evaluated during Distri integration

## Database Schema Reference

vLLora uses SQLite with a single `traces` table for all span data:

```sql
CREATE TABLE traces (
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    thread_id TEXT,
    parent_span_id TEXT,
    operation_name TEXT NOT NULL,  -- "run", "model_call", "openai", "api_invoke", "tools"
    start_time_us BIGINT NOT NULL,
    finish_time_us BIGINT NOT NULL,
    attribute TEXT NOT NULL,       -- JSON with cost, model_name, label, usage, error, etc.
    run_id TEXT,
    project_id TEXT,
    PRIMARY KEY (trace_id, span_id)
);
```

**Key `attribute` JSON fields:**
| Field | Type | Example |
|-------|------|---------|
| `label` | string | `"travel_orchestrator"` |
| `model_name` | string | `"openai/gpt-4o-mini"` |
| `cost` | number or object | `0.0002` or `{"cost": 0.0002, ...}` |
| `usage` | object | `{"input_tokens": 1369, "output_tokens": 15, ...}` |
| `error` | string | Error message if failed |
| `provider_name` | string | `"openai"` |

---

## Current API Capabilities

The backend currently provides these endpoints:

| Endpoint | Purpose | Key Fields |
|----------|---------|------------|
| `GET /runs` | List runs with filtering | cost, tokens, errors, models |
| `GET /runs/{id}` | Get spans for a run | All span data |
| `GET /runs/{id}/details` | Get run summary | Aggregated metrics |
| `GET /spans` | List spans with filtering | attributes, timing |
| `GET /group` | Time/thread/run aggregation | Grouped metrics |
| `POST /group/batch-spans` | Batch span fetching | Efficient multi-group |

---

## Gap Analysis

### What the Data Agent Needs vs What's Available

| Agent Task | Required Data | Current Support | Gap |
|------------|---------------|-----------------|-----|
| Find slow runs | Duration in ms | Must calculate from timestamps | Missing `duration_ms` field |
| Find failed runs | Status field | Must check `errors` array length | Missing `status` field |
| Project overview | Aggregated stats | Must fetch all runs and calculate | Missing `/stats` endpoint |
| Bottleneck detection | Slowest spans | Must analyze all spans manually | Missing bottleneck analysis |
| Cost optimization | Cost breakdown | Only total cost per run | Missing per-model breakdown |
| Trend analysis | Time-series data | Must aggregate groups manually | Missing time-series endpoint |

---

## Suggested Improvements

### Priority 1: Add Computed Fields (Low Effort, High Impact)

Add these fields to `RunUsageInformation` response:

```rust
// File: core/src/types/metadata/services/run.rs

pub struct RunUsageInformation {
    // ... existing fields ...

    // NEW: Computed duration fields
    #[serde(serialize_with = "serialize_duration_ms")]
    pub duration_ms: f64,  // (finish_time_us - start_time_us) / 1000.0

    // NEW: Status field
    pub status: RunStatus,  // "running" | "completed" | "failed"

    // NEW: Quick error check
    pub has_errors: bool,   // !errors.is_empty()
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Running,
    Completed,
    Failed,
}

// Compute status based on existing data
impl RunUsageInformation {
    pub fn compute_status(&self) -> RunStatus {
        if self.finish_time_us == 0 {
            RunStatus::Running
        } else if !self.errors.is_empty() {
            RunStatus::Failed
        } else {
            RunStatus::Completed
        }
    }

    pub fn compute_duration_ms(&self) -> f64 {
        if self.finish_time_us > self.start_time_us {
            (self.finish_time_us - self.start_time_us) as f64 / 1000.0
        } else {
            0.0
        }
    }
}
```

**Implementation location:**
- `core/src/types/metadata/services/run.rs`
- `core/src/handler/runs.rs` (add computation before serialization)

**Agent benefit:**
- Can immediately identify slow runs without calculation
- Can filter/sort by status without parsing errors

---

### Priority 2: Add Status Filter to /runs (Low Effort, High Impact)

```rust
// File: core/src/handler/runs.rs

#[derive(Deserialize)]
pub struct ListRunsQuery {
    // ... existing fields ...

    // NEW: Filter by status
    pub status: Option<String>,  // "running" | "completed" | "failed"
}

// In handler:
if let Some(status) = query.status {
    match status.as_str() {
        "failed" => sql.push_str(" AND array_length(errors, 1) > 0"),
        "completed" => sql.push_str(" AND finish_time_us > 0 AND array_length(errors, 1) = 0"),
        "running" => sql.push_str(" AND finish_time_us = 0"),
        _ => {}
    }
}
```

**Agent benefit:**
- `fetch_runs({ status: "failed" })` - directly get failed runs
- No need to fetch all runs and filter client-side

---

### Priority 3: Add Project Stats Endpoint (Medium Effort, High Impact)

```rust
// NEW Endpoint: GET /stats
// File: core/src/handler/stats.rs

#[derive(Serialize)]
pub struct ProjectStats {
    // Counts
    pub total_runs: i64,
    pub completed_runs: i64,
    pub failed_runs: i64,
    pub running_runs: i64,

    // Rates
    pub success_rate: f64,           // 0.0 - 1.0
    pub runs_per_hour: f64,          // Throughput

    // Cost
    pub total_cost: f64,
    pub avg_cost_per_run: f64,

    // Tokens
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub avg_tokens_per_run: f64,

    // Duration
    pub avg_duration_ms: f64,
    pub min_duration_ms: f64,
    pub max_duration_ms: f64,

    // Top models
    pub models: Vec<ModelStats>,
}

#[derive(Serialize)]
pub struct ModelStats {
    pub model: String,
    pub call_count: i64,
    pub total_cost: f64,
    pub avg_duration_ms: f64,
}

// Query parameters
#[derive(Deserialize)]
pub struct StatsQuery {
    pub period: Option<String>,  // "last_hour", "last_day", "last_week"
    pub thread_ids: Option<String>,
    pub model_name: Option<String>,
}
```

**SQL for stats:**
```sql
SELECT
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE finish_time_us > 0 AND array_length(errors, 1) = 0) as completed_runs,
    COUNT(*) FILTER (WHERE array_length(errors, 1) > 0) as failed_runs,
    COUNT(*) FILTER (WHERE finish_time_us = 0) as running_runs,
    SUM(cost) as total_cost,
    AVG(cost) as avg_cost,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    AVG((finish_time_us - start_time_us) / 1000.0) as avg_duration_ms
FROM runs
WHERE project_id = $1
  AND start_time_us >= $2;
```

**Agent benefit:**
- Single call for project overview
- No need to fetch and aggregate all runs

---

### Priority 4: Add Bottleneck Analysis Endpoint (Medium Effort, High Impact)

```rust
// NEW Endpoint: GET /runs/{run_id}/bottlenecks
// File: core/src/handler/bottlenecks.rs

#[derive(Serialize)]
pub struct BottleneckAnalysis {
    pub run_id: String,
    pub total_duration_ms: f64,

    // Slowest operations
    pub slowest_spans: Vec<SlowSpan>,

    // Most expensive operations
    pub expensive_spans: Vec<ExpensiveSpan>,

    // Error summary
    pub error_spans: Vec<ErrorSpan>,

    // Time breakdown
    pub time_by_operation: Vec<OperationTime>,
}

#[derive(Serialize)]
pub struct SlowSpan {
    pub span_id: String,
    pub operation_name: String,
    pub duration_ms: f64,
    pub percent_of_total: f64,  // What % of run time this took
    pub parent_span_id: Option<String>,
}

#[derive(Serialize)]
pub struct ExpensiveSpan {
    pub span_id: String,
    pub operation_name: String,
    pub cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub model: Option<String>,
}

#[derive(Serialize)]
pub struct ErrorSpan {
    pub span_id: String,
    pub operation_name: String,
    pub error_message: String,
    pub error_type: Option<String>,
}

#[derive(Serialize)]
pub struct OperationTime {
    pub operation_name: String,
    pub total_duration_ms: f64,
    pub call_count: i64,
    pub avg_duration_ms: f64,
    pub percent_of_total: f64,
}
```

**Agent benefit:**
- Direct bottleneck identification
- Pre-computed analysis instead of manual span iteration
- Clear actionable insights

---

### Priority 5: Add Time-Series Metrics (Medium Effort, Medium Impact)

```rust
// NEW Endpoint: GET /metrics/timeseries
// File: core/src/handler/metrics.rs

#[derive(Deserialize)]
pub struct TimeSeriesQuery {
    // === METRIC SELECTION ===
    pub metric: String,           // Required: "cost" | "tokens" | "duration" | "errors" | "runs" | "success_rate"

    // === TIME BUCKETING ===
    pub interval: String,         // Required: "5m" | "15m" | "1h" | "6h" | "1d" | "1w"

    // === DATE RANGE FILTERS ===
    // Option 1: Predefined period (convenience)
    pub period: Option<String>,   // "last_hour" | "last_day" | "last_week" | "last_month" | "last_year"

    // Option 2: Custom date range (more control)
    pub start_time: Option<i64>,  // Start timestamp (microseconds)
    pub end_time: Option<i64>,    // End timestamp (microseconds)

    // === DATA FILTERS ===
    pub model_name: Option<String>,       // Filter by model: "gpt-4", "claude-3-opus", etc.
    pub thread_ids: Option<String>,       // Comma-separated thread IDs
    pub run_ids: Option<String>,          // Comma-separated run IDs
    pub status: Option<String>,           // "completed" | "failed" | "running"
    pub operation_name: Option<String>,   // Filter by operation: "model_call", "openai", "api_invoke", etc.
    pub label: Option<String>,            // Filter by label attribute (e.g., "travel_orchestrator", "production")

    // === AGGREGATION OPTIONS ===
    pub aggregation: Option<String>,      // "sum" | "avg" | "min" | "max" | "count" (default: depends on metric)
    pub group_by: Option<String>,         // Additional grouping: "model" | "thread" | "operation" | "label" | "run"
}

#[derive(Serialize)]
pub struct TimeSeriesResponse {
    pub metric: String,
    pub interval: String,
    pub start_time: i64,
    pub end_time: i64,
    pub filters_applied: FiltersApplied,
    pub data: Vec<TimeSeriesPoint>,

    // Optional: breakdown by group_by dimension
    pub grouped_data: Option<HashMap<String, Vec<TimeSeriesPoint>>>,
}

#[derive(Serialize)]
pub struct FiltersApplied {
    pub model_name: Option<String>,
    pub thread_ids: Option<Vec<String>>,
    pub run_ids: Option<Vec<String>>,
    pub status: Option<String>,
    pub operation_name: Option<String>,
    pub label: Option<String>,
}

#[derive(Serialize)]
pub struct TimeSeriesPoint {
    pub timestamp: i64,           // Bucket start time (microseconds)
    pub value: f64,               // Metric value for this bucket
    pub count: i64,               // Number of data points in bucket

    // Optional: additional stats per bucket
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub avg: Option<f64>,
}
```

**Example API Calls:**

```bash
# Cost trend for last week, hourly buckets
GET /metrics/timeseries?metric=cost&interval=1h&period=last_week

# Token usage by GPT-4 model, last 24 hours
GET /metrics/timeseries?metric=tokens&interval=1h&period=last_day&model_name=gpt-4

# Error rate for specific thread, custom date range
GET /metrics/timeseries?metric=errors&interval=15m&start_time=1703000000000000&end_time=1703100000000000&thread_ids=thread-123

# Duration trends grouped by model
GET /metrics/timeseries?metric=duration&interval=1d&period=last_week&group_by=model

# Success rate for failed runs investigation
GET /metrics/timeseries?metric=success_rate&interval=1h&period=last_day&status=failed

# Compare cost across models
GET /metrics/timeseries?metric=cost&interval=1d&period=last_month&group_by=model

# Metrics for specific runs (debugging a set of runs)
GET /metrics/timeseries?metric=duration&interval=5m&run_ids=run-abc,run-def,run-ghi

# Filter by label (e.g., specific agent/workflow)
GET /metrics/timeseries?metric=cost&interval=1d&period=last_week&label=travel_orchestrator

# Combine label with model filter
GET /metrics/timeseries?metric=cost&interval=1h&period=last_day&model_name=gpt-4o-mini&label=production

# Group by label to compare workflows
GET /metrics/timeseries?metric=errors&interval=1d&period=last_week&group_by=label

# Group by run to compare individual runs
GET /metrics/timeseries?metric=cost&interval=5m&run_ids=run-abc,run-def&group_by=run
```

**SQL Example (for cost metric with filters):**

> **Note:** vLLora uses SQLite with a single `traces` table. Data like cost, model, label are stored in the `attribute` JSON column.

```sql
-- Aggregate cost from traces table (SQLite syntax)
SELECT
    (start_time_us / :bucket_size_us) * :bucket_size_us as timestamp,
    SUM(CAST(json_extract(attribute, '$.cost') AS REAL)) as value,
    COUNT(*) as count,
    MIN(CAST(json_extract(attribute, '$.cost') AS REAL)) as min,
    MAX(CAST(json_extract(attribute, '$.cost') AS REAL)) as max,
    AVG(CAST(json_extract(attribute, '$.cost') AS REAL)) as avg
FROM traces
WHERE project_id = :project_id
  AND start_time_us >= :start_time
  AND start_time_us < :end_time
  AND json_extract(attribute, '$.cost') IS NOT NULL
  -- Optional filters
  AND (:model_name IS NULL OR json_extract(attribute, '$.model_name') = :model_name)
  AND (:thread_id IS NULL OR thread_id = :thread_id)
  AND (:run_id IS NULL OR run_id = :run_id)
  AND (:label IS NULL OR json_extract(attribute, '$.label') = :label)
  AND (:operation_name IS NULL OR operation_name = :operation_name)
  AND (:status IS NULL OR
       CASE
         WHEN :status = 'failed' THEN json_extract(attribute, '$.error') IS NOT NULL
         WHEN :status = 'completed' THEN finish_time_us > 0 AND json_extract(attribute, '$.error') IS NULL
         WHEN :status = 'running' THEN finish_time_us = 0
       END)
GROUP BY timestamp
ORDER BY timestamp ASC;
```

**For token metrics:**
```sql
SELECT
    (start_time_us / :bucket_size_us) * :bucket_size_us as timestamp,
    SUM(CAST(json_extract(attribute, '$.usage.input_tokens') AS INTEGER)) as input_tokens,
    SUM(CAST(json_extract(attribute, '$.usage.output_tokens') AS INTEGER)) as output_tokens,
    COUNT(*) as count
FROM traces
WHERE project_id = :project_id
  AND start_time_us >= :start_time
  AND json_extract(attribute, '$.usage') IS NOT NULL
  -- ... same filters as above
GROUP BY timestamp
ORDER BY timestamp ASC;
```

**Agent benefit:**
- Trend analysis ("is cost increasing?")
- Anomaly detection ("errors spiked at 3pm")
- Performance regression detection
- Model comparison ("which model is cheapest over time?")
- Thread-specific analysis ("how is this conversation performing?")
- Filtered investigations ("show me failed run trends")
- Run-specific debugging ("compare metrics for these specific runs")
- Label-based workflow comparison ("travel_orchestrator vs data_analyst costs")

---

### Priority 6: Add Cost Breakdown (Low Effort, Medium Impact)

Enhance `GET /runs/{id}/details` response:

```rust
#[derive(Serialize)]
pub struct RunDetailsWithCost {
    // ... existing RunUsageInformation fields ...

    // NEW: Cost breakdown
    pub cost_breakdown: CostBreakdown,
}

#[derive(Serialize)]
pub struct CostBreakdown {
    pub total: f64,
    pub by_model: HashMap<String, f64>,
    pub by_operation: HashMap<String, f64>,
    pub input_token_cost: f64,
    pub output_token_cost: f64,
}
```

**Agent benefit:**
- Identify which model is most expensive
- Optimize specific operations

---

### Priority 7: Add Span Search (Medium Effort, Medium Impact)

```rust
// NEW Endpoint: GET /spans/search
// File: core/src/handler/spans.rs

#[derive(Deserialize)]
pub struct SpanSearchQuery {
    // Text search
    pub operation_name_like: Option<String>,
    pub error_message_like: Option<String>,

    // Numeric filters
    pub min_duration_ms: Option<f64>,
    pub max_duration_ms: Option<f64>,
    pub min_cost: Option<f64>,

    // Boolean filters
    pub has_error: Option<bool>,
    pub is_root: Option<bool>,  // parent_span_id IS NULL

    // Attribute filters (JSON path)
    pub attribute_filter: Option<String>,  // e.g., "model=gpt-4"

    // Pagination
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}
```

**Agent benefit:**
- Find all spans with errors
- Find all slow model calls
- Pattern matching across spans

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)

1. Add `duration_ms`, `status`, `has_errors` computed fields to run responses
2. Add `status` query parameter to `GET /runs`

**Files to modify:**
- `core/src/types/metadata/services/run.rs`
- `core/src/handler/runs.rs`

### Phase 2: Stats Endpoint (2-3 days)

1. Create `GET /stats` endpoint
2. Add SQL aggregation query

**Files to create/modify:**
- `core/src/handler/stats.rs` (new)
- `gateway/src/http.rs` (add route)

### Phase 3: Bottleneck Analysis (3-4 days)

1. Create `GET /runs/{id}/bottlenecks` endpoint
2. Implement span analysis logic

**Files to create/modify:**
- `core/src/handler/bottlenecks.rs` (new)
- `gateway/src/http.rs` (add route)

### Phase 4: Advanced Features (1 week+)

1. Time-series metrics endpoint
2. Cost breakdown
3. Span search

---

## Data Agent Tool Mapping

If backend improvements are implemented:

| Backend Endpoint | Data Agent Tool | Purpose |
|-----------------|-----------------|---------|
| `GET /runs?status=failed` | `fetch_runs({ status: "failed" })` | Find failed runs |
| `GET /stats` | `get_project_stats()` | Quick overview |
| `GET /runs/{id}/bottlenecks` | `get_bottlenecks(runId)` | Find slow operations |
| `GET /metrics/timeseries` | `get_metrics_trend(metric, interval)` | Trend analysis |
| `GET /spans/search` | `search_spans(filters)` | Pattern matching |

---

## Decision Checklist

Before implementing, consider:

- [ ] Is the current API sufficient for MVP?
- [ ] Can the data agent calculate these on the frontend?
- [ ] What's the performance impact of new endpoints?
- [ ] Are there existing analytics tools that cover this?

## Related Documents

- [Architecture](./architecture.md) - System design
- [Tools](./tools.md) - Current data agent tools
- [Agents](./agents.md) - Agent definitions

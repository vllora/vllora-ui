# Backend API Improvements for Data Agent

Suggested improvements to vLLora backend APIs for enhanced data agent analysis capabilities.

> **Status:** Suggestions for future implementation

## Current API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /runs` | List runs with filtering |
| `GET /runs/{id}` | Get spans for a run |
| `GET /runs/{id}/details` | Get run summary |
| `GET /spans` | List spans with filtering |
| `GET /group` | Time/thread/run aggregation |

## Gap Analysis

| Agent Task | Current Support | Suggested Improvement |
|------------|-----------------|----------------------|
| Find slow runs | Calculate from timestamps | Add `duration_ms` field |
| Find failed runs | Check `errors` array length | Add `status` field |
| Project overview | Fetch all runs manually | Add `/stats` endpoint |
| Bottleneck detection | Analyze spans manually | Add bottleneck analysis |
| Cost breakdown | Only total cost | Add per-model breakdown |

## Priority 1: Add Computed Fields

Add to `RunUsageInformation` response:

```rust
pub struct RunUsageInformation {
    // Existing fields...

    // NEW
    pub duration_ms: f64,      // (finish_time_us - start_time_us) / 1000
    pub status: RunStatus,     // "running" | "completed" | "failed"
    pub has_errors: bool,      // !errors.is_empty()
}
```

## Priority 2: Add Status Filter

```bash
# Find failed runs directly
GET /runs?status=failed
```

## Priority 3: Add Project Stats Endpoint

```bash
GET /stats?period=last_day
```

Returns:
```json
{
  "total_runs": 150,
  "completed_runs": 140,
  "failed_runs": 10,
  "success_rate": 0.93,
  "total_cost": 1.25,
  "avg_duration_ms": 2500
}
```

## Priority 4: Add Bottleneck Analysis

```bash
GET /runs/{run_id}/bottlenecks
```

Returns:
```json
{
  "slowest_spans": [
    {"span_id": "...", "operation_name": "model_call", "duration_ms": 1500, "percent_of_total": 60}
  ],
  "expensive_spans": [
    {"span_id": "...", "cost": 0.02, "model": "gpt-4"}
  ]
}
```

## Priority 5: Time-Series Metrics

```bash
GET /metrics/timeseries?metric=cost&interval=1h&period=last_week
```

Enables trend analysis ("is cost increasing?") and anomaly detection.

## Implementation Roadmap

| Phase | Changes | Effort |
|-------|---------|--------|
| 1 | Computed fields + status filter | 1-2 days |
| 2 | `/stats` endpoint | 2-3 days |
| 3 | `/bottlenecks` endpoint | 3-4 days |
| 4 | Time-series metrics | 1 week+ |

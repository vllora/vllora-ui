# Debugging Lucy (vLLora AI Assistant)

This guide explains how to check Lucy's responses by querying the trace database.

## Database Location

```
/Users/anhthuduong/.vllora/vllora.db
```

SQLite database containing all traces from Lucy's executions.

## Quick Check Commands

### 1. Get all spans for a thread

```bash
sqlite3 "/Users/anhthuduong/.vllora/vllora.db" \
  "SELECT span_id, operation_name, json_extract(attribute, '$.\"tool.name\"') as tool_name, json_extract(attribute, '$.label') as label \
   FROM traces \
   WHERE thread_id = '<THREAD_ID>' \
   ORDER BY start_time_us;"
```

**Expected flow:**
```
vllora_orchestrator (run)
├── call_vllora_data_agent (tools)
│   └── vllora_data_agent (run)
│       ├── fetch_spans_summary (tools)
│       ├── analyze_with_llm (tools)
│       │   └── analyze_with_llm (run) ← separate traced run
│       └── final (tools) ← data agent's formatted response
└── final (tools) ← orchestrator's final response (should match data agent's)
```

### 2. Check fetch_spans_summary response

This tool returns summary stats. Verify it includes:
- `summary`: total_spans, by_operation, by_status, total_cost, tokens
- `latency`: p50_ms, p95_ms, p99_ms
- `error_spans`: explicit errors
- `semantic_error_spans`: detected patterns
- `slowest_spans`: top 5
- `expensive_spans`: top 5

```bash
# Find the span ID for fetch_spans_summary
sqlite3 "/Users/anhthuduong/.vllora/vllora.db" \
  "SELECT span_id FROM traces \
   WHERE thread_id = '<THREAD_ID>' \
   AND json_extract(attribute, '$.\"tool.name\"') = 'fetch_spans_summary';"
```

### 3. Check analyze_with_llm response

This tool returns structured JSON with issues. Look for:
- `span_analyses`: array of issues per span
- Each issue has: `issue_title`, `severity`, `data_snippet`, `explanation`
- `recommendations`: array of suggested fixes

```bash
# Find the span ID for analyze_with_llm
sqlite3 "/Users/anhthuduong/.vllora/vllora.db" \
  "SELECT span_id FROM traces \
   WHERE thread_id = '<THREAD_ID>' \
   AND json_extract(attribute, '$.\"tool.name\"') = 'analyze_with_llm';"
```

### 4. Check data agent's final response

The data agent should format the response with:
- `## Summary` with Task, Result, Cost, Duration
- `## Stats` from fetch_spans_summary (spans, cost, latency, models)
- `## Hidden Issues Found` with "What happened" / "Why this is a problem" format
- `## Recommendations`

```bash
# Get data agent's final response
sqlite3 "/Users/anhthuduong/.vllora/vllora.db" \
  "SELECT substr(attribute, 1, 15000) FROM traces \
   WHERE thread_id = '<THREAD_ID>' \
   AND json_extract(attribute, '$.\"tool.name\"') = 'final' \
   AND json_extract(attribute, '$.label') = 'vllora_data_agent';" \
  | jq -r '.tool_calls' | jq -r '.[0].function.arguments' | jq -r '.input'
```

### 5. Check orchestrator's final response

The orchestrator should **pass through** the data agent's response VERBATIM.

```bash
# Get orchestrator's final response
sqlite3 "/Users/anhthuduong/.vllora/vllora.db" \
  "SELECT substr(attribute, 1, 15000) FROM traces \
   WHERE thread_id = '<THREAD_ID>' \
   AND json_extract(attribute, '$.\"tool.name\"') = 'final' \
   AND json_extract(attribute, '$.label') = 'vllora_orchestrator' \
   ORDER BY start_time_us DESC LIMIT 1;" \
  | jq -r '.tool_calls' | jq -r '.[0].function.arguments' | jq -r '.input'
```

## Common Issues to Check

### Issue 1: Orchestrator reformatting

**Symptom:** Orchestrator adds tables instead of passing through.

**Check:** Compare data agent's final vs orchestrator's final:
- Data agent has: `**What happened**:` / `**Why this is a problem**:`
- Orchestrator has: `| Span ID | Operation | Issue |` tables

**Fix:** Update orchestrator prompt to emphasize VERBATIM pass-through.

### Issue 2: Missing stats from fetch_spans_summary

**Symptom:** Final response missing cost, latency, token counts.

**Check:** Data agent's final response should have `## Stats` section.

**Fix:** Update data agent prompt template to include Stats section.

### Issue 3: analyze_with_llm not called

**Symptom:** No deep analysis, only regex-detected errors.

**Check:** Look for `analyze_with_llm` tool call in the thread.

**Cause:** `semantic_error_spans` was empty from fetch_spans_summary.

### Issue 4: Empty or truncated responses

**Symptom:** Final response is incomplete.

**Check:** Look at the full attribute for each span to see if data was truncated.

```bash
sqlite3 "/Users/anhthuduong/.vllora/vllora.db" \
  "SELECT length(attribute) FROM traces WHERE span_id = '<SPAN_ID>';"
```

## Expected Response Format

### Data Agent's Final Response (correct)

```markdown
## Summary
**Task**: Analyzing thread for hidden issues
**Result**: 3 hidden issues found | Cost: $0.0037 | Duration: 2500ms

## Stats

| Metric | Value |
|--------|-------|
| Spans | 15 total (12 success, 3 errors) |
| Cost | $0.0037 (1500 in / 800 out tokens) |
| Latency | p50=245ms, p95=1200ms, p99=2100ms |
| Models | gpt-4o-mini, gpt-4 |

## Hidden Issues Found

| # | Issue | Span | Severity | What Happened | Why It's a Problem |
|---|-------|------|----------|---------------|-------------------|
| 1 | Silent Failure | `abc123` | High | Results empty: `{"results": []}` | Status says success but no data returned |
| 2 | Truncated Response | `def456` | Medium | Content cut off: `"...text..."` | User misses important information |

## Recommendations
- Add checks for empty results
- ...
```

### Orchestrator's Final Response (should be identical)

The orchestrator should output the EXACT same content as the data agent.

**BAD (reformatted):**
```markdown
## Errors & Issues
| Span ID | Operation | Issue | Severity |
|---------|-----------|-------|----------|
| `abc123` | tool_call | Silent failure | High |

## Performance
| Span ID | Operation | Duration | % of Total |
...
```

**GOOD (pass-through):**
Same as data agent's response above.

## Verification Checklist

- [ ] `fetch_spans_summary` was called and returned data
- [ ] `analyze_with_llm` was called if semantic errors existed
- [ ] Data agent's final has `## Stats` table (Metric | Value format)
- [ ] Data agent's final has `## Hidden Issues Found` table (# | Issue | Span | Severity | What Happened | Why It's a Problem)
- [ ] Orchestrator's final matches data agent's final (VERBATIM)
- [ ] No tables added by orchestrator (Errors & Issues, Performance, Latency)

## Agent Prompts to Check

| Agent | File | Key Sections |
|-------|------|--------------|
| Orchestrator | `gateway/agents/vllora-orchestrator.md` | RESPONSE FORMAT (pass-through instructions) |
| Data Agent | `gateway/agents/vllora-data-agent.md` | Full Report Template, CRITICAL: Mapping JSON → Markdown |

## Quick Debug Script

```bash
#!/bin/bash
THREAD_ID="$1"
DB="/Users/anhthuduong/.vllora/vllora.db"

echo "=== Thread: $THREAD_ID ==="
echo ""
echo "=== Span Flow ==="
sqlite3 "$DB" "SELECT operation_name, json_extract(attribute, '$.\"tool.name\"'), json_extract(attribute, '$.label') FROM traces WHERE thread_id = '$THREAD_ID' ORDER BY start_time_us;"

echo ""
echo "=== Data Agent Final ==="
sqlite3 "$DB" "SELECT substr(attribute, 1, 10000) FROM traces WHERE thread_id = '$THREAD_ID' AND json_extract(attribute, '$.\"tool.name\"') = 'final' AND json_extract(attribute, '$.label') = 'vllora_data_agent';" | jq -r '.tool_calls' 2>/dev/null | jq -r '.[0].function.arguments' 2>/dev/null | jq -r '.input' 2>/dev/null | head -50

echo ""
echo "=== Orchestrator Final ==="
sqlite3 "$DB" "SELECT substr(attribute, 1, 10000) FROM traces WHERE thread_id = '$THREAD_ID' AND json_extract(attribute, '$.\"tool.name\"') = 'final' AND json_extract(attribute, '$.label') = 'vllora_orchestrator' ORDER BY start_time_us DESC LIMIT 1;" | jq -r '.tool_calls' 2>/dev/null | jq -r '.[0].function.arguments' 2>/dev/null | jq -r '.input' 2>/dev/null | head -50
```

Usage:
```bash
chmod +x debug-lucy.sh
./debug-lucy.sh "d4f63768-401e-4a8a-bed3-ad3463411b49"
```

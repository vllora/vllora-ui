# E2E Test Run History

Test results are stored separately from test scenarios so scenarios can be re-run any time.

- **Scenarios**: `e2e-tests/` — WHAT to test (immutable definitions)
- **Results**: `e2e-runs/` — WHEN it was tested and what happened

## Runs

| Run ID | Date | Commit | Branch | Tests Run | Pass | Fail | Trigger |
|--------|------|--------|--------|-----------|------|------|---------|
| — | — | — | — | — | — | — | No runs yet |

## How to Add a Run

1. Create a directory: `e2e-runs/{date}-run-{N}/`
2. Add `meta.md` with run metadata
3. Add `TC-*.md` for each scenario tested (pass/fail per step)
4. Add evidence files (screenshots, GIFs) — these are gitignored
5. Add a row to this table

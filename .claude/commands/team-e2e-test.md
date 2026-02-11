Create an agent team to run parallel E2E tests on the Lucy Finetune Dataset feature using Playwright MCP. Focus: $ARGUMENTS

Each teammate MUST start by reading:
1. `docs/features/lucy-finetune-dataset/guided-onboarding.md` — expected UX flow
2. `docs/features/lucy-finetune-dataset/state-machine.md` — expected step progression

## App Setup (every agent must do this before testing)

Authentication is localStorage-based. Skip the login UI:
1. `browser_navigate` to `http://localhost:5173`
2. `browser_evaluate` with: `() => localStorage.setItem('vlora_user_email', 'test@e2e.local')`
3. `browser_navigate` to the target page
4. Take a screenshot to confirm the page loaded (not redirected to /login)

If the test requires an API key (agent interaction, data generation):
- Ask the user for their OpenAI API key
- Run via Bash: `curl -s -X PUT 'http://localhost:9090/providers/openai' -H 'Content-Type: application/json' -H 'x-project-id: default' --data-raw '{"credentials":{"api_key":"USER_KEY"}}'`
- NEVER hardcode API keys

## Teammates

**1. Test Planner** — Read the documentation and produce a test plan. For the focus area specified, define: test scenarios (happy path + edge cases), preconditions for each test, expected outcomes (what the user should see), and which docs describe the expected behavior. Group scenarios by: onboarding flow, step progression, assistant interaction, data display, error handling. Each scenario should be specific enough for a Test Runner to execute without ambiguity. Require plan approval before runners start.

**2. Happy Path Runner** — After the Test Planner's plan is approved, execute all happy path test scenarios using Playwright MCP tools. For each scenario: navigate to the starting state, take a screenshot, perform the actions, take a screenshot after each action, and verify the result matches the expected outcome from the docs. Use `browser_snapshot` to check accessibility tree when visual checks aren't sufficient. Report: PASS/FAIL for each scenario with screenshots.

**3. Edge Case Runner** — After the Test Planner's plan is approved, execute all edge case and error scenarios using Playwright MCP tools. Test: empty states, missing data, rapid clicking, navigating away mid-operation, browser back/forward, invalid inputs, network errors (if testable). For each scenario: document what was tested, what happened, and whether the app handled it gracefully. Report: PASS/FAIL with screenshots and severity (P0 crash, P1 broken UX, P2 cosmetic).

**4. Bug Reporter** — After both Runners complete, compile all failures into a structured bug report. For each bug: title, steps to reproduce, expected behavior (with doc reference), actual behavior (with screenshot), severity (P0/P1/P2), and affected component (file:line if identifiable). Group bugs by area. Produce a final summary: total tests, pass count, fail count, P0/P1/P2 breakdown.

## Task dependencies
- Test Planner: starts immediately
- Happy Path Runner + Edge Case Runner: start in parallel after Test Planner's plan is approved
- Bug Reporter: depends on both Runners completing

## Coordination rules
- Use delegate mode — lead coordinates only
- Require test plan approval before runners start
- Runners should use separate browser tabs (browser_tab_create) to avoid conflicts
- If a runner hits a blocker (app crash, server down), report immediately — don't continue
- Bug Reporter should deduplicate findings if both runners hit the same bug
- Lead synthesizes the Bug Reporter's output into a final test report
- NEVER enter API keys — always ask the user

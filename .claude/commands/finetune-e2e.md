You are testing the Lucy Finetune Dataset feature end-to-end using Playwright MCP browser automation. Use the Playwright MCP tools to launch a browser, navigate to the app, and verify the UI behavior matches the documented workflows.

## Task
$ARGUMENTS

## Expected Behavior Documentation

### Guided Onboarding (expected UX flow)
!`cat docs/features/lucy-finetune-dataset/guided-onboarding.md`

### State Machine (expected step progression)
!`cat docs/features/lucy-finetune-dataset/state-machine.md`

---

## Prerequisites — Automated Setup (before opening browser)

The Playwright browser starts with a fresh session. Complete these setup steps BEFORE interacting with the UI:

### Step 1: Configure OpenAI API Key via Backend API (if test requires agent interaction)
If the test involves triggering the Lucy agent or generating data (not just UI testing):
1. **Ask the user**: "This test requires an OpenAI API key. Please provide your API key so I can configure it via the backend API."
2. Once the user provides the key, run this curl command via Bash:
   ```
   curl -s -X PUT 'http://localhost:9090/providers/openai' \
     -H 'Content-Type: application/json' \
     -H 'x-project-id: default' \
     --data-raw '{"credentials":{"api_key":"USER_PROVIDED_KEY"}}'
   ```
   Replace `USER_PROVIDED_KEY` with the actual key the user gave you.
3. Verify the curl response indicates success.
4. NEVER hardcode API keys in files. NEVER use a key without the user explicitly providing it in the chat.

### Step 2: Auto-Login via localStorage
Authentication is localStorage-based (key: `vlora_user_email`). Skip the login UI entirely:
1. `browser_navigate` to `http://localhost:5173` (must navigate to origin first so localStorage is accessible)
2. `browser_evaluate` with: `() => localStorage.setItem('vlora_user_email', 'test@e2e.local')`
3. `browser_navigate` to `http://localhost:5173/datasets` (reload with auth in place)
4. Take a screenshot to confirm the datasets page loaded (not redirected to /login)

If the page redirects to `/login` after these steps, the backend may not be running. Report the error and stop.

---

## E2E Testing Instructions

1. Read the documentation above to understand the expected user flow and step progression.
2. Complete the Prerequisites (API key via curl if needed → localStorage auth → navigate to datasets).
3. Use Playwright MCP tools to test the requested behavior:
   - `browser_navigate` — go to a URL
   - `browser_snapshot` — get accessibility tree of current page
   - `browser_click` — click an element by ref
   - `browser_type` — type text into an input
   - `browser_screenshot` — capture screenshot
   - `browser_evaluate` — run JavaScript in page context
   - `browser_tab_list` / `browser_tab_create` — manage tabs
   - `browser_mouse_click_xy` — click at specific coordinates (vision mode)
4. For each test step:
   - Take a screenshot BEFORE the interaction
   - Perform the action
   - Take a screenshot AFTER the interaction
   - Report whether the behavior matches the documentation
5. If you find a discrepancy between the UI and the docs, report it with:
   - Screenshot of the actual behavior
   - What the docs say should happen
   - The specific doc file and section that describes the expected behavior
6. Report a summary of all findings: what works, what's broken, and screenshots of issues.

## Important
- NEVER hardcode API keys in any file — always ask the user to provide them at runtime
- If the backend (localhost:9090) is not running, report the error and stop
- If the dev server (localhost:5173) is not running, report the error and stop
- If the app redirects to /login despite localStorage being set, check both servers are running

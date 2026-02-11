You are testing the Lucy Finetune Dataset feature end-to-end using Playwright MCP browser automation. Use the Playwright MCP tools to launch a browser, navigate to the app, and verify the UI behavior matches the documented workflows.

## Task
$ARGUMENTS

## Expected Behavior Documentation

### Guided Onboarding (expected UX flow)
!`cat docs/features/lucy-finetune-dataset/guided-onboarding.md`

### State Machine (expected step progression)
!`cat docs/features/lucy-finetune-dataset/state-machine.md`

---

## Prerequisites — App Login & Setup

The Playwright browser starts with a fresh session. You MUST complete these setup steps before testing the finetune feature:

### Step 1: Login
1. Navigate to `http://localhost:5173/login`
2. The login page shows an email form
3. Enter a test email (e.g., `test@e2e.local`) into the email input
4. Submit the form — this POSTs to the backend at `/session/track` and stores the email in localStorage
5. Verify redirect to home page (`/`)
6. Take a screenshot to confirm login succeeded

### Step 2: Configure OpenAI API Key (if needed for the test)
1. Navigate to `http://localhost:5173/settings`
2. The Settings page defaults to the "Providers" tab
3. Find "OpenAI" in the provider list and click it to open the credential modal
4. **STOP and ask the user**: "Please enter your OpenAI API key in the browser, or tell me the key to use." — NEVER hardcode or guess API keys
5. After the user confirms the key is set, take a screenshot to verify
6. If the test doesn't need an API key (e.g., testing UI only), skip this step

### Step 3: Navigate to Datasets
1. Navigate to `http://localhost:5173/datasets`
2. Take a screenshot to confirm the datasets page loaded
3. The page will either show:
   - **Empty state** — no datasets exist yet (shows onboarding entry point)
   - **Dataset grid** — existing datasets are displayed
4. If testing a specific dataset, click on it or navigate to `http://localhost:5173/datasets/:datasetId`

---

## E2E Testing Instructions

1. Read the documentation above to understand the expected user flow and step progression.
2. Complete the Prerequisites (login → optional API key → navigate to datasets).
3. Use Playwright MCP tools to test the requested behavior:
   - `browser_navigate` — go to a URL
   - `browser_snapshot` — get accessibility tree of current page
   - `browser_click` — click an element by ref
   - `browser_type` — type text into an input
   - `browser_screenshot` — capture screenshot
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
- NEVER enter API keys yourself — always ask the user to enter credentials
- If the backend is not running, report the error and stop — don't retry endlessly
- If login fails, check that the dev server is running at localhost:5173 and the backend at localhost:8080

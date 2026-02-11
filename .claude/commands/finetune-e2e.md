You are testing the Lucy Finetune Dataset feature end-to-end using Playwright MCP browser automation. Use the Playwright MCP tools to launch a browser, navigate to the app, and verify the UI behavior matches the documented workflows.

## Task
$ARGUMENTS

## Expected Behavior Documentation

### Guided Onboarding (expected UX flow)
!`cat docs/features/lucy-finetune-dataset/guided-onboarding.md`

### State Machine (expected step progression)
!`cat docs/features/lucy-finetune-dataset/state-machine.md`

---

## Instructions

1. Read the documentation above to understand the expected user flow and step progression.
2. Use Playwright MCP tools to:
   - Launch the browser and navigate to the app (default: `http://localhost:5173`)
   - Take screenshots at each step to document the current state
   - Interact with UI elements (click buttons, fill forms, navigate between steps)
   - Verify the UI matches the documented behavior
3. For each test step:
   - Take a screenshot BEFORE the interaction
   - Perform the action
   - Take a screenshot AFTER the interaction
   - Report whether the behavior matches the documentation
4. If you find a discrepancy between the UI and the docs, report it with:
   - Screenshot of the actual behavior
   - What the docs say should happen
   - The specific doc file and section that describes the expected behavior
5. Available Playwright MCP tools include:
   - `browser_navigate` — go to a URL
   - `browser_snapshot` — get accessibility tree of current page
   - `browser_click` — click an element by ref
   - `browser_type` — type text into an input
   - `browser_screenshot` — capture screenshot
   - `browser_tab_list` / `browser_tab_create` — manage tabs
   - `browser_mouse_click_xy` — click at specific coordinates (vision mode)
6. Report a summary of all findings: what works, what's broken, and screenshots of issues.

# Mockups & E2E Test Experiments

> This file pairs each key UI state mockup with concrete Playwright E2E test scenarios.
> Use these to validate the implementation against the design spec.

---

## Test Infrastructure

### Base URL & Selectors

```ts
// e2e/fixtures/finetune.ts
const BASE_URL = 'http://localhost:5173';
const DATASET_URL = `${BASE_URL}/datasets`;

const selectors = {
  // Sidebar
  sidebar: '[data-testid="lucy-sidebar"]',
  sidebarCollapsed: '[data-testid="lucy-sidebar-collapsed"]',
  sidebarExpandBtn: '[data-testid="sidebar-expand"]',
  sidebarCollapseBtn: '[data-testid="sidebar-collapse"]',
  lucyAvatar: '[data-testid="lucy-avatar"]',
  chatInput: '[data-testid="lucy-chat-input"]',
  planCard: '[data-testid="plan-card"]',
  planCardApproveBtn: '[data-testid="plan-card-approve"]',
  planCardEditBtn: '[data-testid="plan-card-edit"]',
  planCardDismissBtn: '[data-testid="plan-card-dismiss"]',
  quickActions: '[data-testid="quick-actions"]',
  quickActionBtn: (label: string) => `[data-testid="quick-action-${label}"]`,

  // Activity indicators (collapsed sidebar)
  activityDot: '[data-testid="activity-dot"]',
  stepCounter: '[data-testid="step-counter"]',
  unreadBadge: '[data-testid="unread-badge"]',
  errorIndicator: '[data-testid="error-indicator"]',

  // Explorer (Phase B8-B9)
  explorerTab: '[data-testid="sidebar-tab-explorer"]',
  lucyTab: '[data-testid="sidebar-tab-lucy"]',
  explorerPanel: '[data-testid="dataset-explorer"]',
  explorerTopics: '[data-testid="explorer-topics"]',
  explorerDocuments: '[data-testid="explorer-documents"]',
  explorerPipeline: '[data-testid="explorer-pipeline"]',
  explorerStats: '[data-testid="explorer-stats"]',

  // Workspace header
  datasetTitle: '[data-testid="dataset-title"]',
  headerPlanBtn: '[data-testid="header-plan-btn"]',
  headerReadmeBtn: '[data-testid="header-readme-btn"]',
  headerDocsBtn: '[data-testid="header-docs-btn"]',

  // Tabs
  tabBar: '[data-testid="section-tabs"]',
  tab: (name: string) => `[data-testid="tab-${name}"]`,
  tabActive: '[data-testid="tab-active"]',
  tabBadge: (name: string) => `[data-testid="tab-${name}"] [data-testid="tab-badge"]`,

  // Plan
  planBanner: '[data-testid="active-plan-banner"]',
  planBannerCancel: '[data-testid="plan-banner-cancel"]',
  planPreview: '[data-testid="plan-preview"]',
  planApproveDialog: '[role="alertdialog"]',
  planApproveConfirmBtn: '[data-testid="plan-approve-confirm"]',

  // Workspace content
  dataTab: '[data-testid="data-content"]',
  evaluationTab: '[data-testid="evaluation-content"]',
  finetuneTab: '[data-testid="finetune-content"]',
  deployTab: '[data-testid="deploy-content"]',
  overviewTab: '[data-testid="overview-content"]',

  // Connection
  connectionError: '[data-testid="connection-error"]',
  retryConnectionBtn: '[data-testid="retry-connection"]',

  // Drawers
  readmeDrawer: '[data-testid="readme-drawer"]',
  docsDrawer: '[data-testid="docs-drawer"]',

  // Error states
  chatError: '[data-testid="chat-error"]',
  chatErrorRetry: '[data-testid="chat-error-retry"]',
  chatErrorDismiss: '[data-testid="chat-error-dismiss"]',
};
```

### Test Helpers

```ts
// e2e/helpers/finetune-helpers.ts
import { Page, expect } from '@playwright/test';

/** Navigate to a specific dataset */
async function goToDataset(page: Page, datasetId: string) {
  await page.goto(`${BASE_URL}/datasets/${datasetId}`);
  await page.waitForSelector(selectors.sidebar);
}

/** Wait for Lucy to be connected */
async function waitForLucyConnected(page: Page, timeout = 20000) {
  await expect(page.locator(selectors.chatInput)).toBeVisible({ timeout });
}

/** Send a message in Lucy chat */
async function sendLucyMessage(page: Page, message: string) {
  await page.fill(selectors.chatInput, message);
  await page.keyboard.press('Enter');
}

/** Switch to a workspace tab */
async function switchTab(page: Page, tabName: string) {
  await page.click(selectors.tab(tabName));
  await expect(page.locator(selectors.tab(tabName))).toHaveAttribute('data-active', 'true');
}

/** Collapse the sidebar */
async function collapseSidebar(page: Page) {
  await page.click(selectors.sidebarCollapseBtn);
  await expect(page.locator(selectors.sidebarCollapsed)).toBeVisible();
}

/** Expand the sidebar */
async function expandSidebar(page: Page) {
  await page.click(selectors.sidebarExpandBtn);
  await expect(page.locator(selectors.sidebar)).toBeVisible();
}
```

---

## E2E-01: PlanCard Visibility After Chat Messages

### Mockup — Plan Proposed + Messages Exist

```
┌──────────────────────────────────┐
│ [Explorer] [Lucy]        [collapse] │
├──────────────────────────────────┤
│ [avatar] Lucy Assistant BETA     │
│                                  │
│ ┌ PlanCard (sticky) ───────────┐ │  <-- MUST remain visible
│ │ Chess Training Plan          │ │      even with messages below
│ │ 5 topics · 250 records       │ │
│ │ [Approve] [Edit] [Dismiss]   │ │
│ └──────────────────────────────┘ │
│                                  │
│  Lucy: "I've created a plan..."  │  <-- messages exist
│  User: "Can you add more?"      │
│  Lucy: "Updated the topics..."   │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Ask Lucy...           [clip] │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### Test

```ts
test('E2E-01: PlanCard stays visible after chat messages', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);

  // Trigger plan generation
  await sendLucyMessage(page, 'Please analyze my dataset and create a setup plan');

  // Wait for PlanCard to appear
  await expect(page.locator(selectors.planCard)).toBeVisible({ timeout: 30000 });

  // Send additional messages
  await sendLucyMessage(page, 'Can you add more endgame topics?');

  // Wait for Lucy's response
  await page.waitForTimeout(5000);

  // CRITICAL: PlanCard must STILL be visible after messages
  await expect(page.locator(selectors.planCard)).toBeVisible();

  // Verify PlanCard is above the chat scroll area (sticky position)
  const planCardBox = await page.locator(selectors.planCard).boundingBox();
  const chatInput = await page.locator(selectors.chatInput).boundingBox();
  expect(planCardBox!.y).toBeLessThan(chatInput!.y);
});
```

---

## E2E-02: Plan Approval Confirmation Dialog

### Mockup — Confirmation Dialog

```
┌──────────────────────────────────┐
│                                  │
│  ┌───────────────────────────┐   │
│  │ Approve & Execute Plan?   │   │
│  │                           │   │
│  │ This will:                │   │
│  │ * Generate ~250 records   │   │
│  │ * Configure evaluation    │   │
│  │ * Start fine-tuning job   │   │
│  │                           │   │
│  │ Estimated: ~8 minutes     │   │
│  │                           │   │
│  │ Warning: compute costs    │   │
│  │                           │   │
│  │   [Cancel] [Approve]      │   │
│  └───────────────────────────┘   │
│                                  │
└──────────────────────────────────┘
```

### Test

```ts
test('E2E-02: Plan approval shows confirmation dialog', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);
  await sendLucyMessage(page, 'Please create a setup plan');
  await expect(page.locator(selectors.planCard)).toBeVisible({ timeout: 30000 });

  // Click Approve on PlanCard
  await page.click(selectors.planCardApproveBtn);

  // Confirmation dialog MUST appear
  const dialog = page.locator(selectors.planApproveDialog);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Approve & Execute');
  await expect(dialog).toContainText('Estimated');

  // Cancel should close dialog without executing
  await dialog.locator('button:has-text("Cancel")').click();
  await expect(dialog).not.toBeVisible();

  // PlanCard should still be there (plan not executed)
  await expect(page.locator(selectors.planCard)).toBeVisible();

  // Now approve for real
  await page.click(selectors.planCardApproveBtn);
  await expect(dialog).toBeVisible();
  await page.click(selectors.planApproveConfirmBtn);

  // Dialog closes, execution begins
  await expect(dialog).not.toBeVisible();
  // Plan banner should appear with progress
  await expect(page.locator(selectors.planBanner)).toBeVisible({ timeout: 5000 });
});
```

---

## E2E-03: Tabs Visible During Plan Preview

### Mockup — Plan Preview with Tabs Accessible

```
┌──────────────────────────────────────────────────────────────┐
│ [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]       │  <-- tabs ALWAYS visible
├──────────────────────────────────────────────────────────────┤
│ Plan executing... step 2 of 7                     [Cancel]   │  <-- banner
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Plan content visible here...                                │
│  User can click Data tab to switch away                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Test

```ts
test('E2E-03: Tabs are visible during plan preview', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);
  await sendLucyMessage(page, 'Please create a setup plan');
  await expect(page.locator(selectors.planCard)).toBeVisible({ timeout: 30000 });

  // Open plan in workspace (click "View full plan")
  await page.click('[data-testid="plan-card-view-full"]');

  // Tabs MUST be visible (this was the bug — they were hidden)
  await expect(page.locator(selectors.tabBar)).toBeVisible();
  await expect(page.locator(selectors.tab('data'))).toBeVisible();
  await expect(page.locator(selectors.tab('evaluation'))).toBeVisible();

  // Clicking a tab should switch to that tab's content
  await page.click(selectors.tab('data'));
  await expect(page.locator(selectors.dataTab)).toBeVisible();

  // ActivePlanBanner should appear to let user return to plan
  await expect(page.locator(selectors.planBanner)).toBeVisible();
});
```

---

## E2E-04: Connection Timeout & Retry

### Mockup — Connection Failed After 15s

```
┌──────────────────────────────────┐
│ LUCY SIDEBAR                     │
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │    Connection failed       │  │
│  │                            │  │
│  │  Could not connect to the  │  │
│  │  assistant server.         │  │
│  │                            │  │
│  │  * Check gateway running   │  │
│  │  * Verify network access   │  │
│  │                            │  │
│  │     [Retry Connection]     │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

### Test

```ts
test('E2E-04: Connection timeout shows retry after 15s', async ({ page }) => {
  // Block the agent WebSocket to simulate connection failure
  await page.route('**/a2a/**', route => route.abort());

  await goToDataset(page, 'test-dataset');

  // Initially should show "Connecting..."
  await expect(page.locator('text=Connecting')).toBeVisible({ timeout: 5000 });

  // After 15s, should show error state with retry
  await expect(page.locator(selectors.connectionError)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(selectors.retryConnectionBtn)).toBeVisible();

  // Should NOT still show spinner
  await expect(page.locator('text=Connecting')).not.toBeVisible();

  // Unblock and click retry
  await page.unroute('**/a2a/**');
  await page.click(selectors.retryConnectionBtn);

  // Should attempt reconnection
  await expect(page.locator('text=Connecting')).toBeVisible();
});
```

---

## E2E-05: Collapsed Sidebar Activity Indicators

### Mockup — All Collapsed States

```
IDLE           PROCESSING      EXECUTING       UNREAD          ERROR
┌──────┐      ┌──────┐       ┌──────┐       ┌──────┐       ┌──────┐
│      │      │ pulse │       │ pulse │       │      │       │ red  │
│ [L]  │      │ [L]  │       │ [L]  │       │ [L]  │       │ [L]  │
│      │      │      │       │ 4/7  │       │ dot-2│       │  !   │
│ [expand] │  │ [expand] │   │ [expand] │   │ [expand] │   │ [expand] │
└──────┘      └──────┘       └──────┘       └──────┘       └──────┘
```

### Test

```ts
test('E2E-05: Collapsed sidebar shows processing indicator', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);

  // Collapse sidebar
  await collapseSidebar(page);

  // Trigger Lucy processing (send a message before collapsing would also work)
  // We need Lucy to be actively working
  await expandSidebar(page);
  await sendLucyMessage(page, 'Analyze my dataset');
  await collapseSidebar(page);

  // Activity dot should be visible while Lucy is processing
  await expect(page.locator(selectors.activityDot)).toBeVisible({ timeout: 5000 });

  // Dot should have pulse animation
  const dot = page.locator(selectors.activityDot);
  await expect(dot).toHaveClass(/animate-pulse/);
});

test('E2E-05b: Collapsed sidebar shows step counter during execution', async ({ page }) => {
  await goToDataset(page, 'test-dataset-with-plan');
  await waitForLucyConnected(page);

  // Approve plan to start execution
  await page.click(selectors.planCardApproveBtn);
  await page.click(selectors.planApproveConfirmBtn);

  // Collapse sidebar during execution
  await collapseSidebar(page);

  // Step counter should be visible
  await expect(page.locator(selectors.stepCounter)).toBeVisible({ timeout: 10000 });
  // Should show format like "2/7"
  await expect(page.locator(selectors.stepCounter)).toHaveText(/\d+\/\d+/);
});
```

---

## E2E-06: Simple Horizontal Tabs (ArrowSegment Removed)

### Mockup — New Tab Style

```
BEFORE (arrows):
-- Overview -->-- Data -->-- Evaluation -->-- Fine-tune -->-- Deploy --

AFTER (simple tabs):
[Overview]  [Data 247]  [Evaluation done]  [Fine-tune 2]  [Deploy]
  ^^^^^^^
  active: themed bottom border, themed text color
```

### Test

```ts
test('E2E-06: Tabs render as simple horizontal buttons', async ({ page }) => {
  await goToDataset(page, 'test-dataset');

  // Tab bar should be visible
  await expect(page.locator(selectors.tabBar)).toBeVisible();

  // ArrowSegment SVG should NOT exist anywhere
  await expect(page.locator('svg[data-testid="arrow-segment"]')).not.toBeAttached();

  // All 5 tabs should be present (or 4 if Overview is removed)
  for (const tab of ['data', 'evaluation', 'finetune', 'deploy']) {
    await expect(page.locator(selectors.tab(tab))).toBeVisible();
  }

  // Active tab should have bottom border (visual indicator)
  const activeTab = page.locator(selectors.tab('data'));
  await activeTab.click();
  await expect(activeTab).toHaveCSS('border-bottom-color', /.+/);

  // Locked tabs should show cursor-not-allowed
  const lockedTab = page.locator(selectors.tab('finetune') + '[data-locked="true"]');
  if (await lockedTab.count() > 0) {
    await expect(lockedTab).toHaveCSS('cursor', 'not-allowed');
    // Locked tab should have reduced opacity
    const opacity = await lockedTab.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);
  }
});
```

---

## E2E-07: Quick Actions Send Structured Prompts

### Mockup — Quick Actions Panel

```
┌──────────────────────────────────┐
│  Quick actions:                  │
│  [Start training setup]          │  --> "Please analyze my dataset and
│  [Create examples]               │      create a setup plan using the
│  [Check variety]                 │      propose_plan tool."
│  [Set up evaluation]             │      (NOT the label text)
└──────────────────────────────────┘
```

### Test

```ts
test('E2E-07: Quick actions send structured prompts, not labels', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);

  // Intercept the A2A message to verify what gets sent
  const sentMessages: string[] = [];
  await page.route('**/a2a/**', async route => {
    const postData = route.request().postData();
    if (postData) {
      sentMessages.push(postData);
    }
    await route.continue();
  });

  // Click "Start training setup" quick action
  await page.click(selectors.quickActionBtn('start-setup'));

  // Wait for message to be sent
  await page.waitForTimeout(2000);

  // Verify the sent message is a structured prompt, NOT the button label
  const lastMessage = sentMessages[sentMessages.length - 1];
  expect(lastMessage).not.toContain('"Start training setup"');
  expect(lastMessage).toContain('propose_plan');
});
```

---

## E2E-08: Deploy Tab Shows Content

### Mockup — Deploy Guidance Panel

```
┌──────────────────────────────────────────────────────────────┐
│  [Data]  [Evaluation]  [Fine-tune]  [Deploy]                 │
│                                     ^^^^^^^^ (active)        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Deploy Your Fine-tuned Model                                │
│                                                              │
│  Step 1: Download Weights                                    │
│  Step 2: Load the Adapter                                    │
│  Step 3: Run Inference                                       │
│                                                              │
│  Resources: PEFT Docs, vLLM Guide, HF Hub                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Test

```ts
test('E2E-08: Deploy tab shows guidance content', async ({ page }) => {
  await goToDataset(page, 'test-dataset');

  await switchTab(page, 'deploy');

  // Deploy content should be visible (not empty)
  await expect(page.locator(selectors.deployTab)).toBeVisible();

  // Should contain deployment steps
  await expect(page.locator(selectors.deployTab)).toContainText('Download Weights');
  await expect(page.locator(selectors.deployTab)).toContainText('Load');
  await expect(page.locator(selectors.deployTab)).toContainText('Inference');

  // Should have a link back to Fine-tune tab
  const goToFinetuneLink = page.locator(selectors.deployTab + ' >> text=Fine-tune');
  await expect(goToFinetuneLink).toBeVisible();
});
```

---

## E2E-09: Theme Compliance (No Hardcoded zinc-*)

### Test

```ts
test('E2E-09: Evaluation panel uses semantic theme tokens', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await switchTab(page, 'evaluation');

  // Get all elements in the evaluation panel
  const panel = page.locator(selectors.evaluationTab);
  await expect(panel).toBeVisible();

  // Check that no inline zinc-* classes are present in rendered HTML
  const html = await panel.innerHTML();
  const zincMatches = html.match(/zinc-\d+/g);

  // Should have zero hardcoded zinc-* classes
  expect(zincMatches || []).toEqual([]);
});

test('E2E-09b: Fine-tune panel uses semantic theme tokens', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await switchTab(page, 'finetune');

  const panel = page.locator(selectors.finetuneTab);
  await expect(panel).toBeVisible();

  const html = await panel.innerHTML();
  const zincMatches = html.match(/zinc-\d+/g);
  expect(zincMatches || []).toEqual([]);
});
```

---

## E2E-10: Drawer Width Consistency

### Test

```ts
test('E2E-10: Readme and Docs drawers have consistent width', async ({ page }) => {
  await goToDataset(page, 'test-dataset');

  // Open ReadmeDrawer
  await page.click(selectors.headerReadmeBtn);
  await expect(page.locator(selectors.readmeDrawer)).toBeVisible();
  const readmeWidth = await page.locator(selectors.readmeDrawer).evaluate(
    el => getComputedStyle(el).width
  );
  // Close
  await page.keyboard.press('Escape');

  // Open DocsDrawer
  await page.click(selectors.headerDocsBtn);
  await expect(page.locator(selectors.docsDrawer)).toBeVisible();
  const docsWidth = await page.locator(selectors.docsDrawer).evaluate(
    el => getComputedStyle(el).width
  );
  // Close
  await page.keyboard.press('Escape');

  // Widths should be the same
  expect(readmeWidth).toEqual(docsWidth);
});
```

---

## E2E-11: Plan Execution Progress & Cancel

### Mockup — Execution in Progress with Cancel

```
SIDEBAR                          WORKSPACE
┌───────────────────────────┐   ┌──────────────────────────────────────────────┐
│                           │   │ Plan executing... step 3/7         [Cancel]  │
│ [done] Topics configured  │   ├──────────────────────────────────────────────┤
│ [done] Data generated     │   │ [Data 120 animating] [Evaluation] [Fine-tune]│
│ [running] Evaluator...    │   ├──────────────────────────────────────────────┤
│ [ ] Dry run               │   │ Records appearing in real-time...            │
│ [ ] Readme                │   │                                              │
│ [ ] Fine-tuning           │   │                                              │
│                           │   │                                              │
│ Step 3/7 · ~4 min left    │   │                                              │
└───────────────────────────┘   └──────────────────────────────────────────────┘
```

### Test

```ts
test('E2E-11: Plan execution shows progress and cancel button', async ({ page }) => {
  await goToDataset(page, 'test-dataset-with-plan');
  await waitForLucyConnected(page);

  // Approve and execute
  await page.click(selectors.planCardApproveBtn);
  await page.click(selectors.planApproveConfirmBtn);

  // Plan banner should appear with step progress
  const banner = page.locator(selectors.planBanner);
  await expect(banner).toBeVisible({ timeout: 10000 });
  await expect(banner).toContainText(/step \d+ of \d+/i);

  // Cancel button should be present
  await expect(page.locator(selectors.planBannerCancel)).toBeVisible();

  // User should still be able to switch tabs during execution
  await switchTab(page, 'evaluation');
  await expect(page.locator(selectors.evaluationTab)).toBeVisible();
  // Banner should still be visible after tab switch
  await expect(banner).toBeVisible();
});
```

---

## E2E-12: Chat Error Recovery

### Mockup — Error with Retry/Dismiss (Flat Style)

```
┌──────────────────────────────────┐
│                                  │
│  ┃ Failed to send message        │  ← left-border red accent (2px)
│  ┃ The request timed out.        │     no card wrapper, no rounded
│  ┃ Your message was saved.       │
│  ┃ [Retry]  [Dismiss]            │
│                                  │
└──────────────────────────────────┘
```

### Test

```ts
test('E2E-12: Chat errors show retry and dismiss', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);

  // Force a chat error by blocking API mid-conversation
  await sendLucyMessage(page, 'Hello');
  await page.waitForTimeout(1000);
  await page.route('**/a2a/**', route => route.abort());
  await sendLucyMessage(page, 'This should fail');

  // Wait for error to appear
  await expect(page.locator(selectors.chatError)).toBeVisible({ timeout: 15000 });

  // Retry and dismiss buttons should be present
  await expect(page.locator(selectors.chatErrorRetry)).toBeVisible();
  await expect(page.locator(selectors.chatErrorDismiss)).toBeVisible();

  // Dismiss should hide the error
  await page.click(selectors.chatErrorDismiss);
  await expect(page.locator(selectors.chatError)).not.toBeVisible();
});
```

---

## E2E-13: Terminology Consistency

### Test

```ts
test('E2E-13: UI uses standardized terminology', async ({ page }) => {
  await goToDataset(page, 'test-dataset');

  // Get all visible text on the page
  const pageText = await page.locator('body').innerText();

  // Should NOT contain deprecated terms (in button labels, tab names, tooltips)
  // Check quick action area specifically
  const quickActionsText = await page.locator(selectors.quickActions).innerText();
  expect(quickActionsText).not.toContain('quality scoring');
  expect(quickActionsText).not.toContain('quality grader');

  // Tab labels should use "Evaluation" not "Grader"
  const tabBarText = await page.locator(selectors.tabBar).innerText();
  expect(tabBarText).toContain('Evaluation');
  expect(tabBarText).not.toContain('Grader');
});
```

---

## E2E-14: Chat Panel Flat Style — Message Layout

### Mockup — Flat Messages (No Bubbles)

```
┌──────────────────────────────────┐
│                                  │
│  You • 2:15 PM                   │  ← left-aligned, no avatar
│  Can you analyze my dataset?     │  ← no bubble, no bg, no border
│                                  │
│  🤖 Lucy • 2:15 PM              │  ← tiny 14px icon + label
│  I've analyzed your docs.        │  ← no bubble, content flows
│  Strong coverage in openings.    │
│                                  │
└──────────────────────────────────┘
```

### Test

```ts
test('E2E-14: Messages render flat without bubbles', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);

  // Send a message to get both user and assistant messages
  await sendLucyMessage(page, 'Hello');
  await page.waitForTimeout(5000);

  // User message: should be LEFT-aligned (items-start), not right
  const userMsg = page.locator('[data-testid="user-message"]').first();
  await expect(userMsg).toBeVisible();
  // Should NOT have bubble classes
  const userHtml = await userMsg.innerHTML();
  expect(userHtml).not.toContain('rounded-2xl');
  expect(userHtml).not.toContain('shadow-sm');
  expect(userHtml).not.toContain('bg-muted/40');
  // Should NOT have UserAvatar
  expect(userHtml).not.toContain('user-avatar');

  // Assistant message: should have tiny avatar (xs size)
  const assistantMsg = page.locator('[data-testid="assistant-message"]').first();
  await expect(assistantMsg).toBeVisible();
  const assistantHtml = await assistantMsg.innerHTML();
  // Should NOT have bubble classes
  expect(assistantHtml).not.toContain('rounded-2xl');
  expect(assistantHtml).not.toContain('shadow-sm');

  // Messages container should use compact spacing
  const container = page.locator('[data-testid="messages-container"]');
  await expect(container).toHaveClass(/space-y-2/);
});
```

---

## E2E-15: Chat Panel Flat Style — Tool Calls

### Mockup — Tool Calls as Left-Border Rows

```
┌──────────────────────────────────┐
│                                  │
│  ┃ ⏳ configure_topics           │  ← left-border accent (2px themed)
│  ┃   Configuring topics...       │
│                                  │
│  ┃ ✓ configure_topics  1.2s  ▶  │  ← completed: muted border
│                                  │
│  ┃ ✗ upload_dataset              │  ← error: red border
│  ┃   Upload failed               │
│                                  │
└──────────────────────────────────┘
```

### Test

```ts
test('E2E-15: Tool calls render as flat rows with left-border', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);

  // Trigger an action that uses tools
  await sendLucyMessage(page, 'Please create a setup plan');
  await page.waitForTimeout(10000);

  // Tool call elements should exist
  const toolCall = page.locator('[data-testid="tool-call"]').first();
  if (await toolCall.count() > 0) {
    // Should NOT have card-style classes
    const toolHtml = await toolCall.innerHTML();
    expect(toolHtml).not.toContain('rounded-lg');

    // Should have left-border styling
    const toolEl = await toolCall.evaluate(el => {
      const style = getComputedStyle(el);
      return {
        borderLeftWidth: style.borderLeftWidth,
        borderLeftStyle: style.borderLeftStyle,
      };
    });
    expect(toolEl.borderLeftWidth).not.toBe('0px');
    expect(toolEl.borderLeftStyle).toBe('solid');
  }
});
```

---

## E2E-16: Chat Panel Flat Style — Input Area

### Mockup — Simplified Input

```
╭───────────────────────────────────────╮  ← rounded-lg (not xl)
│ Ask Lucy...                    📎 🎤 │     no glow shadow
│                                   ▶  │     simple border focus
╰───────────────────────────────────────╯
```

### Test

```ts
test('E2E-16: Input area has simplified styling', async ({ page }) => {
  await goToDataset(page, 'test-dataset');
  await waitForLucyConnected(page);

  // Input container should exist
  const inputContainer = page.locator('[data-testid="chat-input-container"]');
  await expect(inputContainer).toBeVisible();

  // Should use rounded-lg, NOT rounded-xl
  const html = await inputContainer.innerHTML();
  expect(html).toContain('rounded-lg');
  expect(html).not.toContain('rounded-xl');

  // Focus the input
  await page.click(selectors.chatInput);

  // Should NOT have glow shadow on focus
  const focusShadow = await inputContainer.evaluate(el => {
    return getComputedStyle(el).boxShadow;
  });
  // Glow shadow would be something like "0 0 0 3px rgba(...)"
  // Simple border change should have "none" for box-shadow
  expect(focusShadow).toBe('none');
});
```

---

## Test Execution Plan

### Phase A Tests (run after quick wins)

| Test | Validates | Priority |
|------|-----------|----------|
| E2E-01 | PlanCard visibility | P0 |
| E2E-02 | Plan confirmation dialog | P0 |
| E2E-03 | Tabs during plan preview | P0 |
| E2E-04 | Connection timeout/retry | P0 |
| E2E-07 | Quick action prompts | P1 |
| E2E-10 | Drawer width consistency | P1 |
| E2E-13 | Terminology | P0 |

### Phase B Tests (run after structural changes)

| Test | Validates | Priority |
|------|-----------|----------|
| E2E-05 | Collapsed sidebar indicators | P0 |
| E2E-06 | Simple horizontal tabs | P0 |
| E2E-08 | Deploy tab content | P1 |
| E2E-11 | Plan execution cancel | P1 |
| E2E-12 | Chat error recovery | P0 |

### Phase C Tests (run after polish)

| Test | Validates | Priority |
|------|-----------|----------|
| E2E-09 | Theme compliance (zinc-*) | P1 |

### Phase D Tests (run after chat panel flat style)

| Test | Validates | Priority |
|------|-----------|----------|
| E2E-14 | Flat message layout (no bubbles) | P1 |
| E2E-15 | Tool calls as left-border rows | P1 |
| E2E-16 | Input area simplified styling | P2 |

### Running Tests

```bash
# Run all E2E tests for the redesign
npx playwright test e2e/finetune-redesign/ --headed

# Run specific phase
npx playwright test e2e/finetune-redesign/ --grep "E2E-0[1-4]|E2E-07|E2E-10|E2E-13"

# Run with trace for debugging
npx playwright test e2e/finetune-redesign/ --trace on
```

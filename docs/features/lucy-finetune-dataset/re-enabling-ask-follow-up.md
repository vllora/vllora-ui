# Re-enabling ask_follow_up Tool

This guide explains how to re-enable the `ask_follow_up` tool for the Lucy Finetune Agent if needed in the future.

## Background

The `ask_follow_up` tool was disabled to simplify the workflow. It provides structured UI components for presenting choices to users (select, multiselect, text input, etc.) instead of plain text options.

**Why it was disabled:**
- Added complexity to the agent interaction flow
- Required additional UI component rendering
- Plain text options provide a simpler, more conversational experience

**When you might want to re-enable it:**
- Need structured form inputs (dropdowns, checkboxes)
- Want to enforce specific option selection
- Need to collect multiple inputs at once in a stepper format

---

## Files to Modify

| File | Change Required |
|------|-----------------|
| `ui/src/hooks/useFineTuneAgentChat.ts` | Import and add tool to array |
| `gateway/agents/finetune/vllora-finetune-agent.md` | Add to external tools + update instructions |
| `ui/docs/features/lucy-finetune-dataset/architecture.md` | Update documentation |

---

## Step 1: Update Frontend Hook

**File:** `ui/src/hooks/useFineTuneAgentChat.ts`

### 1.1 Add import

```diff
- import { useAgent, useChatMessages } from '@distri/react';
+ import { useAgent, useChatMessages, createAskFollowUpTool } from '@distri/react';
```

### 1.2 Add tool to array

```diff
- // Tools - finetune tools only
- const tools = useMemo<DistriAnyTool[]>(() => [...finetuneTools], []);
+ // Tools - includes finetune tools + UI tools (ask_follow_up)
+ const tools = useMemo<DistriAnyTool[]>(
+   () => [...finetuneTools, createAskFollowUpTool()],
+   []
+ );
```

---

## Step 2: Update Agent Definition

**File:** `gateway/agents/finetune/vllora-finetune-agent.md`

### 2.1 Add to external tools

```diff
[tools]
builtin = ["final", "write_todos", "transfer_to_agent"]
external = [
+ # UI tools (handled by frontend)
+ "ask_follow_up",
+
  # Minimal tools for quick status checks
  "get_workflow_status"
]
```

### 2.2 Update Critical Rules section

Replace the conversational approach with ask_follow_up requirement:

```markdown
## 1. ALWAYS use ask_follow_up for choices
When presenting options or asking users to choose, you MUST use `ask_follow_up`.
NEVER list options in your text response.

**WRONG:**
```
Would you like to:
1. Generate data
2. Define topics
3. Skip to grader
```

**CORRECT:**
```
Based on my analysis, your dataset needs more data.
```
Then call ask_follow_up with the options.
```

### 2.3 Add ask_follow_up schema section

Add this section before the EXAMPLE CONVERSATION:

```markdown
# ask_follow_up SCHEMA

```json
{
  "title": "Title for the question card",
  "description": "Brief context (optional)",
  "questions": [
    {
      "id": "unique_id",
      "question": "What would you like to do?",
      "type": "select",
      "options": ["Option 1", "Option 2", "Option 3"],
      "required": true
    }
  ]
}
```

Question types:
- `select`: Single choice from options
- `multiselect`: Multiple choices
- `text`: Free-form text input
- `boolean`: Yes/No
```

### 2.4 Update task routing sections

Update sections like "When user opens a dataset" to use ask_follow_up:

```markdown
## When user opens a dataset (no workflow yet)

1. Delegate to `finetune_analysis`...

2. Summarize the analysis briefly in your response

3. Use `ask_follow_up` with initial options:
   ```json
   {
     "title": "Next Steps for {Dataset Name}",
     "description": "Based on the analysis, here are your options:",
     "questions": [{
       "id": "next_action",
       "question": "How would you like to proceed?",
       "type": "select",
       "options": [
         "Generate synthetic data from seed records",
         "Define a topic hierarchy for organization",
         "Skip to grader configuration (quick path)",
         "Add more original records first"
       ],
       "required": true
     }]
   }
   ```
```

---

## Step 3: Update Documentation

**File:** `ui/docs/features/lucy-finetune-dataset/architecture.md`

### 3.1 Update builtin tools table

```diff
The agent has access to two **builtin tools** provided by the Distri framework:
+ The agent has access to three **builtin tools** provided by the Distri framework:

| Tool | Purpose | UI Component |
|------|---------|--------------|
| `final` | Mark agent response as final | N/A |
| `write_todos` | Track sub-tasks with real-time progress updates | `TodosDisplay` from `@distri/react` |
+ | `ask_follow_up` | Ask structured follow-up questions in stepper format | `AskFollowUpComponent` from `@distri/react` |
```

### 3.2 Add ask_follow_up section

Add after the write_todos section:

```markdown
#### ask_follow_up

Allows the agent to ask structured questions with various input types.

```typescript
// Agent calls:
ask_follow_up({
  "title": "Training Configuration",
  "questions": [
    { "id": "epochs", "question": "How many epochs?", "type": "select", "options": ["1", "2", "3"] },
    { "id": "notes", "question": "Special requirements?", "type": "text", "required": false }
  ]
})
```

**Frontend Integration:**
- `createAskFollowUpTool()` from `@distri/react` creates the UI tool
- Added to tools array in `useFineTuneAgentChat.ts`
- `LucyToolCalls` renders the component when the agent calls the tool
```

### 3.3 Update tools array composition

```diff
**Tools Array Composition:**
```typescript
// In useFineTuneAgentChat.ts
- const tools = useMemo<DistriAnyTool[]>(() => [...finetuneTools], []);
+ const tools = useMemo<DistriAnyTool[]>(
+   () => [...finetuneTools, createAskFollowUpTool()],
+   []
+ );
```

- `finetuneTools`: All 21 function tools (workflow + step tools)
+ - `finetuneTools`: All 21 function tools (workflow + step tools + todos)
+ - `createAskFollowUpTool()`: UI tool for structured follow-up questions
```

---

## How It Works

When `ask_follow_up` is enabled:

1. **Agent calls the tool** with a JSON schema defining questions
2. **Distri server** routes the tool call to the frontend
3. **`LucyToolCalls` component** detects the tool call has a `component` property
4. **`AskFollowUpComponent`** renders a stepper UI with the questions
5. **User submits answers** through the UI
6. **Tool result** is sent back to the agent with user's selections
7. **Agent continues** based on user's choices

```
Agent → ask_follow_up({...}) → Frontend renders UI → User selects → Result sent back → Agent continues
```

---

## Testing After Re-enabling

1. Start the dev server: `pnpm dev`
2. Open a dataset in the Lucy assistant
3. Trigger an action that presents choices (e.g., "analyze this dataset")
4. Verify the ask_follow_up UI component renders
5. Select an option and verify the agent receives the response

---

## Rollback

To disable again, reverse the changes:
1. Remove `createAskFollowUpTool` import and usage from hook
2. Remove `ask_follow_up` from agent's external tools
3. Update agent instructions to use text-based options
4. Update documentation

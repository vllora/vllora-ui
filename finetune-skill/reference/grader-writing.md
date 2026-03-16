# Writing Grader Functions

The grader is the most important part of the fine-tuning pipeline. It's a JavaScript function that scores model responses from 0 to 1, and it runs during both evaluation (to test quality) and training (to teach the model).

**Why it matters:** During fine-tuning, the model generates its own responses and the grader scores them. High-scoring responses get reinforced, low-scoring ones get penalized. So the grader literally defines what the model learns. A grader that checks for accuracy, helpfulness, and tone will produce a model that's accurate, helpful, and well-toned. A sloppy grader produces a sloppy model.

---

## Function Signature

```javascript
async function evaluate(input) {
  // input.messages = the full conversation (system + user + assistant messages)
  // Must return: { score: <number 0-1>, reason: <string> }
}
```

**Rules:**
- Function must be named `evaluate`
- Accepts a single `input` parameter with a `messages` array
- Must return `{ score, reason }` where score is 0.0 to 1.0
- Can be `async` (required when using LLM-as-judge)
- Runs in a sandboxed JavaScript environment on the eval server

---

## Available Runtime Helpers

### `__langdb_call_llm_as_judge_obj(options)`

Call an LLM to judge response quality. Available in the evaluation runtime.

```javascript
const result = await __langdb_call_llm_as_judge_obj({
  prompt: "Rate this response...",
  max_tokens: 200
});
// result = { score: 8, reason: "Good response because..." }
```

The LLM model used is configured in the evaluator's `completion_params` (typically `gpt-4o-mini`).

---

## Grader Patterns

### Pattern 1: Pure Programmatic

Best for structured outputs (JSON, code, specific formats).

```javascript
async function evaluate(input) {
  const messages = input.messages || [];
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();

  if (!lastAssistant) {
    return { score: 0, reason: "No assistant response found" };
  }

  const content = lastAssistant.content || "";
  let score = 0;
  const issues = [];

  // Check minimum length
  if (content.length > 50) {
    score += 0.3;
  } else {
    issues.push("Response too short");
  }

  // Check for required elements
  if (content.includes("step") || content.includes("1.") || content.includes("First")) {
    score += 0.3;
  } else {
    issues.push("No step-by-step instructions");
  }

  // Check for professional tone (no informal language)
  const informalPatterns = /\b(lol|gonna|wanna|idk|tbh|nah)\b/i;
  if (!informalPatterns.test(content)) {
    score += 0.2;
  } else {
    issues.push("Informal language detected");
  }

  // Check it doesn't reveal internal info
  if (!content.includes("internal") && !content.includes("confidential")) {
    score += 0.2;
  } else {
    issues.push("Potential information leak");
  }

  const reason = issues.length > 0
    ? `Issues: ${issues.join(", ")}`
    : "All checks passed";

  return { score: Math.min(score, 1), reason };
}
```

### Pattern 2: LLM-as-Judge

Best for subjective quality assessment (tone, helpfulness, accuracy).

```javascript
async function evaluate(input) {
  const messages = input.messages || [];
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();
  const lastUser = messages.filter(m => m.role === "user").pop();

  if (!lastAssistant || !lastUser) {
    return { score: 0, reason: "Missing required messages" };
  }

  const result = await __langdb_call_llm_as_judge_obj({
    prompt: `You are evaluating a customer support assistant's response.

User question: ${lastUser.content}

Assistant response: ${lastAssistant.content}

Rate the response on a scale of 0-10 based on these criteria:
1. ACCURACY (0-3): Is the information correct and relevant?
2. HELPFULNESS (0-3): Does it solve the user's problem?
3. TONE (0-2): Is it professional and empathetic?
4. COMPLETENESS (0-2): Are all aspects of the question addressed?

Output JSON only:
{"score": <0-10>, "reason": "<1-2 sentence explanation>"}`,
    max_tokens: 200
  });

  return {
    score: Math.max(0, Math.min(1, (result.score || 0) / 10)),
    reason: result.reason || "No reason provided"
  };
}
```

### Pattern 3: Hybrid (Programmatic + LLM)

Best for combining hard constraints with quality judgment.

```javascript
async function evaluate(input) {
  const messages = input.messages || [];
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();
  const lastUser = messages.filter(m => m.role === "user").pop();

  if (!lastAssistant || !lastUser) {
    return { score: 0, reason: "Missing messages" };
  }

  const content = lastAssistant.content || "";

  // Hard constraints (programmatic) — instant fail if violated
  if (content.length < 20) {
    return { score: 0, reason: "Response too short (< 20 chars)" };
  }

  if (/\b(fuck|shit|damn)\b/i.test(content)) {
    return { score: 0, reason: "Inappropriate language" };
  }

  // Check for JSON validity if response should be structured
  if (lastUser.content.includes("JSON") || lastUser.content.includes("json")) {
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        JSON.parse(jsonMatch[1].trim());
      }
    } catch {
      return { score: 0.2, reason: "Invalid JSON in response" };
    }
  }

  // Quality assessment (LLM-as-judge) — for nuanced evaluation
  const result = await __langdb_call_llm_as_judge_obj({
    prompt: `Rate this assistant response 0-10. User: "${lastUser.content}" Response: "${content}". JSON: {"score": <0-10>, "reason": "<why>"}`,
    max_tokens: 150
  });

  return {
    score: Math.max(0, Math.min(1, (result.score || 0) / 10)),
    reason: result.reason || "Evaluated"
  };
}
```

---

## Grader Design Guidelines

### Score Distribution

A good grader produces a **spread of scores**, not just 0s and 1s:

| Distribution | Meaning | Action |
|-------------|---------|--------|
| All scores ~1.0 | Grader too lenient | Add stricter criteria |
| All scores ~0.0 | Grader too strict or broken | Relax criteria or fix bugs |
| Std dev < 0.1 | Not differentiating quality | Make criteria more nuanced |
| Std dev 0.15-0.30 | Good discrimination | Keep as-is |
| Bimodal (0 and 1) | Binary pass/fail | Add partial credit criteria |

### Criteria Alignment

Match grader criteria to your training objective:

| Objective | Grader Should Check |
|-----------|-------------------|
| Factual accuracy | Correctness of information, citing sources |
| Helpfulness | Whether the user's problem is solved |
| Safety | Absence of harmful/leaked info |
| Format compliance | JSON validity, required fields present |
| Tone | Professional, empathetic, appropriate register |
| Completeness | All aspects of the question addressed |
| Conciseness | Not padded, stays on topic |

### Smooth Scoring (Critical for Training)

Binary pass/fail scores (only 0 and 1) give a weak training signal. The model can't tell the difference between "completely wrong" and "almost right" — both get the same penalty. **Partial credit creates smoother learning gradients** that help the model improve incrementally.

```javascript
// Bad: binary — weak training signal
if (isCorrect) return { score: 1, reason: "Correct" };
return { score: 0, reason: "Incorrect" };

// Good: smooth — strong training signal
let score = 0;
if (mentionsCorrectConcept) score += 0.2;    // On the right track
if (structuredResponse) score += 0.2;         // Good format
if (accurateDetails) score += 0.3;            // Factually correct
if (completeCoverage) score += 0.2;           // All aspects addressed
if (appropriateTone) score += 0.1;            // Right register
return { score, reason: `Score breakdown: ...` };
```

Aim for scores that spread across the 0-1 range, not just the extremes. The model learns most from the gradient between "okay" (0.4) and "good" (0.7).

### Preventing Reward Hacking

Reward hacking happens when the model finds shortcuts that score well without genuinely being useful. The model exploits patterns in your grader rather than learning the actual skill.

**Common reward hacking patterns:**

| Grader checks for... | Model learns to... | Prevention |
|----------------------|-------------------|------------|
| Response length > 200 chars | Pad with filler text | Check for information density, not just length |
| Keywords like "step 1", "step 2" | Add numbered steps to everything, even when unnecessary | Check if steps are logical and relevant to the question |
| JSON validity | Return minimal valid JSON `{}` | Check for required fields AND meaningful content |
| Positive sentiment | Be relentlessly cheerful even when inappropriate | Check for appropriateness to context |

**How to detect it:** After training, test the model with prompts NOT in the training set. If responses feel formulaic, repetitive, or "gaming" a pattern — the model hacked the reward.

**Prevention strategies:**
1. **Check outcomes, not surface patterns** — "Did the response solve the problem?" beats "Does the response contain keywords?"
2. **Add negative criteria** — Penalize hallucinations, off-topic content, unnecessary verbosity
3. **Use LLM-as-judge for subjective quality** — Harder to hack than keyword checks
4. **Start small** — Run a small training job first (fewer epochs, subset of data) and inspect the model's behavior before scaling up
5. **Domain expert review** — Have the user spot-check model responses after a test training run

### Common Mistakes

1. **Grading the question, not the answer**: Make sure you evaluate `lastAssistant.content`, not `lastUser.content`
2. **Ignoring context**: Multi-turn conversations need full context, not just the last turn
3. **Binary scoring**: Use the full 0-1 range, not just 0 and 1. Smooth scores create better training gradients.
4. **Unstable LLM prompts**: Be specific in your judge prompt to get consistent scores
5. **Not handling edge cases**: What if the assistant response is empty? What if there's no user message?
6. **No negative criteria**: Only checking for good things — the model can pad responses with noise and still score well. Add checks that penalize bad patterns.
7. **Grader too slow**: If using LLM-as-judge, keep prompts concise. The grader runs on every record during evaluation AND training.

---

## Testing Your Grader

**Dry-run against sample rows** to verify before deploying:

```bash
# Test with a good response — should score high
uv run scripts/dry_run_grader.py --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "<good response>"}]}'

# Test with a bad response — should score low
uv run scripts/dry_run_grader.py --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "<bad response>"}]}'
```

Verify across these scenarios:
1. **Perfect response**: Should score 0.8-1.0
2. **Mediocre response**: Should score 0.4-0.6
3. **Bad response**: Should score 0.0-0.2
4. **Empty response**: Should score 0.0
5. **Off-topic response**: Should score low
6. **Correct but rude response**: Should score moderately

If your grader doesn't differentiate these scenarios, revise the criteria.

**Note:** The sandbox does NOT support `console.log` — use the `reason` field for debug output.

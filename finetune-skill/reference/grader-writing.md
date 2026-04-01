# Writing Grader Functions

The grader is the most important part of the fine-tuning pipeline. It's a JavaScript function that scores model responses from 0 to 1, and it runs during both evaluation (to test quality) and training (to teach the model).

**Why it matters:** During fine-tuning, the model generates its own responses during training, and the grader scores them. High-scoring responses get reinforced, low-scoring ones get penalized. So the grader literally defines what the model learns. A grader that checks for accuracy, helpfulness, and tone will produce a model that's accurate, helpful, and well-toned. A sloppy grader produces a sloppy model.

---

## Function Signature

```javascript
function evaluate(input) {
  // input.messages = the full conversation (system + user + assistant messages)
  // input.response = the model's generated response (string, set by runtime)
  // input.history = conversation history (string, set by runtime)
  // input.ground_truth = optional reference text (string — from training record)
  // Must return: { score: <number 0-1>, reason: <string> }
}
```

**Rules:**
- Function must be named `evaluate`
- Accepts a single `input` parameter with a `messages` array
- Must return `{ score, reason }` where score is 0.0 to 1.0
- **Synchronous only** — the QuickJS sandbox does not support `async`/`await`
- Runs in a sandboxed JavaScript environment on the eval server

---

## Available Runtime Helpers

### `__langdb_call_llm_as_judge_obj(config, input)`

Call an LLM to judge response quality. Takes two arguments:

- **`config`** — an object with three fields:
  - `prompt_template`: Array of `{role, content}` message objects. Content can use `{{history}}` and `{{response}}` as template variables — they are replaced with the corresponding fields from `input` before the LLM call.
  - `output_schema`: JSON Schema describing the structured output you expect from the judge (per-criterion scores, reasoning, etc.).
  - `completion_params`: `{model_name, temperature, max_tokens}` — controls which model evaluates and how.
- **`input`** — the input row object. You must set `input.history` and `input.response` before calling so the template variables resolve correctly.

**Calling pattern:**

```javascript
// 1. Extract response and history from input
let response = "";
let history = "";

if (input.response && typeof input.response === "string") {
    response = input.response;
    history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
} else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
    const lastMessage = input.messages[input.messages.length - 1];
    if (lastMessage.content) response = lastMessage.content;
    history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
}

// 2. Define config
const config = {
    prompt_template: [
        { role: "system", content: "You are an expert evaluator." },
        {
            role: "user",
            content: `Conversation:\n{{history}}\n\nResponse:\n{{response}}\n\nRate on criteria...`
        }
    ],
    output_schema: {
        type: "object",
        properties: {
            reasoning: { type: "string" },
            accuracy: { type: "number", minimum: 0, maximum: 5 },
            helpfulness: { type: "number", minimum: 0, maximum: 5 }
        },
        required: ["reasoning", "accuracy", "helpfulness"],
        additionalProperties: false
    },
    completion_params: {
        model_name: "gpt-4.1",
        temperature: 0.0,
        max_tokens: 1000
    }
};

// 3. Set input fields for template variable resolution
input.history = history;
input.response = response;

// 4. Call (synchronous — no await)
const result = __langdb_call_llm_as_judge_obj(config, input);
// result matches output_schema shape, or { error: "..." } on failure
```

**Result handling:** The result object matches your `output_schema` shape. On failure, it returns `{error: "..."}` — always check `result.error` before using scores.

### `__langdb_call_stockfish(payload)` (domain-specific)

Available only for chess-related graders. Evaluates a chess move against the Stockfish engine.

```javascript
if (typeof __langdb_call_stockfish === "function") {
    const payload = { fen: "rnbqkbnr/pppppppp/...", uci_move: "e2e4" };
    const raw = __langdb_call_stockfish(JSON.stringify(payload));
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    // result = { isValidMove, isBestMove, stockfishScore, bestMove, moveScore }
}
```

Always guard with `typeof __langdb_call_stockfish === "function"` — this helper is only injected for chess workflows.

---

## Using Optional Reference Data (`ground_truth`)

When training records include a `ground_truth` field (usually a concise source excerpt, but it can be any auxiliary reference string), the grader can use it to verify factual accuracy or apply task-specific evaluation logic.

### How it works

- `input.ground_truth` contains the reference text (string, may be empty/absent)
- `{{ground_truth}}` is a template variable that auto-resolves in `__langdb_call_llm_as_judge_obj` prompts
- The generated grader templates already include conditional `ground_truth` support

### Example: Conditional inclusion in judge prompt

```javascript
// Extract ground truth if available
var groundTruth = (input.ground_truth && typeof input.ground_truth === "string")
    ? input.ground_truth : "";
input.ground_truth = groundTruth;

// In your prompt_template, conditionally include it:
content: `Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}
` + (groundTruth ? `
Source Reference (use to verify factual accuracy):
{{ground_truth}}
` : "") + `
Evaluate the response on these criteria:
...`
```

### Best practices

- Use `ground_truth` for evaluator-side reference context. A source excerpt is the most common pattern, but any intentionally chosen text field is valid.
- The field is **optional** — graders must work with or without it (use conditional inclusion as shown above)
- Keep the text focused on whatever the grader needs — for source excerpts, include only the passage(s) relevant to the question rather than the whole document
- `generate_records.py` produces `ground_truth` by default; disable with `--no-ground-truth`

---

## Designing Criteria (Before Writing Code)

**Don't jump straight to writing JavaScript.** First, analyze the training data to understand what "good" and "bad" look like in your domain. This analysis directly informs your grader criteria and weights.

### Steps

1. **Read 10-15 sample rows** from `training.jsonl` spanning different topics
2. **For each row**, imagine: what would a perfect response look like? A mediocre one? A terrible one?
3. **Identify 3-5 domain-specific qualities** that separate good from bad — these become your criteria
4. **Decide for each criterion**: programmatic check (format, structure, keywords) or LLM judgment (tone, accuracy, reasoning quality)?
5. **Assign weights** — which criteria matter most for your objective?
6. **Then write the JS** informed by this analysis

### Example Walkthrough

Suppose you're fine-tuning a **medical Q&A assistant** and read these sample rows:

| Row | User asks | What a good response needs |
|-----|-----------|---------------------------|
| 1 | "What causes migraines?" | Accurate medical info, cites common causes, appropriate caveats |
| 2 | "Can I take ibuprofen with blood thinners?" | Safety-critical — must warn about interaction, recommend consulting doctor |
| 3 | "Explain MRI results showing disc herniation" | Clear explanation of medical terminology, educational tone |

From this analysis, you'd identify these criteria:

| Criterion | Type | Weight | Why |
|-----------|------|--------|-----|
| Medical accuracy | LLM judge | 0.30 | Core purpose — wrong info is dangerous |
| Safety caveats | Programmatic | 0.25 | Must include "consult your doctor" for treatment questions |
| Clarity | LLM judge | 0.20 | Patients need plain-language explanations |
| Completeness | LLM judge | 0.15 | Should cover all aspects of the question |
| Format | Programmatic | 0.10 | Minimum length, no jargon without explanation |

Now you have a clear blueprint for the grader — the criteria, how each is evaluated, and how they're weighted.

---

## Critical Rules

1. **COPY a template file — do NOT write from scratch or cherry-pick.** Literally `cp templates/grader-mcq.js grader.js` and customize the domain-specific parts (criteria, weights, system prompt). Keep the template's LLM-as-judge scoring architecture intact. If you write scoring logic from scratch (e.g., `if response.length > 150 → score 1.0`), you'll produce coarse scores that cluster at 0 or 1 — GRPO gets zero gradient from these.

2. **NEVER return score 0.0 for a parsing/extraction failure.** If you can't parse the model's response format, use LLM-based extraction as fallback. Score 0.0 must mean the response is genuinely wrong or empty. Parsing failures that produce 0.0 are grader bugs — they waste eval runs and produce garbage training signal.

3. **Separate extraction from scoring.** The model's response format is unpredictable. Extract the answer/label/data first (regex → LLM fallback), then score the extracted content. See `grader-mcq.js` for the pattern.

---

## Grader Patterns

### Pattern 1: Pure Programmatic

Best for structured outputs (JSON, code, specific formats) or when you can fully define "good" with rules.

**⚠️ WARNING:** Pure programmatic graders are fragile when the model's response format is unpredictable (e.g., MCQ where the model buries the answer in prose). For tasks with verifiable answers, use `grader-mcq.js` or `grader-classification.js` instead — they include LLM extraction fallback.

```javascript
function evaluate(input) {
    // Standard response extraction
    let response = "";
    if (input.response && typeof input.response === "string") {
        response = input.response;
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) response = lastMessage.content;
    }

    if (!response || response.trim().length < 10) {
        return { score: 0, reason: "Response is empty or too short" };
    }

    let score = 0;
    const issues = [];

    // Check minimum length
    if (response.length > 50) {
        score += 0.3;
    } else {
        issues.push("Response too short");
    }

    // Check for required elements
    if (response.includes("step") || response.includes("1.") || response.includes("First")) {
        score += 0.3;
    } else {
        issues.push("No step-by-step instructions");
    }

    // Check for professional tone (no informal language)
    var informalPatterns = /\b(lol|gonna|wanna|idk|tbh|nah)\b/i;
    if (!informalPatterns.test(response)) {
        score += 0.2;
    } else {
        issues.push("Informal language detected");
    }

    // Check it doesn't reveal internal info
    if (!response.includes("internal") && !response.includes("confidential")) {
        score += 0.2;
    } else {
        issues.push("Potential information leak");
    }

    var reason = issues.length > 0
        ? "Issues: " + issues.join(", ")
        : "All checks passed";

    return { score: Math.min(score, 1), reason: reason };
}
```

### Pattern 2: LLM-as-Judge

Best for subjective quality assessment (tone, helpfulness, accuracy). Uses the full `(config, input)` API with per-criterion structured scoring.

```javascript
function evaluate(input) {
    // 1. Extract response and history
    let response = "";
    let history = "";

    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) response = lastMessage.content;
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }

    if (!response || response.trim() === "") {
        return { score: 0, reason: "Model failed to produce a response (empty output)." };
    }

    // 2. Define LLM-as-judge configuration
    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator assessing AI assistant response quality."
            },
            {
                role: "user",
                content: `Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}

Evaluate the response on these criteria:

1. **Accuracy**: Is the information correct and relevant? (0-5)
2. **Helpfulness**: Does it address the user's needs? (0-5)
3. **Clarity**: Is it well-structured and easy to understand? (0-5)
4. **Completeness**: Are all aspects of the question covered? (0-5)

Provide a DETAILED explanation, then assign scores (0-5) for each criterion.

Answer in JSON format:
{
  "reasoning": string (Full detailed explanation),
  "accuracy": number (0-5),
  "helpfulness": number (0-5),
  "clarity": number (0-5),
  "completeness": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                accuracy: { type: "number", minimum: 0, maximum: 5 },
                helpfulness: { type: "number", minimum: 0, maximum: 5 },
                clarity: { type: "number", minimum: 0, maximum: 5 },
                completeness: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "accuracy", "helpfulness", "clarity", "completeness"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 1000
        }
    };

    // 3. Set input fields for template variable resolution
    input.history = history;
    input.response = response;

    // 4. Call LLM-as-judge (synchronous)
    try {
        const result = __langdb_call_llm_as_judge_obj(config, input);

        if (result.error) {
            return { score: 0, reason: "LLM-as-judge error: " + (result.error || "Unknown error") };
        }

        // Extract scores safely
        const accuracy = typeof result.accuracy === 'number' ? result.accuracy : 0;
        const helpfulness = typeof result.helpfulness === 'number' ? result.helpfulness : 0;
        const clarity = typeof result.clarity === 'number' ? result.clarity : 0;
        const completeness = typeof result.completeness === 'number' ? result.completeness : 0;

        const judgeReasoning = result.reasoning || "No reasoning provided";

        // Average across criteria (each 0-5), normalize to 0-1
        const total = accuracy + helpfulness + clarity + completeness;
        const avgScore = total / 4;
        let finalScore = avgScore / 5.0;

        if (isNaN(finalScore)) finalScore = 0;
        finalScore = Math.max(0, Math.min(1, finalScore));

        return {
            score: finalScore,
            reason: judgeReasoning,
            accuracy: accuracy,
            helpfulness: helpfulness,
            clarity: clarity,
            completeness: completeness
        };
    } catch (error) {
        return {
            score: 0,
            reason: "Error: " + (error.message || "Unknown exception")
        };
    }
}
```

### Pattern 3: Hybrid (Programmatic + LLM)

Best for combining hard constraints (instant pass/fail) with nuanced quality judgment. Hard constraints are checked first — if violated, the LLM call is skipped entirely (saves cost and latency).

```javascript
function evaluate(input) {
    // 1. Extract response and history
    let response = "";
    let history = "";

    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) response = lastMessage.content;
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }

    if (!response || response.trim() === "") {
        return { score: 0, reason: "Model failed to produce a response (empty output)." };
    }

    // 2. Hard constraints (programmatic) — instant fail if violated
    if (response.length < 20) {
        return { score: 0, reason: "Response too short (< 20 chars)" };
    }

    if (/\b(fuck|shit|damn)\b/i.test(response)) {
        return { score: 0, reason: "Inappropriate language" };
    }

    // Check JSON validity if response should be structured
    var userContent = "";
    if (input.messages && Array.isArray(input.messages)) {
        var userMsgs = input.messages.filter(function(m) { return m.role === "user"; });
        if (userMsgs.length > 0) userContent = userMsgs[userMsgs.length - 1].content || "";
    }

    if (userContent.includes("JSON") || userContent.includes("json")) {
        try {
            var jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                JSON.parse(jsonMatch[1].trim());
            }
        } catch (e) {
            return { score: 0.2, reason: "Invalid JSON in response" };
        }
    }

    // 3. Quality assessment via LLM-as-judge
    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator assessing AI assistant response quality."
            },
            {
                role: "user",
                content: `Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}

Rate the response on these criteria:

1. **Relevance**: Does it directly address the user's question? (0-5)
2. **Quality**: Is it accurate, clear, and well-structured? (0-5)
3. **Completeness**: Does it fully answer the question? (0-5)

Provide a detailed explanation and scores.

Answer in JSON format:
{
  "reasoning": string,
  "relevance": number (0-5),
  "quality": number (0-5),
  "completeness": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                relevance: { type: "number", minimum: 0, maximum: 5 },
                quality: { type: "number", minimum: 0, maximum: 5 },
                completeness: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "relevance", "quality", "completeness"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 1000
        }
    };

    input.history = history;
    input.response = response;

    try {
        const result = __langdb_call_llm_as_judge_obj(config, input);

        if (result.error) {
            return { score: 0, reason: "LLM-as-judge error: " + (result.error || "Unknown error") };
        }

        const relevance = typeof result.relevance === 'number' ? result.relevance : 0;
        const quality = typeof result.quality === 'number' ? result.quality : 0;
        const completeness = typeof result.completeness === 'number' ? result.completeness : 0;

        const total = relevance + quality + completeness;
        const avgScore = total / 3;
        let finalScore = avgScore / 5.0;

        if (isNaN(finalScore)) finalScore = 0;
        finalScore = Math.max(0, Math.min(1, finalScore));

        return {
            score: finalScore,
            reason: result.reasoning || "Evaluated",
            relevance: relevance,
            quality: quality,
            completeness: completeness
        };
    } catch (error) {
        return {
            score: 0,
            reason: "Error: " + (error.message || "Unknown exception")
        };
    }
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
8. **Using async/await**: The QuickJS sandbox is synchronous. Use `function evaluate(input)`, not `async function evaluate(input)`.

---

## Testing Your Grader

**Dry-run against sample rows** to verify before deploying:

```bash
# Test with a good response — should score high
python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py --workflow-id $WORKFLOW_ID --script grader.js \
  --row '{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "<good response>"}]}'

# Test with a bad response — should score low
python3 ${CLAUDE_SKILL_DIR}/scripts/dry_run_grader.py --workflow-id $WORKFLOW_ID --script grader.js \
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

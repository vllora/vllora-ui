# Evaluation: How We Know the Skill Works

This document answers:
1. How is evaluation different from the finetune approach?
2. How do we prove "model + skill" > "base model"?
3. What exactly do we measure and how?

---

## The Core Difference

### Finetune evaluation (current)

```
Base model → Fine-tune → Finetuned model → Grade responses → Score

Problem: The grader can't verify factual accuracy because it has NO access
to the source material. It can only judge "does this sound good?"
```

### Skill evaluation (proposed)

```
Base model + Skill → Grade responses → Score
Base model alone   → Grade responses → Score
                                         ↓
                              Compare. Measure the delta.

Advantage: The grader CAN verify factual accuracy because the knowledge
chunks are available. It knows what the correct answer should look like.
```

**The fundamental improvement**: In finetune evaluation, the grader is blind — it judges vibes. In skill evaluation, the grader is informed — it judges against source material.

---

## What We Evaluate (5 Dimensions)

| # | Question | What it measures | Detail Section |
|---|----------|-----------------|----------------|
| 1 | **Does the skill help?** | Base model vs Skilled model — side-by-side comparison | [Evaluation 1: The Delta Test](#evaluation-1-skill-vs-base-model-the-delta-test) |
| 2 | **Is knowledge retrieval working?** | Are we finding the right chunks for each question? | [Evaluation 2: Retrieval Quality](#evaluation-2-retrieval-quality) |
| 3 | **Are synthetic examples useful?** | Does adding them improve response quality? | [Evaluation 3: Ablation Test](#evaluation-3-ablation-test-what-helps-what-doesnt) |
| 4 | **Is the response factually grounded?** | Do answers match what the source docs actually say? | [Evaluation 4: Grounding Check](#evaluation-4-factual-grounding-check) |
| 5 | **Does it handle edge cases?** | Out-of-scope questions, ambiguous queries, contradictions | [Evaluation 5: Edge Cases](#evaluation-5-edge-cases--boundaries) |

---

## Evaluation 1: Skill vs Base Model (The Delta Test)

This is the most important evaluation — it directly answers "is the skill worth it?"

### How it works

Run the **same test questions** through two configurations and compare:

```
Configuration A: Base foundation model (no skill, no context)
Configuration B: Foundation model + full skill (knowledge + synthetic data + config)

Same model, same questions, different context.
```

### The test

```
For each of 30-50 test questions:

  ┌─────────────────────────────────────────────────────────┐
  │ Question: "What should Black play after 5.d4 in the     │
  │            Italian Game?"                                │
  │                                                          │
  │ Config A (base model, no skill):                         │
  │   → Model answers from general knowledge                 │
  │   → Grader scores: accuracy, depth, citations            │
  │   → Score: 0.61                                          │
  │                                                          │
  │ Config B (model + skill):                                │
  │   → Model answers with knowledge chunks + examples       │
  │   → Grader scores: accuracy, depth, citations            │
  │   → Score: 0.89                                          │
  │                                                          │
  │ Delta: +0.28  ✓ Skill helps significantly                │
  └─────────────────────────────────────────────────────────┘
```

### What the grader checks (per response)

```typescript
{
  // Factual accuracy — grader has the knowledge chunks, can verify
  accuracy: {
    score: 0.9,        // 0-1
    reasoning: "Response correctly identifies 5...exd4 6.cxd4 Bb4+ as the main line,
                consistent with MCO 15th Ed. pp. 87-89. No factual errors detected."
  },

  // Depth appropriateness — is it right for the audience?
  depth: {
    score: 0.85,
    reasoning: "Explains ideas before moves, appropriate for 1200-1800 level.
                Could go slightly deeper on WHY ...d5 equalizes."
  },

  // Source grounding — does it cite, and are citations real?
  grounding: {
    score: 0.95,       // Config B advantage: it actually has sources to cite
    reasoning: "Cites MCO 15th Ed. pp. 87-89. Citation is accurate and relevant."
  },

  // Completeness — did it address the full question?
  completeness: {
    score: 0.80,
    reasoning: "Covers the main line and common mistake. Could mention the
                Evans Gambit as an alternative for completeness."
  },

  // Behavioral quality — tone, engagement, structure
  quality: {
    score: 0.90,
    reasoning: "Clear structure, encouraging tone, offers to go deeper.
                Matches expected teaching style."
  }
}
```

### The report the user sees

```
┌──────────────────────────────────────────────────────────────────────┐
│  Skill Evaluation Report                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  Overall: Your skill improves model performance by +31%              │
│                                                                      │
│  ┌──────────────────┬───────────┬───────────┬──────────┐            │
│  │ Dimension        │ Base Model│ With Skill│ Delta    │            │
│  ├──────────────────┼───────────┼───────────┼──────────┤            │
│  │ Accuracy         │   0.58    │   0.87    │  +0.29   │            │
│  │ Depth            │   0.52    │   0.83    │  +0.31   │            │
│  │ Source Grounding │   0.12    │   0.91    │  +0.79   │  ← huge   │
│  │ Completeness     │   0.61    │   0.78    │  +0.17   │            │
│  │ Behavioral Qual. │   0.65    │   0.88    │  +0.23   │            │
│  ├──────────────────┼───────────┼───────────┼──────────┤            │
│  │ OVERALL          │   0.50    │   0.85    │  +0.35   │            │
│  └──────────────────┴───────────┴───────────┴──────────┘            │
│                                                                      │
│  Key findings:                                                       │
│  • Biggest improvement: Source grounding (+0.79)                     │
│    Base model rarely cites sources; skilled model cites consistently │
│  • Accuracy: +0.29 — skill prevents common factual errors           │
│  • Weakest improvement: Completeness (+0.17)                        │
│    Some topics have thin knowledge coverage → add more docs?        │
│                                                                      │
│  Verdict: ✓ SKILL SIGNIFICANTLY IMPROVES PERFORMANCE                │
│                                                                      │
│  Per-topic breakdown:                                                │
│  ┌─────────────────────┬───────┬───────┬────────┐                   │
│  │ Topic               │ Base  │ Skill │ Delta  │                   │
│  ├─────────────────────┼───────┼───────┼────────┤                   │
│  │ Italian Game        │ 0.55  │ 0.91  │ +0.36  │                   │
│  │ Sicilian Defense    │ 0.60  │ 0.85  │ +0.25  │                   │
│  │ General Principles  │ 0.65  │ 0.89  │ +0.24  │                   │
│  │ King's Indian       │ 0.42  │ 0.79  │ +0.37  │                   │
│  │ London System       │ 0.38  │ 0.82  │ +0.44  │ ← most improved │
│  │ ...                 │       │       │        │                   │
│  └─────────────────────┴───────┴───────┴────────┘                   │
│                                                                      │
│  ⚠ Topics with low skill score (needs attention):                   │
│  • Grünfeld Defense: 0.68 — only 12 knowledge chunks, 8 examples    │
│    Recommendation: Upload more material about the Grünfeld          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Evaluation 2: Retrieval Quality

Does the system find the **right** knowledge chunks and the **right** synthetic examples for each question?

### How it works

Use test questions where we **know** which chunks should be retrieved:

```
Test question: "What should Black play after 5.d4 in the Italian Game?"
Expected chunks: ["mco15:chunk-042", "mco15:chunk-043"]  ← we know these contain the answer
Expected examples: topic="Italian Game", question_type="how to play"

Actual retrieved chunks: ["mco15:chunk-042", "mco15:chunk-043", "mco15:chunk-041"]
Actual retrieved examples: ["conv-001" (Italian Game), "conv-018" (Italian Game)]

Retrieval scores:
  Precision:  2/3 = 0.67  (2 of 3 retrieved chunks were relevant)
  Recall:     2/2 = 1.00  (both expected chunks were found)
  F1:         0.80
```

### The report

```
Knowledge Retrieval Quality:
  Avg Precision:    0.72  (some irrelevant chunks retrieved, but not harmful)
  Avg Recall:       0.89  (most relevant chunks found — good)
  Avg F1:           0.79

Example Retrieval Quality:
  Topic match:      91%   (retrieved examples match the question's topic)
  Type match:       84%   (retrieved examples match the question type)
  Difficulty match:  78%  (retrieved examples match the user's level)

Retrieval failures (needs attention):
  • "Compare King's Indian vs Grünfeld" → Only retrieved KID chunks, missed Grünfeld
    Fix: Improve cross-topic retrieval for comparison questions
```

### Why this matters

If retrieval is bad, the skill is bad — the model gets wrong context and produces wrong answers. Measuring retrieval separately lets us pinpoint WHERE the problem is (retrieval vs generation vs grading).

---

## Evaluation 3: Ablation Test (What Helps, What Doesn't)

Test each component's contribution by turning them on/off:

```
Config A: Base model (no skill)                     → Score: 0.50
Config B: Model + knowledge only                    → Score: 0.72
Config C: Model + synthetic examples only           → Score: 0.68
Config D: Model + knowledge + synthetic examples    → Score: 0.83
Config E: Full skill (D + reasoning + rubric)       → Score: 0.85

Component contribution:
  Knowledge chunks:      +0.22  (0.50 → 0.72)  ← facts matter most
  Synthetic examples:    +0.18  (0.50 → 0.68)  ← behavioral patterns help a lot
  Both together:         +0.33  (0.50 → 0.83)  ← synergy: better than sum
  Reasoning + rubric:    +0.02  (0.83 → 0.85)  ← small but consistent
```

### The report

```
┌──────────────────────────────────────────────────────────────────────┐
│  Component Contribution Analysis                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  0.50 ████████████████████░░░░░░░░░░░░░░░░░░░░░░ Base model         │
│  0.72 ████████████████████████████████░░░░░░░░░░ + Knowledge        │
│  0.68 ██████████████████████████████░░░░░░░░░░░░ + Examples         │
│  0.83 ██████████████████████████████████████████░ + Both             │
│  0.85 █████████████████████████████████████████████ Full skill       │
│                                                                      │
│  Insight: Knowledge and examples have a synergy effect.              │
│  Knowledge alone: +0.22. Examples alone: +0.18. Together: +0.33.    │
│  The examples teach the model HOW to use the knowledge effectively.  │
└──────────────────────────────────────────────────────────────────────┘
```

### Why this matters to the user

If knowledge contributes +0.22 but their examples only contribute +0.02, that tells them:
- Their synthetic data might be low quality → regenerate with stricter grading
- Or the examples are too similar to each other → need more diversity

If knowledge contributes +0.05 but examples contribute +0.25, that tells them:
- Their PDFs might be poorly structured → re-chunk or add better docs
- The domain is more about behavior than facts → focus on example quality

---

## Evaluation 4: Factual Grounding Check

This is **impossible** in the finetune approach but **natural** in the skills approach.

### How it works

The grader has access to the same knowledge chunks the model used. It can verify whether claims match the sources.

```
Model response:
  "After 5.d4 exd4 6.cxd4 Bb4+ 7.Bd2 Bxd2+ 8.Nbxd2, play 8...d5!
   This equalizes because Black opens lines and challenges e4.
   [Source: MCO 15th Ed., pp. 87-89]"

Grader checks:
  1. Is 5...exd4 6.cxd4 Bb4+ the main line? → Check chunk mco15:chunk-042
     ✓ Yes, chunk says "Main Line: 4.c3 Nf6 5.d4 exd4 6.cxd4 Bb4+"

  2. Is 8...d5 the recommended move? → Check chunk mco15:chunk-042
     ✓ Yes, chunk says "Key positions arise after 8...d5 9.exd5 Nxd5"

  3. Does the citation exist? → Check chunk metadata
     ✓ Yes, chunk is from pages 87-89 of MCO 15th Ed.

  4. Any claims NOT supported by chunks?
     ⚠ "This equalizes" — chunk says "comfortable equality" which is close but
        the model added nuance not explicitly stated. Minor issue.

  Grounding score: 0.92 (high — most claims verified against sources)
```

### Hallucination detection

```
Model response:
  "The Evans Gambit (4.b4) was refuted by Lasker in 1892."

Grader checks:
  1. Is the Evans Gambit 4.b4? → Check chunks
     ✓ Yes, confirmed in mco15:chunk-045

  2. Was it "refuted by Lasker in 1892"? → Check ALL chunks
     ✗ No chunk mentions Lasker or 1892 in connection with the Evans Gambit
     ✗ HALLUCINATION DETECTED — model fabricated a historical claim

  Grounding score: 0.40 (low — contains unverifiable claim)
  Flag: "Claim about Lasker 1892 not found in any knowledge source"
```

### Why this is a game-changer

In finetune evaluation:
```
Grader: "Does this response sound correct?"  ← subjective, unreliable
```

In skill evaluation:
```
Grader: "Does chunk X actually say what the model claims?"  ← objective, verifiable
```

---

## Evaluation 5: Edge Cases & Boundaries

### Out-of-scope handling

```
Question: "Can you analyze this endgame position?"
Expected: Model acknowledges this is outside its specialty

Config B (skill):
  "Great question, but my specialty is openings — I'm grounded in MCO 15th Ed.
   and Understanding Chess Openings. For endgame analysis, I'd recommend..."
  → Score: 0.90 (correctly identified scope boundary)

Config A (base):
  "Sure! In this endgame position, the key is to advance your king..."
  → Score: 0.30 (overconfident, no scope awareness)
```

### Contradictory information

```
Question: "My coach says the King's Gambit is unsound, but I read it's fine. Who's right?"
Expected: Model presents both perspectives, cites what the sources say

Config B (skill):
  "Your coach has a point — modern theory gives Black good chances with best play.
   However, at the club level (1200-1800), the King's Gambit is practical because...
   [Source: MCO 15th Ed., pp. 72-74]"
  → Score: 0.85 (nuanced, cites source, level-appropriate)
```

### Ambiguous questions

```
Question: "What's the best opening?"
Expected: Model asks for context (playing as White or Black? what level? what style?)

Config B (skill):
  "That depends on a few things! Are you playing as White or Black? And what's
   your style — do you prefer sharp tactical battles or solid positional play?"
  → Score: 0.90 (appropriately asks for clarification)
```

---

## Evaluation Pipeline: Step by Step

### What happens when the user clicks "Test Skill"

```
Step 1: GENERATE TEST SUITE (automatic)
  ├── 10 in-scope questions (2 per major topic)
  ├── 5 cross-topic questions (comparisons, relationships)
  ├── 5 difficulty-varied questions (2 beginner, 2 intermediate, 1 advanced)
  ├── 3 out-of-scope questions (should decline or redirect)
  ├── 3 hallucination-bait questions (should not fabricate)
  ├── 2 ambiguous questions (should ask for clarification)
  └── 2 edge cases (contradictions, unusual requests)
  = 30 total test cases

Step 2: RUN BASE MODEL (Config A)
  ├── Send all 30 questions to the foundation model WITHOUT skill
  ├── Collect 30 responses
  └── Store as baseline

Step 3: RUN SKILLED MODEL (Config B)
  ├── Send all 30 questions to the foundation model WITH full skill
  │   (knowledge retrieval + synthetic example retrieval + config)
  ├── Collect 30 responses
  ├── Record which chunks and examples were retrieved per question
  └── Store as skill responses

Step 4: GRADE BOTH (informed grading)
  For each of the 30 question pairs:
  ├── Grade Config A response on 5 dimensions
  │   (accuracy, depth, grounding, completeness, quality)
  ├── Grade Config B response on same 5 dimensions
  │   NOTE: Grader has access to knowledge chunks for verification
  ├── Compare scores
  └── Flag any regressions (skill worse than base — investigate)

Step 5: RETRIEVAL EVALUATION
  For each skilled response:
  ├── Were the right knowledge chunks retrieved?
  ├── Were the right synthetic examples retrieved?
  └── Calculate precision, recall, F1

Step 6: GROUNDING CHECK
  For each skilled response:
  ├── Extract all factual claims
  ├── Check each claim against retrieved chunks
  ├── Flag unsupported claims as potential hallucinations
  └── Calculate grounding score

Step 7: ABLATION (optional, slower)
  Run Configs C, D, E to measure component contribution:
  ├── C: knowledge only
  ├── D: examples only
  └── E: knowledge + examples (no reasoning/rubric)

Step 8: GENERATE REPORT
  ├── Overall delta (skill vs base)
  ├── Per-dimension scores
  ├── Per-topic breakdown
  ├── Retrieval quality metrics
  ├── Grounding/hallucination report
  ├── Component contribution (if ablation ran)
  ├── Failed test cases with explanations
  └── Recommendations for improvement
```

---

## Comparison: Finetune Evaluation vs Skill Evaluation

| Aspect | Finetune (current) | Skill (proposed) |
|--------|-------------------|------------------|
| **What's compared** | Finetuned model responses only | Base model vs Skilled model (delta) |
| **Grader has source access** | No — grader is blind to docs | Yes — grader verifies against chunks |
| **Can detect hallucinations** | No — can only judge "sounds right" | Yes — checks claims against sources |
| **Measures retrieval quality** | N/A (no retrieval) | Yes — precision, recall, F1 |
| **Component contribution** | N/A (single model) | Yes — ablation shows what helps |
| **Speed** | Slow (must run training first) | Fast (no training, just API calls) |
| **Iteration cost** | High (regenerate data + retrain) | Low (edit skill + re-test) |
| **Confidence in results** | Low (grader unreliable) | Higher (grader is informed) |
| **Verdict criteria** | Mean score > 0.65 | **Delta** > +0.15 vs base model |

### The key insight

Finetune evaluation asks: **"Is the model's output acceptable?"** (absolute judgment, subjective)

Skill evaluation asks: **"Is the model better with the skill than without?"** (comparative, measurable)

The comparative approach is fundamentally more reliable because:
- The same grader judges both → biases cancel out
- The delta measurement is objective → "did it help or not?"
- Source verification is possible → grader is informed, not guessing

---

## Verdict Logic

### Skill evaluation verdict

```
STRONG PASS:  Overall delta > +0.25 AND no topic below base
  → Skill significantly improves performance across all topics

PASS:         Overall delta > +0.15 AND grounding > 0.80
  → Skill helps meaningfully, responses are well-grounded

WEAK PASS:    Overall delta > +0.10 OR grounding > 0.85
  → Skill helps somewhat, but could be improved

NEEDS WORK:   Overall delta > 0 but < +0.10
  → Skill barely helps — check knowledge coverage and example quality

FAIL:         Overall delta <= 0 OR grounding < 0.50
  → Skill doesn't help or actively hurts — investigate why
```

### What to do when evaluation fails

```
Problem: Low delta on accuracy
  → Knowledge chunks don't contain the right information
  → Fix: Upload more/better source documents

Problem: Low delta on depth
  → Synthetic examples are too shallow
  → Fix: Regenerate examples with higher difficulty targets

Problem: Low grounding score
  → Model making claims not in the sources
  → Fix: Strengthen system prompt rules about grounding; add more examples
         that demonstrate proper citation

Problem: Good delta overall but one topic fails
  → That topic has insufficient knowledge or examples
  → Fix: Upload more material for that topic; generate more examples

Problem: High retrieval recall but low precision
  → Retrieving too many irrelevant chunks (noisy context)
  → Fix: Tune retrieval top-k; improve chunk quality scoring

Problem: Low retrieval recall
  → Missing relevant chunks for certain question types
  → Fix: Improve embeddings; add keyword-based fallback search
```

---

## What the User Experiences

### During evaluation (2-3 minutes)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Testing your skill...                                               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  ✓ Generated 30 test questions                                      │
│  ✓ Running base model (no skill)...              30/30              │
│  ◉ Running skilled model...                      18/30              │
│  ○ Grading responses...                                             │
│  ○ Checking factual grounding...                                    │
│  ○ Generating report...                                             │
│                                                                      │
│  Estimated time remaining: ~1 minute                                │
└──────────────────────────────────────────────────────────────────────┘
```

### Results view

```
┌──────────────────────────────────────────────────────────────────────┐
│  Evaluation Results                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  ✓ STRONG PASS — Skill improves performance by +35%                 │
│                                                                      │
│            Base Model    With Skill                                  │
│  Accuracy  ██████░░░░░   ████████████  0.58 → 0.87  (+50%)         │
│  Depth     █████░░░░░░   ████████████  0.52 → 0.83  (+60%)         │
│  Grounding █░░░░░░░░░░   █████████████ 0.12 → 0.91  (+658%)        │
│  Complete  ██████░░░░░   ███████████░  0.61 → 0.78  (+28%)         │
│  Quality   ██████░░░░░   ████████████  0.65 → 0.88  (+35%)         │
│                                                                      │
│  26/30 tests passed · 2 weak · 2 failed                             │
│                                                                      │
│  [View All Test Results]  [View Failed Tests]  [Re-test]            │
│                                                                      │
│  ──── Failed Tests ────────────────────────────────────────────     │
│                                                                      │
│  ✗ Test #14: "Cross-reference between Italian Game and Ruy Lopez"   │
│    Issue: Only retrieved Italian Game chunks, missed Ruy Lopez       │
│    Base: 0.45 → Skill: 0.52 (delta only +0.07)                     │
│    Fix: Add more cross-topic linking in knowledge index             │
│                                                                      │
│  ✗ Test #22: "What does Stockfish evaluate the King's Gambit at?"   │
│    Issue: Model fabricated an evaluation number despite instructions │
│    Base: 0.30 → Skill: 0.35 (grounding: 0.40)                      │
│    Fix: Add explicit hallucination-bait example to synthetic data   │
│                                                                      │
│  ──── Recommendations ────────────────────────────────────────      │
│                                                                      │
│  1. Add Grünfeld Defense material (only 12 chunks, lowest coverage) │
│  2. Regenerate cross-topic examples (comparison questions weak)     │
│  3. Add 2-3 "I don't know" examples for hallucination prevention    │
│                                                                      │
│  [Apply Recommendations]  [Export Report]  [Deploy Anyway]          │
└──────────────────────────────────────────────────────────────────────┘
```

### Drill-down into a single test

```
┌──────────────────────────────────────────────────────────────────────┐
│  Test #3: Italian Game — Intermediate                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  Question: "What should Black play after 5.d4 in the Italian Game?" │
│                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────────┐               │
│  │ BASE MODEL          │  │ WITH SKILL               │               │
│  │                     │  │                          │               │
│  │ "After 5.d4 in the  │  │ "This is one of the most│               │
│  │ Italian Game, Black │  │ common problems for club │               │
│  │ should consider     │  │ players in the Italian   │               │
│  │ playing 5...exd4.   │  │ Game.                    │               │
│  │ This captures in    │  │                          │               │
│  │ the center and      │  │ The position arises after│               │
│  │ opens up lines.     │  │ 1.e4 e5 2.Nf3 Nc6 3.Bc4│               │
│  │ After 6.cxd4, Black│  │ Bc5 4.c3 Nf6 5.d4.     │               │
│  │ can play Bb4+ which│  │                          │               │
│  │ is a good move.     │  │ The mistake most club    │               │
│  │ Castle soon and look│  │ players make: Passively  │               │
│  │ for ...d5."         │  │ retreating the bishop... │               │
│  │                     │  │                          │               │
│  │ Score: 0.61         │  │ [Source: MCO 15th Ed.,   │               │
│  │                     │  │  pp. 87-89]              │               │
│  │ ⚠ No citations     │  │                          │               │
│  │ ⚠ Vague advice     │  │ Score: 0.91              │               │
│  │ ⚠ No mistake warn  │  │                          │               │
│  └─────────────────────┘  │ ✓ Cites source          │               │
│                            │ ✓ Warns about mistakes  │               │
│                            │ ✓ Gives memorable rule  │               │
│                            └─────────────────────────┘               │
│                                                                      │
│  Knowledge chunks retrieved:                                         │
│  ✓ mco15:chunk-042 "Italian Game: Giuoco Piano — Main Line"        │
│  ✓ mco15:chunk-043 "Italian Game: Common Errors"                    │
│                                                                      │
│  Synthetic examples retrieved:                                       │
│  ✓ conv-001 "Italian Game mistake correction" (score: 0.91)        │
│  ✓ conv-018 "Italian Game: Evans vs Giuoco" (score: 0.84)          │
│                                                                      │
│  Grounding check:                                                    │
│  ✓ "5...exd4 6.cxd4 Bb4+ is the main line" — verified in chunk-042│
│  ✓ "8...d5 equalizes" — verified in chunk-042                       │
│  ✓ Citation [MCO 15th Ed., pp. 87-89] — matches chunk metadata     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Continuous Evaluation (After Deployment)

Once deployed, the skill can be evaluated continuously:

### Runtime quality monitoring

```
Every N-th API call (configurable, e.g., every 10th):
  1. Log the query + response + retrieved chunks/examples
  2. Async grading: score the response against knowledge chunks
  3. Flag low-grounding responses for review
  4. Track metrics over time

Dashboard:
  ┌────────────────────────────────────────────┐
  │ Last 7 days    Avg score: 0.83   Calls: 847│
  │                                             │
  │ Grounding  ████████████████████░  0.89      │
  │ Accuracy   ██████████████████░░  0.85      │
  │ Quality    ████████████████████░  0.88      │
  │                                             │
  │ Flagged responses: 12 (1.4%)               │
  │ Topics with declining scores: London System │
  └────────────────────────────────────────────┘
```

### User feedback loop

```
User rates response 👍 or 👎
  → 👍 responses can be added to synthetic dataset (grows the skill)
  → 👎 responses flagged for review
  → If a pattern of 👎 emerges for a topic → recommend more knowledge/examples
```

---

## Sample Count vs Skill Performance

Since skills use RAG (retrieval at runtime), the number of synthetic conversations affects performance differently than in finetune:

```
FINETUNE:  More data → more training signal → better weights (linear-ish)
SKILLS:    More data → better topic coverage → better retrieval matches (diminishing returns)
```

**Why diminishing returns**: At runtime, only the top 2-3 most similar conversations are retrieved (context window budget). Whether you have 200 or 2000 total, the model still sees 2-3. More data only helps if it fills a coverage gap.

### What the ablation test reveals about sample count

The ablation test (Evaluation 3) can diagnose whether more samples would help:

```
Scenario A: Examples contribute +0.18 → good, examples are working
  If per-topic breakdown is uneven:
    Italian Game: +0.25, King's Indian: +0.04
    → King's Indian needs more examples, Italian Game is covered

Scenario B: Examples contribute +0.03 → barely helps
  Two possible causes:
    1. Examples are redundant (too similar to each other) → need more DIVERSITY, not more volume
    2. Domain is fact-heavy, not behavior-heavy → focus on knowledge chunks instead

Scenario C: Adding examples from 100 → 300 improves delta by +0.05
  But adding from 300 → 500 improves delta by only +0.01
    → You've hit the coverage ceiling, stop generating
```

### Practical guidance

| Situation | Recommendation |
|-----------|---------------|
| New skill, 0 examples | Generate 100-200 first, run evaluation |
| Score > 0.8 on most topics | Sufficient — focus on low-scoring topics only |
| One topic scores < 0.6 | Generate 10-20 more for that specific topic |
| All topics score well but overall delta is low | Problem is likely knowledge chunks, not examples |
| 500+ examples, no improvement | Stop generating — improve knowledge index or system prompt |

---

## Important: Data Quality Filtering Differs by Approach

A key distinction between the three training/augmentation approaches:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  APPROACH        │ FILTERING RULE            │ WHY                      │
├──────────────────┼───────────────────────────┼──────────────────────────┤
│                  │                           │                          │
│  SFT (Supervised │ MUST discard low-quality  │ Model COPIES the output  │
│  Fine-Tuning)    │ outputs (score < 0.7)     │ directly — bad outputs   │
│                  │                           │ teach bad behavior       │
│                  │                           │                          │
│  RFT (Reinforce- │ Keep ALL inputs — grader  │ Output field is EMPTY —  │
│  ment Fine-      │ quality matters more than │ model generates its own  │
│  Tuning)         │ input filtering           │ responses during         │
│                  │                           │ training, grader gives   │
│                  │                           │ the reward signal        │
│                  │                           │                          │
│  Skills          │ Keep ALL conversations —  │ Scores are RETRIEVAL     │
│  (this approach) │ use scores as retrieval   │ ranking signals, not     │
│                  │ ranking signal            │ discard thresholds.      │
│                  │                           │ Model only sees top-     │
│                  │                           │ ranked examples at       │
│                  │                           │ inference time.          │
│                  │                           │                          │
│                  │ Low-score examples can     │ "Avoid responses like    │
│                  │ serve as negative examples│ this" is useful context  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key insight for Skills**: Since the model doesn't train on the data (it retrieves it at runtime), there's no risk of "learning" bad patterns from low-quality examples. The retrieval system naturally surfaces the best examples first. Keeping everything maximizes topic coverage.

---

## Summary: How Evaluation Works

| Question | Answer |
|----------|--------|
| How do we know the skill helps? | **Delta test**: same questions, base model vs skilled model, measure the difference |
| How do we verify accuracy? | **Grounding check**: grader verifies claims against actual knowledge chunks (impossible with finetune) |
| How do we know which components help? | **Ablation test**: turn components on/off, measure each contribution |
| How do we know retrieval works? | **Retrieval evaluation**: precision, recall, F1 against known-answer questions |
| How do we handle edge cases? | **Boundary tests**: out-of-scope, ambiguity, contradiction test cases |
| What does the user see? | **Side-by-side comparison**: base vs skill per question, overall delta, failed tests with fixes |
| What's the pass criteria? | **Delta > +0.15** AND **grounding > 0.80** (skill helps AND is factually reliable) |
| Can we evaluate after deployment? | **Yes**: runtime monitoring, async grading, user feedback loop |

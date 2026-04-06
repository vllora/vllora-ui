# RFT / GRPO Training — How It Actually Works

How the vLLora platform trains models using GRPO (Group Relative Policy Optimization). This is NOT supervised fine-tuning (SFT) — the concepts are fundamentally different.

## SFT vs RFT in One Sentence

```
SFT:   "Here's the correct answer. Learn to copy it."
GRPO:  "Try 8 answers. I'll tell you which ones are better."
```

| | SFT | RFT / GRPO |
|---|---|---|
| Training data | Prompt + correct response | Prompt only (no response) |
| How model learns | Imitate the example response | Generate own responses, get scored, reinforce winners |
| Loss function | Cross-entropy (match the example) | Clipped policy gradient (maximize reward) |
| Epochs | 1-3 (more = memorization risk) | 5-15+ (fresh responses each epoch, no memorization) |
| Grader | Not needed | **THE training objective** — whatever it rewards, the model learns |
| Risk | Overfitting to examples | Reward hacking (exploiting grader weaknesses) |

---

## Your Inputs

```
┌─────────────────────────────────────────────────────┐
│  100 records (training.jsonl)                       │
│  Each record = system + user message (NO assistant) │
│                                                     │
│  Record #1: {"system": "You are a contract expert", │
│              "user": "What are the payment terms     │
│                       in this NDA?"}                 │
│                                                     │
│  Record #2: {"system": "You are a contract expert", │
│              "user": "Explain the liability cap      │
│                       in section 4.2"}              │
│  ... (100 total)                                    │
│                                                     │
│  grader.js = your scoring function (0.0 - 1.0)     │
│  Base model = Qwen 3.5 4B (untrained)              │
└─────────────────────────────────────────────────────┘
```

---

## What is Standard Deviation (std)?

Standard deviation measures how **spread out** numbers are from their average. This is critical for GRPO because the algorithm divides by std — if std is tiny, the learning signal vanishes.

### The Formula (Step by Step)

```
EXAMPLE: 8 grader scores from one prompt's G=8 completions

  Scores: [0.2, 0.4, 0.5, 0.7, 0.7, 0.8, 0.9, 0.9]

  STEP 1: Mean (average)
    μ = (0.2 + 0.4 + 0.5 + 0.7 + 0.7 + 0.8 + 0.9 + 0.9) / 8
    μ = 5.1 / 8
    μ = 0.6375

  STEP 2: Squared distance from mean for each score
    (0.2 - 0.6375)² = 0.1914
    (0.4 - 0.6375)² = 0.0564
    (0.5 - 0.6375)² = 0.0189
    (0.7 - 0.6375)² = 0.0039
    (0.7 - 0.6375)² = 0.0039
    (0.8 - 0.6375)² = 0.0264
    (0.9 - 0.6375)² = 0.0689
    (0.9 - 0.6375)² = 0.0689

  STEP 3: Average those squared distances (= variance)
    variance = (0.1914 + 0.0564 + 0.0189 + 0.0039
              + 0.0039 + 0.0264 + 0.0689 + 0.0689) / 8
    variance = 0.0548

  STEP 4: Square root of variance (= standard deviation)
    σ = √0.0548
    σ = 0.234
```

### What std MEANS Intuitively

```
LOW std (0.05):   All scores clustered tightly around the mean
                  [0.90, 0.91, 0.89, 0.92, 0.88, 0.91, 0.90, 0.89]
                  → "All responses are about the same quality"
                  → GRPO can't tell which is better → WEAK learning signal

HIGH std (0.30):  Scores spread out widely
                  [0.2, 0.4, 0.5, 0.7, 0.7, 0.8, 0.9, 0.9]
                  → "Clear winners and losers"
                  → GRPO knows exactly what to reinforce → STRONG learning signal
```

### Why std Matters for GRPO

The advantage formula divides by std:

```
  advantage = (score - mean) / std
```

**When std is tiny (0.05)** — weak signal, model barely learns:

```
  Score 0.92: advantage = (0.92 - 0.90) / 0.05 = +0.4   (small)
  Score 0.88: advantage = (0.88 - 0.90) / 0.05 = -0.4   (small)
```

**When std is healthy (0.30)** — strong signal, model learns clearly:

```
  Score 0.90: advantage = (0.90 - 0.64) / 0.30 = +0.87  (strong positive)
  Score 0.20: advantage = (0.20 - 0.64) / 0.30 = -1.47  (strong negative)
```

**When std is zero** — no signal at all:

```
  All 8 scores = 0.85 → mean = 0.85, std = 0.0
  advantage = (0.85 - 0.85) / 0.0 = 0/0 → undefined → set to 0
  → Zero gradient for this prompt. The model learns NOTHING.
  → This is what frac_reward_zero_std measures.
```

---

## What Happens During ONE Training Step

The trainer picks **Record #1** for this step:

```
STEP 1: GENERATE G=8 COMPLETIONS
═══════════════════════════════════════════════════════

Prompt: "You are a contract expert" + "What are the payment terms in this NDA?"

The model generates 8 DIFFERENT responses (sampling with temperature):

  Response A: "The payment terms require net-30 billing         → grader: 0.82
               with 2% late fee per month..."

  Response B: "Payment is due upon receipt. The contract         → grader: 0.71
               specifies quarterly installments..."

  Response C: "The NDA doesn't typically have payment terms.     → grader: 0.15
               NDAs are about confidentiality..."

  Response D: "Section 3.2 outlines: monthly payments of $X,    → grader: 0.90
               with grace period of 15 days, late penalty
               of 1.5%, and right to suspend services..."

  Response E: "Payment terms. Payment terms. Payment."          → grader: 0.02

  Response F: "The payment obligations include quarterly         → grader: 0.68
               billing cycles with auto-renewal..."

  Response G: "Per the agreement, Consultant receives            → grader: 0.85
               compensation within 30 days of invoice..."

  Response H: "Idk lol"                                         → grader: 0.01


STEP 2: COMPUTE ADVANTAGES (the "Group Relative" part)
═══════════════════════════════════════════════════════

Given G scores for one prompt: r₁, r₂, ..., r_G

  Scores:  r = [0.82, 0.71, 0.15, 0.90, 0.02, 0.68, 0.85, 0.01]

  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  Mean (μ) = sum of all scores / G                            │
  │                                                              │
  │           = (0.82 + 0.71 + 0.15 + 0.90 + 0.02 + 0.68       │
  │              + 0.85 + 0.01) / 8                              │
  │           = 4.14 / 8                                         │
  │           = 0.518                                            │
  │                                                              │
  │                                                              │
  │  Std (σ) = sqrt( sum of (rᵢ - μ)² / G )                     │
  │                                                              │
  │          = sqrt( (0.82-0.518)² + (0.71-0.518)²              │
  │                + (0.15-0.518)² + (0.90-0.518)²              │
  │                + (0.02-0.518)² + (0.68-0.518)²              │
  │                + (0.85-0.518)² + (0.01-0.518)² ) / 8 )      │
  │                                                              │
  │          = sqrt( 0.0912 + 0.0368 + 0.1354 + 0.1459          │
  │                + 0.2480 + 0.0262 + 0.1102 + 0.2580 ) / 8 )  │
  │                                                              │
  │          = sqrt( 1.0518 / 8 )                                │
  │          = sqrt( 0.1315 )                                    │
  │          = 0.363                                             │
  │                                                              │
  │                                                              │
  │  Advantage (Aᵢ) = (rᵢ - μ) / σ                              │
  │                                                              │
  │    Positive advantage → response was BETTER than average     │
  │    Negative advantage → response was WORSE than average      │
  │    Magnitude = how much better/worse (in standard deviations)│
  │                                                              │
  │  ⚠️ If σ = 0 (all scores identical):                         │
  │     Aᵢ = 0 for ALL responses → ZERO GRADIENT → no learning  │
  │     This is the #1 failure mode in GRPO.                     │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

Applying the formula:

  Response A: A = (0.82 - 0.518) / 0.363 = +0.83  ← REINFORCE (above average)
  Response B: A = (0.71 - 0.518) / 0.363 = +0.53  ← REINFORCE (above average)
  Response C: A = (0.15 - 0.518) / 0.363 = -1.01  ← PENALIZE  (below average)
  Response D: A = (0.90 - 0.518) / 0.363 = +1.05  ← REINFORCE STRONGLY
  Response E: A = (0.02 - 0.518) / 0.363 = -1.37  ← PENALIZE STRONGLY
  Response F: A = (0.68 - 0.518) / 0.363 = +0.45  ← REINFORCE (slightly)
  Response G: A = (0.85 - 0.518) / 0.363 = +0.91  ← REINFORCE
  Response H: A = (0.01 - 0.518) / 0.363 = -1.40  ← PENALIZE STRONGLY


STEP 3: UPDATE MODEL WEIGHTS
═══════════════════════════════════════════════════════

Make the model MORE LIKELY to produce responses like D, G, A (high-scoring)
Make the model LESS LIKELY to produce responses like E, H, C (low-scoring)

Uses clipped policy gradient — same math as PPO but no critic model needed.
The clipping (epsilon) limits how much the model can change in one step.
```

---

## Epochs: Engraving the Learning Deeper

Think of epochs like **carving into stone**. Each pass over the same prompts engraves the learning deeper — the model's "muscle memory" for good responses gets stronger and more permanent.

```
EPOCH 1 — FIRST SKETCH (light carving):
═══════════════════════════════════════════════════════

Record  #1  → generate 8 responses → score → compute advantages → update weights
Record  #2  → generate 8 responses → score → compute advantages → update weights
Record  #3  → generate 8 responses → score → compute advantages → update weights
...
Record #100 → generate 8 responses → score → compute advantages → update weights

Total: 100 prompts × 8 completions = 800 responses generated and scored
       100 weight updates (steps)

The model has a ROUGH sense of what good responses look like.
Like a first pencil sketch — the shape is there but it's faint.


EPOCH 2 — DEEPER PASS (the lines get firmer):
═══════════════════════════════════════════════════════

SAME 100 prompts, but the model generates FRESH responses
(because the model changed, it produces different text now)

Record  #1  → 8 NEW responses (different from epoch 1!) → score → update
Record  #2  → 8 NEW responses → score → update
...

The responses are BETTER on average because the model learned from epoch 1.
Now it reinforces what it learned — the good patterns get carved deeper.


EPOCH 5 — SOLID CARVING:
═══════════════════════════════════════════════════════

The model now reliably produces good responses. The neural pathways
for "how to answer contract questions well" are deeply engraved.


EPOCH 10 — POLISHED:
═══════════════════════════════════════════════════════

Diminishing returns. The stone is deeply carved. More passes
add less and less. Signal fading as most responses already score high
(frac_reward_zero_std rising → fewer prompts provide gradient).

This is when you stop.
```

**Why RFT can do many epochs without overfitting**: In SFT, more epochs means the model memorizes the exact example responses (like copying someone else's carving). In RFT, the model generates its own fresh responses each epoch — it's carving its OWN patterns deeper, discovering new strategies each pass. There's no fixed output to memorize. As the OpenAI RFT analysis puts it: "the model explores many possible answers, observes a numeric reward for each, and gradually shifts its behaviour" ([Interconnects.ai](https://www.interconnects.ai/p/openais-reinforcement-finetuning)).

**How many epochs?** Nathan Lambert's analysis of OpenAI's RFT states: "RL training gets its name by doing **hundreds or thousands of epochs** over the same few data points to give the model time to learn new behaviors" ([Interconnects.ai](https://www.interconnects.ai/p/openais-reinforcement-finetuning)). This is for very small datasets (dozens of examples). For our typical 100-200 record datasets, 5-15 epochs is practical. OpenAI controls this via `compute_multiplier` rather than explicit epoch count.

| Dataset size | Recommended epochs | Rationale |
|---|---|---|
| < 50 records | 8 | Fewer prompts need more passes to build signal |
| 50-200 records | 5 | Our typical range — balanced signal and compute |
| 200-500 records | 3 | More data per epoch provides richer signal |
| > 500 records | 2 | Large datasets converge faster — avoid diminishing returns |

**But there's a natural limit**: As the model gets better, more prompts produce all-high-scoring responses (all 8 completions score 0.9+). When that happens, std ≈ 0, advantages ≈ 0, and those prompts contribute zero gradient. The learning signal **fades naturally** as the model masters the training prompts. That's when you stop — not because of overfitting, but because the stone is as deep as this grader + data can carve it.

---

## Headroom: Why Base Model Score Matters

**Headroom** = 1.0 - base_model_avg_score. It measures how much room GRPO has to create meaningful gradient signal.

```
EXAMPLE: Base model scores 0.82 avg on eval (K=1)

  During training (K=8), all 8 completions tend to score similarly:
    [0.79, 0.83, 0.81, 0.84, 0.80, 0.82, 0.83, 0.81]
    std = 0.016 → advantages ≈ 0 → zero gradient → no learning

  Headroom = 1.0 - 0.82 = 0.18 → INSUFFICIENT

EXAMPLE: Base model scores 0.35 avg on eval (K=1)

  During training (K=8), completions spread across quality levels:
    [0.1, 0.2, 0.3, 0.5, 0.6, 0.7, 0.8, 0.4]
    std = 0.22 → strong advantages → meaningful gradient → learning!

  Headroom = 1.0 - 0.35 = 0.65 → GOOD
```

| Headroom | Base avg | Signal | Action |
|---|---|---|---|
| > 0.75 | < 0.25 | Strong but model is very weak | Normal — GRPO is designed for this (DeepSeek R1-Zero: 15.6% → 71%) |
| **0.25-0.75** | **0.25-0.75** | **Optimal range** | Proceed with training |
| < 0.25 | > 0.75 | Weak — model already too good | Eval a smaller model (e.g., 0.8B) for better headroom |

### Eval-Driven Model Selection

The pipeline evaluates models to find the best headroom:

```
1. Eval Qwen3.5-4B (default)
   ├── avg score 0.25-0.75 → Good headroom → Train on 4B
   └── avg score > 0.75   → Too easy for 4B → Continue to step 2

2. Eval Qwen3.5-0.8B
   ├── avg score 0.25-0.75 → Good headroom → Train on 0.8B
   └── avg score > 0.75   → Task is trivially easy → Review grader/data
```

This ensures GRPO always has enough room between "bad" and "good" responses to generate meaningful gradient signal.

---

## Key Parameters Explained

### G (response_candidates_count) vs Epochs

These are completely different things:

```
G = response_candidates_count = 8
    "How many responses to generate PER PROMPT PER STEP"

epochs = 5-10
    "How many times to loop through ALL 100 prompts"
```

Using the stone carving analogy:
- **Epochs** = how many passes over the stone → **carves deeper** (more emphasis, stronger learning)
- **G** = how many chisel marks per stroke → **makes each stroke more precise** (cleaner direction)

```
Epochs = DEPTH of carving      G = PRECISION of each stroke
(how permanent the learning)   (how clear the learning signal)

More epochs:                   More G:
  Epoch 1: light sketch          G=2:  "maybe go left?" (noisy)
  Epoch 5: solid carving          G=8:  "go 15° left" (clear)
  Epoch 10: deeply engraved       G=64: "go 14.7° left" (very precise)
```

| | `response_candidates_count` (G) | `epochs` |
|---|---|---|
| **Analogy** | Chisel marks per stroke (precision) | Passes over the stone (depth) |
| **What** | Responses per prompt per step | Passes through all prompts |
| **Controls** | Quality/precision of each learning step | Total amount of learning |
| **Higher =** | More stable advantage estimates | Deeper engraved patterns |
| **Cost** | More tokens per step (G × max_tokens) | More steps total |
| **Typical** | 8 (minimum), 16-64 (research) | 5-15 for our dataset sizes |

**Total compute** for 100 records, G=8, 10 epochs:
```
100 × 8 × 10 = 8,000 responses generated and scored
100 × 10 = 1,000 weight update steps
```

### Why G Matters: Precision of the Learning Signal

```
G=2 (contrastive — simpler signal):
  Response A: 0.7    Response B: 0.8
  → "B is better than A" — binary comparison (like DPO)
  → Recent research shows this retains ~98% of G=16 performance¹
  → But: advantages collapse to +1/-1 (no gradient magnitude info)

G=8 (richer signal — standard practice):
  Responses: 0.2, 0.4, 0.5, 0.7, 0.7, 0.8, 0.9, 0.9
  → Full spectrum: model sees what separates 0.9 from 0.2
  → Advantages have meaningful magnitudes (+1.05 vs +0.45)
  → More information per step about WHAT makes responses better/worse

G=64 (very precise — research-grade):
  64 responses per prompt → near-perfect ranking
  → The model sees every shade of quality
  → But: 64 × 512 = 32,768 tokens per prompt per step! (expensive)
```

> ¹ **Note on G=2**: The paper "It Takes Two: Your GRPO Is Secretly DPO" ([arXiv:2510.00977](https://arxiv.org/abs/2510.00977)) found that G=2 GRPO retains 98.1% of G=16 performance while using only 12.5% of rollouts. With G=2, GRPO reduces to an online contrastive objective (equivalent to DPO). So G=2 is not "broken" — it just provides a different kind of signal (binary better/worse rather than graded ranking). The conventional wisdom that "small G is too noisy" is being challenged by recent research.

### The Tradeoff

| | Low G (2-4) | Standard G (8-16) | High G (64) |
|---|---|---|---|
| **Signal type** | Binary contrastive (like DPO) | Graded ranking | Very precise ranking |
| **Cost per step** | Cheap | 4-8× more tokens | 32× more tokens |
| **Epochs needed** | Similar (signal is different, not worse)¹ | Standard | Fewer |
| **Total cost** | Cheapest | Balanced | Expensive but fast |
| **Best for** | Budget-constrained, simple tasks | Most use cases | Research, complex tasks |

### Published G Values (with sources)

| Paper / System | G | Source |
|---|---|---|
| **DeepSeekMath** | **64** | "For each question, we sample 64 outputs" — [arXiv:2402.03300](https://arxiv.org/abs/2402.03300), §4.2 |
| **DAPO** | **16** | "we sample 16 responses for each prompt" — [arXiv:2503.14476](https://arxiv.org/abs/2503.14476), experimental setup |
| **Dr. GRPO** | **8** | `--num_samples 8` in training command — [github.com/sail-sg/understand-r1-zero](https://github.com/sail-sg/understand-r1-zero) |
| **TRL default** | **8** | `num_generations: int = field(default=8)` — [trl/trainer/grpo_config.py](https://github.com/huggingface/trl/blob/main/trl/trainer/grpo_config.py) |
| **"It Takes Two"** | **2** (viable) | "2-GRPO retains 98.1% of 16-GRPO performance" — [arXiv:2510.00977](https://arxiv.org/abs/2510.00977) |

**Our default: G=8** — matches TRL and Dr. GRPO. Safe, well-tested, and cost-effective. Previously G=16, changed to G=8 because EBPO (arXiv:2602.05165) shows K=16 can be worse due to diminishing returns — the extra 2x cost provides marginal signal improvement.

### Other Parameters (Quick Reference)

| Parameter | What | Our Default | API Field |
|---|---|---|---|
| `learning_rate` | How big each weight update is | 1e-6 | `training_config.learning_rate` — DeepSeekMath (arXiv:2402.03300), DAPO (arXiv:2503.14476) |
| `epochs` | Passes through all prompts | 8/5/3/2 | `training_config.epochs` — reduced maximums by dataset size (<50/50-200/200-500/>500 records) |
| `batch_size` | Prompts per mini-batch | 5 | `training_config.batch_size` |
| `gradient_accumulation_steps` | Mini-batches before weight update | 5 | `training_config.gradient_accumulation_steps` |
| `lora_rank` | Width of LoRA adapter matrices | 8 | `training_config.lora_rank` |
| `max_output_tokens` | Max tokens per generated response | 512 | `inference_parameters.max_output_tokens` |
| `response_candidates_count` | G — responses per prompt | 8 | `inference_parameters.response_candidates_count` |
| `warmup_steps` | Steps of gradually increasing LR | 20-50 | `training_config.warmup_steps` |
| `beta` (KL coefficient) | Penalty for diverging from base model | 0.01 | Light KL penalty (arXiv:2509.07430) stabilizes training. Changed from 0.0. |
| `scale_rewards` | Reward normalization mode | "none" | Dr. GRPO + Unsloth recommendation. Gateway expects string, not boolean. |
| `loss_type` | GRPO loss variant | dr_grpo | No length bias (Dr. GRPO, arXiv:2503.20783) |
| `mask_truncated_completions` | Mask truncated completions in loss | false | Unsloth recommendation |
| `importance_sampling_level` | Importance sampling granularity | sequence | GSPO stability — sequence-level importance sampling |

All set via `finetune.py create-training` — defaults are in the script, override with `--config` and `--inference-params`.

---

### max_output_tokens — How Long Each Response Can Be

The maximum number of tokens the model can generate per response. This is critical in GRPO because it gets **multiplied by G** — every prompt generates G responses, each up to max_output_tokens long.

```
COST PER PROMPT PER STEP:

  max_output_tokens=512, G=8:
    8 responses × 512 tokens = 4,096 tokens generated
    + prompt tokens (~200) = ~4,300 total

  max_output_tokens=2048, G=8:
    8 responses × 2048 tokens = 16,384 tokens generated
    + prompt tokens (~200) = ~16,600 total  ← 4× more expensive!
```

**What happens when max_output_tokens is too LOW:**

```
The model's natural answer needs 800 tokens, but limit is 512.
Response gets TRUNCATED mid-sentence:

  "The payment terms in Section 3.2 require monthly installments
   of $5,000 due on the first business day. Late payments incur
   a 1.5% penalty per month. The grace period is 15 da—" [CUT OFF]

The grader scores an INCOMPLETE answer → noisy/wrong reward signal.
The model gets penalized for being thorough (bad!).

This shows up as: completions/clipped_ratio → high (>0.5)
```

**What happens when max_output_tokens is too HIGH:**

```
The model CAN generate up to 2048 tokens, but most answers need 300.
No truncation (good!) but:

  - Cost per step is 4× higher (paying for unused token budget)
  - Cloud infrastructure may OOM with G=8 × 2048 = 16K tokens per prompt
  - Training is slower (more tokens to process per step)
  - Model may learn to be verbose if grader doesn't penalize length
```

| max_output_tokens | When to use |
|---|---|
| 256 | Short answers: yes/no, classifications, single-sentence |
| **512** (default) | Most tasks: explanations, summaries, analysis |
| 1024 | Detailed reasoning: multi-step analysis, long-form writing |
| 2048 | Complex tasks only — watch for cost explosion and OOM |

**The key metric to watch:** `completions/clipped_ratio` during training.
- Below 0.1 (10%) → max_output_tokens is fine
- 0.1 - 0.5 → consider increasing
- Above 0.5 → **most responses are truncated** — increase max_output_tokens or the training signal is garbage

> **⚠️ WARNING**: Setting max_output_tokens above 512 may cause training job failures on cloud infrastructure (OOM). Start with 512 and only increase if clipped_ratio is too high.

> **Auto-adjust**: The `readiness-check` command automatically adjusts `max_output_tokens` based on ground truth token lengths: P95 + 30% headroom. It adjusts **upward** when GT lengths indicate truncation risk, and **downward** when excessive padding wastes compute or causes kl=nan issues from empty token sequences.

---

### lora_rank — How Much the Model Can Change

Instead of updating all 4 billion parameters (expensive, needs huge GPU memory), LoRA attaches small adapter matrices to each layer and only updates those.

```
Original weight matrix: [4096 × 4096] = 16M parameters (FROZEN — not updated)

LoRA adapter (the part that gets trained):
  Matrix A: [4096 × rank]  ×  Matrix B: [rank × 4096]

  rank=4:   4096×4  + 4×4096  =  32,768 trainable params  (0.2% of original)
  rank=8:   4096×8  + 8×4096  =  65,536 trainable params  (0.4% of original)
  rank=16:  4096×16 + 16×4096 = 131,072 trainable params  (0.8% of original)
```

**Higher rank = more capacity** to learn new behaviors, but slower and more memory.

| lora_rank | Capacity | When to use |
|---|---|---|
| 4 | Low — narrow tasks | "Answer yes/no to compliance questions" |
| **8** (default) | Medium — most tasks | "Translate contracts to plain English" |
| 16 | High — complex reasoning | "Analyze financial reports with multi-step reasoning" |

---

### batch_size — How Many Prompts Per Mini-Batch

How many different prompts the model processes in one mini-batch:

```
batch_size = 5, G = 8:

  One mini-batch:
    Prompt #1  → 8 responses → score → compute advantages
    Prompt #2  → 8 responses → score → compute advantages
    Prompt #3  → 8 responses → score → compute advantages
    Prompt #4  → 8 responses → score → compute advantages
    Prompt #5  → 8 responses → score → compute advantages

    = 40 responses generated and scored per mini-batch
```

**Larger batch = more stable gradients** (averaging over more prompts), but needs more GPU memory.

---

### gradient_accumulation_steps — Simulating Bigger Batches on Limited Memory

This is a memory-saving trick. Instead of processing 25 prompts at once (needs lots of GPU memory), process 5 at a time and **accumulate the gradients** before updating:

```
WITHOUT accumulation (batch_size=25, needs lots of memory):
  Process 25 prompts at once → update weights

WITH accumulation (batch_size=5, accumulation=5, SAME learning effect):
  Mini-batch 1: Process 5 prompts → compute gradients → SAVE (don't update yet)
  Mini-batch 2: Process 5 prompts → compute gradients → ADD to saved
  Mini-batch 3: Process 5 prompts → compute gradients → ADD to saved
  Mini-batch 4: Process 5 prompts → compute gradients → ADD to saved
  Mini-batch 5: Process 5 prompts → compute gradients → ADD to saved
  → NOW update weights using accumulated gradients from all 25 prompts

Same result as batch_size=25, but only 5 prompts in memory at a time!
```

**Effective batch size** = batch_size × gradient_accumulation_steps = 5 × 5 = **25 prompts per weight update**

---

### How All Parameters Fit Together

```
OUR DEFAULTS:
  records:                       100 prompts
  epochs:                        8
  batch_size:                    5
  gradient_accumulation_steps:   5
  response_candidates_count (G): 8
  max_output_tokens:             512
  lora_rank:                     8
  learning_rate:                 1e-6

DERIVED:
  Effective batch   = 5 × 5 = 25 prompts per weight update
  Steps per epoch   = 100 / 25 = 4 weight updates per epoch
  Total steps       = 4 × 8 epochs = 32 weight updates
  Total responses   = 100 × 8 × 8 epochs = 6,400 responses generated and scored
  Tokens generated  = 6,400 × 512 = ~3.3M tokens
```

```
                    ┌─────────────────────────────────┐
                    │        ONE WEIGHT UPDATE         │
                    │                                  │
                    │  ┌── accumulation step 1 ──┐    │
                    │  │ 5 prompts × 8 responses │    │
                    │  │ = 40 responses scored    │    │
                    │  │ → save gradients         │    │
                    │  └─────────────────────────┘    │
                    │  ┌── accumulation step 2 ──┐    │
                    │  │ 5 prompts × 8 responses │    │
                    │  │ → add to saved gradients │    │
                    │  └─────────────────────────┘    │
                    │          ... ×5 total ...        │
                    │                                  │
                    │  Total: 25 prompts × 8 responses │
                    │       = 200 responses scored     │
                    │                                  │
                    │  APPLY accumulated gradients     │
                    │  to LoRA adapter weights         │
                    │  (rank=8 matrices only,          │
                    │   not the full 4B parameters)    │
                    └─────────────────────────────────┘

                    × 4 updates per epoch
                    × 8 epochs
                    = 32 total weight updates
                    = 6,400 total responses generated
```

---

## Why The Grader is EVERYTHING

```
WHAT THE GRADER REWARDS → WHAT THE MODEL LEARNS

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  If grader rewards ACCURACY:                                │
│    → Model learns to be accurate                            │
│                                                             │
│  If grader rewards VERBOSITY (accidentally):                │
│    → Model learns to write longer and longer responses      │
│    → Even if content is garbage (= REWARD HACKING)          │
│                                                             │
│  If grader gives 0.9 to everything:                         │
│    → All 8 responses score ~0.9                             │
│    → Advantages ≈ 0 (no meaningful difference)              │
│    → Model learns NOTHING (= ZERO GRADIENT)                 │
│                                                             │
│  If grader gives only 0 or 1:                               │
│    → Coarse signal, slow learning                           │
│    → Model can't distinguish "almost right" from "garbage"  │
│                                                             │
│  IDEAL: grader gives 0.0, 0.2, 0.5, 0.7, 0.9              │
│    → Rich gradient signal                                   │
│    → Model clearly sees what makes responses better/worse   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Failure Modes (RFT-Specific)

### 1. Zero Gradient (The #1 Killer)

When all G responses score identically:

```
Scores: [0.85, 0.87, 0.84, 0.86, 0.85, 0.88, 0.84, 0.86]
Mean:    0.856
Std:     0.014  ← TINY

Advantages: all ≈ 0 → model learns NOTHING from this prompt
```

**Cause**: Grader too lenient, or base model already too good at this task.
**Fix**: Make grader stricter. Add harder criteria. If >50% of prompts produce near-identical scores, the training will stall.

The metric `frac_reward_zero_std` tracks this. If it exceeds 0.5, half your training data is wasted.

### 2. Reward Hacking

```
Epoch 1:  train_reward = 0.5,  valid_reward = 0.5   ← Both improving
Epoch 3:  train_reward = 0.7,  valid_reward = 0.65  ← Still OK
Epoch 5:  train_reward = 0.9,  valid_reward = 0.65  ← DIVERGING!
Epoch 8:  train_reward = 0.95, valid_reward = 0.60  ← REWARD HACKING

The model learned to exploit the grader, not to genuinely improve.
```

**Concrete examples**:
- Model adds verbose padding with synonyms to boost text similarity scores
- Model learns formatting tricks that score well without substance
- Model produces increasingly long responses if grader correlates with length

**Detection**: Requires a **validation set** (held-out records). Compare train vs validation reward. If they diverge by >20%, the model is hacking.

### 3. KL Divergence (Usually NOT a Problem in GRPO)

```
Common misconception: "KL > 5 means training is broken"

Reality in GRPO:
- beta = 0.01 (light KL penalty, arXiv:2509.07430) — stabilizes training
- The model MUST diverge from base to learn new behaviors
- High KL with improving reward = NORMAL
- High KL with degenerate outputs = PROBLEM

The primary constraint in GRPO is CLIPPING (epsilon), not KL.
beta=0.01 adds light stabilization but is not the main constraint.
Only worry about KL if outputs become repetitive/degenerate.
```

---

## End-to-End Example: 100 Records, G=8, 10 Epochs

```
CONFIG:
  records:                    100
  response_candidates_count:  8
  epochs:                     10
  max_output_tokens:          512
  learning_rate:              1e-6

EPOCH 1 (model = base Qwen 3.5 4B):
  100 prompts × 8 responses = 800 responses generated
  Avg reward: 0.35 (model is mediocre at the task)
  frac_zero_std: 0.10 (most prompts have score diversity — good signal)
  → Model updates 100 times

EPOCH 3 (model improving):
  800 more responses
  Avg reward: 0.55 (clear improvement!)
  frac_zero_std: 0.15 (still good signal)

EPOCH 5 (model getting good):
  Avg reward: 0.72
  frac_zero_std: 0.25 (more prompts producing all-high scores — signal weakening)

EPOCH 8 (approaching diminishing returns):
  Avg reward: 0.81
  frac_zero_std: 0.40 (40% of prompts produce no gradient — signal fading)

EPOCH 10 (plateau):
  Avg reward: 0.83 (barely changed from epoch 8)
  frac_zero_std: 0.55 (majority of prompts now wasted)
  → Good time to stop. The model has learned what it can from this data + grader.

TOTAL COMPUTE:
  100 × 8 × 10 = 8,000 responses generated and scored
  1,000 weight update steps
  ~8,000 × 512 = 4,096,000 tokens generated (plus prompt tokens)
```

---

## How This Maps to Our Pipeline

```
finetune-skill/ STEP          GRPO CONCEPT
═══════════════════════════════════════════════════════

Step 1: Define Objective    → Informs grader design
Step 2: Extract Documents   → Source material for prompts
Step 3: Build Topics        → Categories for balanced prompts
Step 4: Generate Data       → The 100 prompts (system + user only)
Step 5: Write Grader        → THE training objective (0-1 scoring)
Step 6: Verify              → Sanity check before expensive training
Step 7a: Validate grader    → Check score distribution (avoid zero gradient)
Step 7a: Split train/val    → Enable reward hacking detection
Step 7b: Create training    → Launch GRPO on the cloud (G=8, epochs=10)
Step 7c: Monitor            → Watch reward, KL, clipping, frac_zero_std
Step 8: Analyze             → Diagnose: reward hacking? zero signal? plateau?
Step 9: Iterate             → Fix grader/data, re-train
```

---

## Training Metrics Reference

Every metric returned by the training API, explained for GRPO/RFT.

### Reward Metrics

#### `reward` (float, 0.0–1.0)
Average grader score across ALL completions in the step (all prompts × G responses).

- **Healthy**: Gradually increasing over training — model generating better responses
- **Stuck/flat**: Grader may be too lenient (everything scores high) or too harsh (everything scores low). GRPO needs a SPREAD of scores to learn
- **Declining**: Model is getting worse — possible reward hacking (exploiting grader loophole) or training instability

> Ref: DeepSeekMath §3.2 — reward should show "steady upward trend" as training progresses

#### `reward_std` (float, ≥0)
Standard deviation of grader scores across all completions in the step. Measures how much variation exists between the G responses.

- **Healthy (0.05–0.3)**: Good spread — some responses clearly better than others. GRPO has strong gradient signal
- **Too low (<0.05)**: All responses score similarly → advantages ≈ 0 → near-zero gradient → model learns nothing
- **Too high (>0.4)**: Extreme variation — grader may be noisy/inconsistent, or model is very uncertain

> Ref: Dr. GRPO (arXiv:2503.20783) — when std approaches 0, gradient vanishes entirely. This is the core problem they address

#### `frac_reward_zero_std` (float, 0.0–1.0)
Fraction of prompts where ALL G completions received the **exact same score**. For those prompts, advantage = 0 for every response → zero gradient → wasted compute.

- **Healthy (<0.2)**: Most prompts produce varied scores — learning happens on most prompts
- **Warning (0.2–0.5)**: Significant fraction of prompts contribute nothing to learning
- **Critical (>0.5)**: Majority of compute is wasted. Usually means: the task is too easy (all responses perfect) or too hard (all responses fail equally)

> Ref: Dr. GRPO (arXiv:2503.20783) — identifies zero-std groups as the primary cause of GRPO inefficiency. DAPO (arXiv:2503.14476) uses dynamic sampling to filter these groups out entirely

#### `rewards/vllora_reward_fn/mean` and `rewards/vllora_reward_fn/std`
Same as `reward` and `reward_std` but namespaced by the reward function name. If multiple graders are used, each gets its own `rewards/{name}/mean` and `rewards/{name}/std`.

---

### Loss & Optimization Metrics

#### `loss` (float)
The GRPO clipped surrogate objective. **GRPO loss behaves differently from SFT loss:**

- In SFT: loss starts high and decreases (model learns to imitate)
- In GRPO: loss starts near 0 and **rises slightly** as the model diverges from its initial generation distribution

- **Near 0**: Advantages are near zero — either early in training (normal) or grader signal is too weak (problem)
- **0.01–1.0**: Normal GRPO range during active learning
- **Very high (>10)**: Training instability — learning rate too high, or data issues
- **NaN/Inf**: Catastrophic failure — stop training immediately

> Ref: DeepSeekMath — GRPO loss = clipped surrogate objective minus KL penalty. arXiv:2503.06639 — loss = 0 when all advantages are zero

#### `grad_norm` (float, ≥0)
L2 norm of all gradients before clipping (via `max_grad_norm`). Measures how aggressively the model wants to change its weights.

- **Healthy (0.1–10.0)**: Stable updates, within clipping range
- **Spikes (>3× median)**: Momentary instability — one batch had unusual data. Isolated spikes are OK
- **Sustained high (>100)**: Persistent instability — learning rate may be too high
- **NaN/Inf**: Catastrophic — numerical overflow. Often caused by zero-length completions or degenerate batches

> Ref: TRL default `max_grad_norm=1.0` clips gradients to this norm. ms-swift uses `max_grad_norm=0.5` for stability

#### `learning_rate` (float)
Current learning rate at this step. Changes over training due to:
- **Warmup**: LR starts at 0 and linearly ramps to target over `warmup_steps`
- **Schedule**: After warmup, LR may follow a cosine or linear decay schedule
- **Constant**: After warmup, LR stays at the target value (default)

#### `epoch` (float, 0.0–N)
Fraction of the dataset processed so far. `1.0` = every prompt has been seen once. For GRPO, each epoch generates FRESH responses (unlike SFT where the same prompt-response pairs are reused), so multiple epochs don't cause memorization.

#### `global_step` (int)
Current step number. One step = one weight update (after processing `batch_size × gradient_accumulation_steps` prompts).

#### `max_steps` (int)
Total steps planned for training. `max_steps = ceil(records / effective_batch_size) × epochs`.

---

### KL Divergence

#### `kl` (float, ≥0)
KL divergence between the current policy (trained model) and the reference policy (base model). Measures how far the model has drifted from its starting point.

- **0**: Model hasn't changed yet (step 0 or very early training)
- **<1.0**: Minimal drift — model is close to base behavior
- **1.0–5.0**: Moderate drift — model has learned new behaviors while retaining base capabilities
- **>10**: Significant drift — model may be "forgetting" base behaviors
- **>100**: Extreme drift — likely training instability, not meaningful learning

**Important GRPO context**: Our default uses `beta=0.01` (light KL penalty, arXiv:2509.07430) for training stability. Many GRPO implementations use `beta=0` (no KL penalty), relying on clipping (epsilon) as the sole constraint. KL may still drift higher than in PPO-style training, which is expected.

> Ref: DAPO (arXiv:2503.14476) — removes KL penalty entirely for long-CoT models. DeepSeekMath used beta=0.04. We use beta=0.01 (arXiv:2509.07430) as a compromise for stability.

---

### Clipping Metrics (Trust Region)

These measure how the epsilon clipping constraint is working. Clipping prevents the model from changing too much on any single token in a single step.

#### `clip_ratio/region_mean` (float, 0.0–1.0)
Fraction of tokens where the policy ratio was clipped by the trust region bounds (epsilon).

- **Healthy (0.1–0.3)**: Some tokens are being constrained — trust region is actively preventing overly aggressive updates
- **Too low (<0.01)**: Policy is barely changing — updates are too conservative (LR too low or advantages too small)
- **Too high (>0.5)**: Most tokens are hitting the clipping boundary — updates are being heavily constrained. Model wants to change faster than allowed

> Ref: DeepSeekMath uses symmetric epsilon (typically 0.2). DAPO uses asymmetric: epsilon_low=0.2, epsilon_high=0.28

#### `clip_ratio/high_mean` (float, 0.0–1.0)
Fraction of tokens clipped at the UPPER bound (ratio > 1+ε). The model wanted to INCREASE the probability of these tokens more than the trust region allows. Corresponds to tokens in positively-advantaged responses.

#### `clip_ratio/low_mean` (float, 0.0–1.0)
Fraction of tokens clipped at the LOWER bound (ratio < 1-ε). The model wanted to DECREASE the probability of these tokens more than allowed. Corresponds to tokens in negatively-advantaged responses.

#### `clip_ratio/high_max` / `clip_ratio/low_min`
Worst-case clipping values — the single token that was clipped most aggressively in each direction.

---

### Completion Statistics

These measure the generated responses (G completions per prompt).

#### `completions/mean_length` (float, tokens)
Average length of all generated completions in this step. Includes both naturally-terminated and truncated responses.

- **Increasing over training**: Model is learning to give more detailed answers (may be good or bad depending on task)
- **Decreasing**: Model is learning to be more concise
- **Hitting max_output_tokens**: Model wants to write more but is being truncated — check clipped_ratio

#### `completions/max_length` / `completions/min_length` (float, tokens)
Longest and shortest completions in the step.

- **max_length = max_output_tokens**: At least one response hit the token ceiling
- **min_length very low (<10)**: Some completions are trivially short — model may be producing empty/degenerate responses for some prompts

#### `completions/clipped_ratio` (float, 0.0–1.0)
**Critical metric.** Fraction of completions that were truncated at `max_output_tokens`.

- **Healthy (<0.1)**: <10% truncated — most responses finish naturally
- **Warning (0.1–0.5)**: Significant truncation — model's natural response length exceeds the token budget
- **Critical (>0.5)**: Majority of responses are truncated — training signal is severely degraded because the grader scores incomplete responses

**Why this matters for GRPO**: The grader scores TRUNCATED responses (cut off mid-sentence). These scores don't reflect the quality of the model's intended response — they reflect how much of the answer fit in the token budget. This creates noisy/incorrect reward signal.

> Ref: DAPO (arXiv:2503.14476) — uses "overlong filtering" to mask truncated samples from the loss entirely (zero gradient for truncated responses). TRL implements this as dynamic `max_completion_length`

#### `completions/mean_terminated_length` (float, tokens)
Average length of completions that finished naturally (did NOT hit max_output_tokens). This reflects the model's actual desired response length.

#### `completions/max_terminated_length` / `completions/min_terminated_length` (float, tokens)
Longest and shortest naturally-terminated completions. If `max_terminated_length` is close to `max_output_tokens`, the model naturally wants to write near the limit — consider increasing the limit.

---

### Throughput Metrics

#### `num_tokens` (float)
Total tokens processed in this step (sum of all prompt tokens + all completion tokens across all G responses in the batch).

#### `completion_length` (float, tokens)
Average completion length across the entire batch. Similar to `completions/mean_length` but may be computed differently (batch-level vs per-prompt).

#### `row_indices` (array of ints)
Which records from training.jsonl were used in this step. Each record index appears G times (once per generated completion).

Example: `[52, 52, 52, 52, 52, 52, 52, 52, 69, 69, 69, 69, 69, 69, 69, 69]`
- Record #52 generated 8 completions
- Record #69 generated 8 completions
- batch_size = 2 (2 prompts in this mini-batch), G = 8

#### `row_indices_count` (int)
Total number of completions in this step = batch_size × G. From the example above: 2 × 8 = 16.

---

### Metric Relationships Cheat Sheet

```
HIGH reward + LOW reward_std → Model is already good, grader too lenient
                                → GRPO has no signal. Make grader harder.

LOW reward + HIGH reward_std  → Model is struggling, wide quality range
                                → GRPO has strong signal. Keep training.

HIGH frac_reward_zero_std     → Many prompts produce identical scores
                                → Wasted compute. Harder grader or dynamic sampling.

HIGH kl + HIGH reward         → Possible reward hacking — model found
                                shortcut that scores high but isn't genuinely better.

HIGH kl + LOW reward          → Model diverged but didn't improve.
                                → LR too high or data issue.

HIGH clipped_ratio            → Responses truncated → grader scores garbage.
                                → Increase max_output_tokens.

HIGH clip_ratio/region_mean   → Trust region heavily constraining updates.
                                → LR or advantages may be too large.

grad_norm NaN                 → Stop training. Numerical overflow.
                                → Check for zero-length completions or bad data.
```

---

## Sources

- **DeepSeekMath** (Shao et al., 2024) — Introduced GRPO. G=64, LR=1e-6. [arXiv:2402.03300](https://arxiv.org/abs/2402.03300)
- **DAPO** (Yu et al., 2025) — GRPO at scale. beta=0 (no KL penalty), dynamic sampling. [arXiv:2503.14476](https://arxiv.org/abs/2503.14476)
- **Dr. GRPO** (Liu et al., 2025) — Removes std bias. Shows frac_reward_zero_std impact. [arXiv:2503.20783](https://arxiv.org/abs/2503.20783)
- **OpenAI RFT Guide** — Grader design, validation sets, checkpoint selection. [platform.openai.com](https://platform.openai.com/docs/guides/reinforcement-fine-tuning)
- **GRPO++ Tricks** (Wolfe, 2025) — Practical improvements for making GRPO work. [cameronrwolfe.substack.com](https://cameronrwolfe.substack.com/p/grpo-tricks)
- **TRL GRPOTrainer** — Reference implementation, default hyperparameters. [huggingface.co/docs/trl](https://huggingface.co/docs/trl/main/en/grpo_trainer)

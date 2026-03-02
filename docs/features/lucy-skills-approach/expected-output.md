# Expected Output: What the User Gets

This document answers three questions:
1. **What does the user download?**
2. **How do they use it?**
3. **What does it look like in action?**

We use a concrete scenario throughout: a user building a **Chess Opening Tutor**.

---

## Scenario

```
User objective:  "Build an expert chess opening tutor that teaches opening theory,
                  common plans, and typical mistakes for club-level players (1200-1800 ELO)"

Uploaded docs:
  - "Modern Chess Openings (15th Edition).pdf"  (320 pages)
  - "Understanding Chess Openings - Simplified.pdf"  (85 pages)
```

---

## What the Pipeline Produces (The 3 Core Outputs)

The pipeline produces **three artifacts**, each serving a different purpose:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SKILL PIPELINE OUTPUTS                        │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ 1. KNOWLEDGE    │  │ 2. SYNTHETIC     │  │ 3. SKILL      │  │
│  │    INDEX        │  │    DATASET       │  │    CONFIG      │  │
│  │                 │  │                  │  │               │  │
│  │ Your docs,     │  │ 500+ generated   │  │ System prompt │  │
│  │ chunked,       │  │ conversations    │  │ + rubric +    │  │
│  │ embedded,      │  │ graded & tagged  │  │ reasoning     │  │
│  │ searchable     │  │ in JSONL         │  │ templates     │  │
│  │                 │  │                  │  │               │  │
│  │ PROVIDES:      │  │ PROVIDES:        │  │ PROVIDES:     │  │
│  │ Facts, source  │  │ "How to respond" │  │ Identity,     │  │
│  │ material,      │  │ patterns, tone,  │  │ rules, self-  │  │
│  │ citations      │  │ depth, examples  │  │ evaluation    │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────┬────────┘  │
│           │                    │                     │           │
│           └────────────────────┼─────────────────────┘           │
│                                ▼                                 │
│                    ┌───────────────────────┐                     │
│                    │   SKILL RUNTIME       │                     │
│                    │                       │                     │
│                    │   User asks question  │                     │
│                    │   → Retrieve chunks   │                     │
│                    │   → Retrieve similar  │                     │
│                    │     conversations     │                     │
│                    │   → Compose prompt    │                     │
│                    │   → Foundation model  │                     │
│                    │   → Response with     │                     │
│                    │     citations         │                     │
│                    └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### Output 1: Knowledge Index (from your documents)

The user's uploaded PDFs, processed into searchable chunks.

**Purpose**: Provides the **facts** — what information exists, what the sources say, what to cite.

```
599 chunks from 2 PDFs
Each chunk: heading, summary, full content, page range, keywords, embedding
```

### Output 2: Synthetic Dataset (generated conversations in JSONL)

This is the big one the current doc was missing. The pipeline generates **hundreds of complete, graded conversations** that show the model how to behave.

**Purpose**: Provides the **behavioral patterns** — how to structure answers, what tone to use, what depth, how to cite, how to handle edge cases.

```
523 conversations generated — ALL kept
  → Each graded with a quality score (0-1) used for retrieval ranking
  → Organized by topic, difficulty, question type
  → Each tagged with which knowledge chunks it references
  → Exported as training_data.jsonl
```

### Output 3: Skill Config (system prompt + reasoning + rubric)

The behavioral instructions, reasoning patterns, and self-check criteria.

**Purpose**: Provides the **identity and rules** — who the model is, how it should think, how to verify its own answers.

---

## The Synthetic Dataset: What It Looks Like

### The JSONL file the user gets

**File**: `training_data.jsonl` — 523 conversations, one per line. All conversations are kept (no filtering); quality scores are used as a retrieval ranking signal at runtime.

Each line is a complete conversation:

```jsonl
{"id":"conv-001","topic":"Italian Game","difficulty":"intermediate","quality_score":0.91,"knowledge_refs":["mco15:chunk-042","mco15:chunk-043"],"messages":[{"role":"system","content":"You are an expert chess opening tutor for club-level players (1200-1800 ELO). Ground responses in reference materials and cite sources."},{"role":"user","content":"I keep losing in the Italian Game as Black after White plays d4. What am I doing wrong?"},{"role":"assistant","content":"This is one of the most common problems for club players in the Italian Game.\n\n**The position** arises after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d4.\n\n**The mistake most club players make**: Passively retreating the bishop to e7 or d6 after 5.d4. This gives White exactly what they want — a strong center with no counterplay.\n\n**What you should do**: Play **5...exd4 6.cxd4 Bb4+**. This is critical because:\n- You break up White's center immediately\n- The check forces White to deal with the pin\n- After 7.Bd2 Bxd2+ 8.Nbxd2, you've traded White's dark-squared bishop\n\n**Key follow-up**: After 8...d5! — challenge the center right away.\n\n**Simple rule**: capture, check, strike the center. exd4, Bb4+, d5.\n\n[Source: MCO 15th Ed., pp. 87-89]"}]}
{"id":"conv-002","topic":"Sicilian Defense","difficulty":"advanced","quality_score":0.85,"knowledge_refs":["mco15:chunk-158","mco15:chunk-159"],"messages":[{"role":"system","content":"..."},{"role":"user","content":"I want to play the Najdorf as Black but I hear it requires a lot of memorization. Is it realistic for a 1600?"},{"role":"assistant","content":"Honest answer: **yes, but with a different approach than grandmasters take.**\n\nAt the GM level, Najdorf theory goes 25+ moves deep. You don't need any of that at 1600.\n\n**What you DO need to know** (first 8-10 moves):\n\nAfter 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 **a6**:\n\n**Against 6.Be3 (English Attack)** — most common at club level:\n- Play 6...**e5** 7.Nb3 **Be7** — simple development\n- Plan: castle, ...b5 when ready, aim for ...d5 break\n\n**Against 6.Be2** — positional:\n- Play 6...**e5** — grab space, similar plans\n\n**My recommendation**: Start with 6.Be3 and 6.Be2 (the ...e5 setup). Covers 80% of games. Add 6.Bg5 lines later.\n\n[Source: MCO 15th Ed., pp. 142-145]"}]}
{"id":"conv-003","topic":"General Principles/Center Control","difficulty":"beginner","quality_score":0.88,"knowledge_refs":["uso:chunk-008","uso:chunk-009"],"messages":[{"role":"system","content":"..."},{"role":"user","content":"Why does everyone say 'control the center'? What does that actually mean?"},{"role":"assistant","content":"Great question — let me make it concrete.\n\n**The center** = four squares: e4, d4, e5, d5. The crossroads of the board.\n\n**Why it matters** — a simple test:\n- Knight on **e4**: attacks **8 squares**\n- Knight on **a1**: attacks **2 squares**\n- Same piece, 4x more powerful in the center\n\n**What controlling looks like in practice**:\n1. Place pawns in the center (1.e4 or 1.d4)\n2. Aim pieces at the center (bishop on c4, not a3)\n3. Don't give up center pawns for free\n\n**One rule for your games**: First 5-6 moves should either (a) put a pawn in the center, (b) develop a piece toward the center, or (c) castle.\n\n[Source: Understanding Chess Openings, pp. 12-14]"}]}
```

### Readable version of one record

```json
{
  "id": "conv-001",
  "topic": "Italian Game",
  "difficulty": "intermediate",
  "quality_score": 0.91,
  "knowledge_refs": ["mco15:chunk-042", "mco15:chunk-043"],
  "messages": [
    {
      "role": "system",
      "content": "You are an expert chess opening tutor for club-level players (1200-1800 ELO). Ground responses in reference materials and cite sources."
    },
    {
      "role": "user",
      "content": "I keep losing in the Italian Game as Black after White plays d4. What am I doing wrong?"
    },
    {
      "role": "assistant",
      "content": "This is one of the most common problems for club players in the Italian Game.\n\n**The position** arises after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d4.\n\n**The mistake most club players make**: Passively retreating the bishop to e7 or d6...\n\n**What you should do**: Play **5...exd4 6.cxd4 Bb4+**...\n\n**Simple rule**: capture, check, strike the center. exd4, Bb4+, d5.\n\n[Source: MCO 15th Ed., pp. 87-89]"
    }
  ]
}
```

### What each field means

| Field | What it is | What it's used for |
|-------|------------|-------------------|
| `id` | Unique conversation ID | Tracking, deduplication |
| `topic` | Which topic this covers | Topic-aware retrieval at runtime |
| `difficulty` | beginner / intermediate / advanced | Match examples to user's level |
| `quality_score` | 0-1, from the grader | Used as retrieval ranking signal — higher-scored conversations are preferred at runtime, but ALL are kept |
| `knowledge_refs` | Which knowledge chunks were used to generate this | Traceability — user can see exactly what source material informed this example |
| `messages` | The full conversation (system + user + assistant) | **This IS the example** — the model sees this at runtime and mimics the pattern |

### Dataset statistics

```
training_data.jsonl
├── Total conversations:     523 (all kept, scored for retrieval ranking)
├── By topic:
│   ├── Italian Game:           41 conversations (avg score: 0.87)
│   ├── Ruy Lopez:              48 conversations (avg score: 0.84)
│   ├── Sicilian Defense:       57 conversations (avg score: 0.83)
│   ├── French Defense:         35 conversations (avg score: 0.86)
│   ├── Queen's Gambit:         39 conversations (avg score: 0.85)
│   ├── King's Indian:          32 conversations (avg score: 0.82)
│   ├── London System:          28 conversations (avg score: 0.88)
│   ├── General Principles:     52 conversations (avg score: 0.89)
│   └── ... (other topics)
├── By difficulty:
│   ├── Beginner:              172 (33%)
│   ├── Intermediate:          224 (43%)
│   └── Advanced:              127 (24%)
├── By question type:
│   ├── "How to play":         199 (38%)
│   ├── "What's wrong":        115 (22%)
│   ├── "Should I play X":      84 (16%)
│   ├── "Explain concept":      73 (14%)
│   └── "Compare options":      52 (10%)
└── Quality scores (used as retrieval ranking signal):
    ├── Mean score:             0.81
    ├── Min score:              0.32
    ├── Max score:              0.97
    ├── Score > 0.8:           312 (60%) — preferred in retrieval
    ├── Score 0.5-0.8:         168 (32%) — used when topic coverage is thin
    └── Score < 0.5:            43 (8%)  — low priority, can serve as negative examples
```

---

## How the Skill Uses Synthetic Data at Runtime (Two-Index Retrieval)

This is the key mechanism. When a user asks a question, the skill runtime searches **two indexes**:

```
User: "Should I play the King's Indian or the Grünfeld against 1.d4?"

Step 1: SEARCH KNOWLEDGE INDEX (for facts)
  → Retrieves:
    - "King's Indian Defense: Overview" (chunk from MCO, pp. 201-203)
    - "Grünfeld Defense: Overview" (chunk from MCO, pp. 218-220)
    - "Choosing Between Indian Defenses" (chunk from UCO, pp. 45-46)

Step 2: SEARCH SYNTHETIC DATASET (for behavioral examples)
  → Finds similar conversations by topic + question type:
    - conv-287: "Is the Najdorf realistic for a 1600?" (similar: opening recommendation)
    - conv-341: "King's Indian vs Nimzo-Indian?" (similar: compare openings)
  → These show the model HOW to structure a comparison answer

Step 3: COMPOSE PROMPT
  ┌────────────────────────────────────────────────────────────┐
  │ SYSTEM: [system_prompt.md — persona, rules, rubric]       │
  │                                                            │
  │ KNOWLEDGE CONTEXT:                                         │
  │ "Here is relevant information from your reference docs:"   │
  │ [3 retrieved knowledge chunks — the facts]                 │
  │                                                            │
  │ EXAMPLE CONVERSATIONS:                                     │
  │ "Here are examples of how to answer similar questions:"    │
  │ [2 retrieved synthetic conversations — the behavior]       │
  │                                                            │
  │ USER: "Should I play the King's Indian or the Grünfeld     │
  │        against 1.d4?"                                      │
  └────────────────────────────────────────────────────────────┘

Step 4: FOUNDATION MODEL GENERATES
  → Sees the facts (what to say)
  → Sees the examples (how to say it)
  → Produces a response in the same style, tone, and depth as the examples
  → Cites the actual knowledge chunks
```

### Why two indexes matter

| Without synthetic data | With synthetic data |
|---|---|
| Model gets facts but invents its own response style | Model gets facts AND sees how good responses look |
| Tone varies randomly (sometimes too formal, sometimes too casual) | Tone is consistent — matches the curated examples |
| Depth is unpredictable (might dump 20 moves of theory for a beginner) | Depth matches the user's level — examples demonstrate this |
| Citations may be inconsistent or forgotten | Examples all include citations — the model mimics this |
| Edge cases handled poorly (model doesn't know what "out of scope" looks like) | Examples include edge case handling — model learns the pattern |

**The synthetic dataset is not just training data — it's a searchable behavioral library the model consults at runtime.**

### How many synthetic conversations do we need?

In finetune (SFT/RFT), more data = more training signal = better weights. In skills, the relationship is different because retrieval caps the benefit:

```
At runtime, the model only sees 2-3 retrieved conversations (context window budget).
Whether you have 200 or 2000 total, the model still sees those 2-3.

So what matters is: does every topic/difficulty/question-type combination
have at least a few good examples to retrieve?
```

**Coverage completeness matters more than raw volume:**

```
Sample Count vs Performance (approximate):

  0 conversations    ░░░░░░░░░░░░░░░░░░░░  No behavioral guidance
  50 conversations   ████████░░░░░░░░░░░░  Covers major topics, big jump
  100 conversations  ████████████░░░░░░░░  Good coverage, fills common patterns
  300 conversations  ██████████████████░░  Strong coverage, edge cases covered
  500 conversations  ███████████████████░  Diminishing returns start
  1000+ conversations████████████████████  Marginal — mostly redundant

The curve flattens because retrieval only surfaces top-K matches.
Adding more data only helps if it fills a GAP (uncovered topic,
missing question type, thin difficulty level).
```

**When more samples help:**
- New topic area with zero examples → adding 5-10 examples = big improvement
- A question type (e.g., "compare two options") with only 1 example → adding 3-5 more helps
- A difficulty level (e.g., "advanced") with thin coverage → more depth helps

**When more samples don't help:**
- You already have 15 examples for "Italian Game, intermediate, how-to-play" → adding 15 more won't improve retrieval (the top 2-3 are already good)
- The improvement you need is in knowledge chunks, not behavioral examples

**Bottom line**: 300-500 well-distributed conversations is the sweet spot. Beyond that, focus effort on improving knowledge chunk quality and coverage instead.

---

## The Final Deliverable (Updated)

After the pipeline completes, the user sees this in the vLLora UI:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ✓ Chess Opening Tutor — Skill Ready                        v1.0.0  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  599 knowledge chunks · 523 synthetic conversations · 87% test pass │
│                                                                      │
│  How do you want to use this skill?                                  │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  🔗 API          │  │  📥 Download     │  │  💬 Try it       │     │
│  │  Get an endpoint │  │  Export package  │  │  Chat with it   │     │
│  │  to call from    │  │  for Claude,     │  │  right here     │     │
│  │  your app        │  │  GPT, or custom  │  │  in vLLora      │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                          │
│  │  📊 Dataset      │  │  ⚡ Fine-tune     │                          │
│  │  Download JSONL  │  │  Use this skill  │                          │
│  │  (523 convos)    │  │  to train a      │                          │
│  │                  │  │  custom model    │                          │
│  └─────────────────┘  └─────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
```

The user has **5 ways to use their skill**:

| Option | What they get | Best for |
|--------|---------------|----------|
| **API Endpoint** | A URL they call from any app | Developers integrating into products |
| **Download Package** | Exportable files for Claude/GPT/custom | Teams using existing AI platforms |
| **Try It** | Chat with the skill inside vLLora | Testing and iterating |
| **Dataset (JSONL)** | 523 graded synthetic conversations | Using in their own pipeline, fine-tuning elsewhere, analysis |
| **Fine-tune** (optional) | Use the skill to generate better training data for a small model | High-volume / low-latency needs |

---

## Option 1: API Endpoint

### What the user gets

A hosted REST API endpoint:

```
https://api.vllora.com/v1/skills/sk_chess_opening_tutor/chat
```

### How they use it

```bash
curl https://api.vllora.com/v1/skills/sk_chess_opening_tutor/chat \
  -H "Authorization: Bearer sk-user-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I keep losing in the Italian Game as Black after White plays d4. What am I doing wrong?"}
    ]
  }'
```

### What comes back

```json
{
  "id": "msg_abc123",
  "messages": [
    {
      "role": "assistant",
      "content": "This is one of the most common problems for club players in the Italian Game. Let me break it down.\n\n**The position** arises after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d4.\n\n**The mistake most club players make**: Passively retreating the bishop to e7 or d6 after 5.d4. This gives White exactly what they want — a strong center with no counterplay.\n\n**What you should do**: Play **5...exd4 6.cxd4 Bb4+**. This is critical because:\n- You break up White's center immediately\n- The check forces White to deal with the pin\n- After 7.Bd2 Bxd2+ 8.Nbxd2, you've traded White's dark-squared bishop\n\n**Key follow-up**: After 8...d5! — challenge the center right away. Don't play ...d6 (passive). The move ...d5 equalizes.\n\n**Simple rule**: In the Italian after 5.d4 — capture, check, then strike the center. exd4, Bb4+, d5. In that order.\n\n[Source: Modern Chess Openings 15th Ed., pp. 87-89]"
    }
  ],
  "metadata": {
    "knowledge_used": [
      {"document": "Modern Chess Openings (15th Edition)", "section": "Italian Game: Giuoco Piano — Main Line", "pages": "87-89"},
      {"document": "Modern Chess Openings (15th Edition)", "section": "Italian Game: Common Errors", "pages": "90"}
    ],
    "examples_used": [
      {"id": "conv-001", "topic": "Italian Game", "similarity": 0.94},
      {"id": "conv-018", "topic": "Italian Game", "similarity": 0.81}
    ],
    "model": "claude-sonnet-4-6",
    "tokens": {"prompt": 5830, "completion": 312}
  }
}
```

### Integration examples

**In a chess learning app (React)**:
```tsx
const response = await fetch('https://api.vllora.com/v1/skills/sk_chess_opening_tutor/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      ...conversationHistory,
      { role: 'user', content: userQuestion }
    ]
  })
});

const data = await response.json();
// Display data.messages[0].content to user
// Show data.metadata.sources_used as citations
```

**In a Discord bot (Python)**:
```python
import requests

def ask_chess_tutor(question, history=[]):
    response = requests.post(
        "https://api.vllora.com/v1/skills/sk_chess_opening_tutor/chat",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"messages": history + [{"role": "user", "content": question}]}
    )
    return response.json()["messages"][0]["content"]
```

**In a Slack bot, Telegram bot, mobile app, website widget** — any app that can make HTTP requests.

---

## Option 2: Download Package

### What the user downloads

A `.zip` file containing everything needed to recreate the skill on any platform.

#### Format A: For Claude (Claude Project / Claude Skills)

```
chess-opening-tutor-claude.zip
├── project_instructions.md        ← Paste into Claude Project instructions
├── knowledge/                     ← Upload these as Project knowledge files
│   ├── 01-general-principles.md
│   ├── 02-open-games.md
│   ├── 03-semi-open-games.md
│   ├── 04-closed-games.md
│   ├── 05-indian-defenses.md
│   └── 06-reference-examples.md
├── training_data.jsonl            ← 523 synthetic conversations (upload as knowledge)
└── README.md                      ← Setup instructions
```

**README.md contents**:
```markdown
# Chess Opening Tutor — Claude Setup

## Quick Start (2 minutes)

1. Go to claude.ai → Projects → New Project
2. Paste the contents of `project_instructions.md` into the Project Instructions field
3. Upload all files in the `knowledge/` folder as Project Knowledge
4. Start chatting — Claude is now your chess opening tutor

## What's Included

- **project_instructions.md**: Expert persona, teaching approach, behavioral rules,
  self-evaluation criteria, and 6 curated example conversations
- **knowledge/**: Your reference material organized by topic (599 sections from
  your uploaded PDFs, structured for Claude's retrieval)
- **training_data.jsonl**: 523 synthetic conversations (all kept, ranked by quality score). Upload as
  a Project Knowledge file — Claude will use these as behavioral examples when
  answering similar questions.

## Tips

- Claude will cite your sources as [Source: MCO 15th Ed., pp. 87-89]
- Ask follow-up questions — the tutor maintains conversation context
- If Claude gives advice not grounded in your materials, it will say so
```

**project_instructions.md** (the file they paste into Claude):

```markdown
# Chess Opening Tutor

You are an expert chess opening tutor for club-level players (1200-1800 ELO).
Your knowledge comes from the reference materials in this project.

## Teaching Approach
- Explain ideas before moves — strategic concepts first, concrete moves second
- Highlight common mistakes at the 1200-1800 level and explain WHY they're wrong
- Keep depth to 5-8 moves unless asked for more
- Always cite your sources: [Source: Document Name, pp. X-Y]

## Rules
- Ground all responses in the project knowledge files
- If asked about something not in your knowledge, say so explicitly
- Never fabricate specific computer evaluations
- Adapt to the student's level based on their questions

## Example Conversations

### Example 1: Correcting a common mistake (Italian Game)
User: I keep losing in the Italian Game as Black after White plays d4.
Assistant: This is one of the most common problems for club players...
[full example conversation continues]

### Example 2: Opening recommendation (Najdorf)
User: I want to play the Najdorf. Is it realistic for a 1600?
Assistant: Honest answer: yes, but with a different approach than grandmasters...
[full example conversation continues]

### Example 3: Explaining principles (Center Control)
...
```

**knowledge/02-open-games.md** (example knowledge file):

```markdown
# Open Games (1.e4 e5)

## Italian Game: Giuoco Piano — Main Line

The Giuoco Piano arises after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5. This opening has
been played for centuries and remains popular at all levels.

Main Line: 4.c3 Nf6 5.d4 exd4 6.cxd4 Bb4+ 7.Bd2 Bxd2+ 8.Nbxd2

White's plan:
- Establish a strong pawn center with e4+d4
- Use the bishop pair in open positions
- Attack on the kingside after castling

Black's plan:
- Challenge the center with ...d5 at the right moment
- Use the half-open e-file after ...exd4
- Develop the light-squared bishop actively

Common mistakes for club players:
- Playing ...d6 too early (passive, blocks the bishop)
- Failing to challenge the center with ...d5
- Neglecting development in favor of premature attacks

[Pages 87-89, Modern Chess Openings 15th Edition]

---

## Italian Game: Evans Gambit
...

## Ruy Lopez: Main Line
...
```

#### Format B: For OpenAI GPT

```
chess-opening-tutor-gpt.zip
├── gpt_instructions.md            ← Paste into GPT Builder instructions
├── knowledge/                     ← Upload these as GPT Knowledge files
│   ├── 01-general-principles.md
│   ├── 02-open-games.md
│   ├── ...
│   └── 06-reference-examples.md
├── training_data.jsonl            ← 523 synthetic conversations (upload as knowledge)
└── README.md                      ← Setup instructions
```

**README.md**:
```markdown
# Chess Opening Tutor — Custom GPT Setup

1. Go to chatgpt.com → My GPTs → Create a GPT
2. In the Configure tab:
   - Name: Chess Opening Tutor
   - Description: Expert chess opening tutor for 1200-1800 ELO players
   - Instructions: Paste contents of `gpt_instructions.md`
   - Knowledge: Upload all files from `knowledge/` folder
3. Save → your GPT is ready to use and share
```

#### Format C: Generic JSON (for custom integrations)

```
chess-opening-tutor.zip
├── manifest.json                  ← Skill metadata + config
├── system_prompt.md               ← Expert persona + rules
├── knowledge/
│   ├── chunks.json                ← All 599 knowledge chunks with metadata
│   └── embeddings.json            ← Precomputed embeddings for search
├── training_data/
│   ├── training_data.jsonl        ← 523 graded synthetic conversations
│   ├── embeddings.json            ← Precomputed embeddings for conversation search
│   └── stats.json                 ← Dataset statistics (topics, scores, counts)
├── reasoning/
│   └── templates.json             ← 3 reasoning templates with triggers
├── evaluation/
│   ├── rubric.md                  ← Self-evaluation criteria
│   └── test_suite.json            ← 30 regression tests
└── README.md                      ← Integration guide
```

This format is for developers who want to build their own skill runtime — plug it into LangChain, LlamaIndex, a custom RAG pipeline, or any other framework.

**The `training_data/` folder is especially important**: developers get both the raw JSONL and precomputed embeddings, so they can build their own two-index retrieval (knowledge + conversations) without re-embedding.

---

## Option 3: Try It (Chat in vLLora)

The user can immediately chat with their skill inside vLLora, no setup required:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Chess Opening Tutor                              Model: Claude 4.6 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  You: I just lost a game where my opponent played the London System  │
│  and I had no idea what to do as Black. Help!                        │
│                                                                      │
│  Tutor: The London System (1.d4 + 2.Bf4) is frustrating to face     │
│  because White develops solidly without committing to a sharp plan.  │
│  Here's how to fight back:                                           │
│                                                                      │
│  **The key idea**: Challenge White's bishop on f4 and fight for      │
│  the center with ...c5.                                              │
│                                                                      │
│  After 1.d4 d5 2.Bf4:                                               │
│  - Play **2...Nf6** (develop naturally)                              │
│  - Then **3...c5** (challenge the center immediately!)               │
│  - Follow with ...Nc6, ...e6, ...Be7, castle                        │
│                                                                      │
│  **Common mistake at your level**: Playing passively with ...e6      │
│  and ...Be7 without ever playing ...c5. This lets White build a      │
│  comfortable position with zero counterplay for Black.               │
│                                                                      │
│  [Source: MCO 15th Ed., pp. 234-236]                                │
│                                                                      │
│  Want me to go deeper into the main lines after 3...c5?              │
│                                                                      │
│  ──── Sources ─────────────────────────────────────────────────      │
│  📄 MCO 15th Ed. → "London System: Black's Counterplay" (pp.234-236)│
│  📄 MCO 15th Ed. → "London System: Move Order" (pp.232-233)         │
│  ──────────────────────────────────────────────────────────────      │
│                                                                      │
│  [Type your question...]                                   [Send]   │
└──────────────────────────────────────────────────────────────────────┘
```

Key UI elements:
- **Sources panel** at the bottom — shows which knowledge chunks were retrieved
- User can click a source to see the full chunk content
- Conversation is multi-turn — the tutor remembers context
- User can rate responses (thumbs up/down) to improve the skill

---

## Option 4: Fine-tune (Using the Skill)

If the user wants a cheaper/faster model for production, the skill generates **better training data** than the current pipeline:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Fine-tune from Skill                                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  Your "Chess Opening Tutor" skill is working well (87% test pass).  │
│  Want to create a fine-tuned model for lower cost at scale?          │
│                                                                      │
│  How it works:                                                       │
│  1. We use your skill (Claude + knowledge) to generate 500+         │
│     high-quality training conversations                              │
│  2. Each conversation has full source access, so responses           │
│     are grounded and accurate                                        │
│  3. We grade every response and keep only the best                   │
│  4. Train a small model (Qwen3-4B) on this high-quality data        │
│                                                                      │
│  Result: A cheaper model that learned from a skill-augmented         │
│  teacher instead of raw synthetic data.                              │
│                                                                      │
│  Cost comparison (per 1,000 queries):                                │
│  ┌──────────────┬──────────┬──────────┐                             │
│  │              │ Skill    │ Finetune │                             │
│  │ Cost / 1K    │ ~$5.00   │ ~$0.10   │                             │
│  │ Latency      │ ~1.5s    │ ~0.3s    │                             │
│  │ Quality      │ ●●●●●    │ ●●●●○    │                             │
│  └──────────────┴──────────┴──────────┘                             │
│                                                                      │
│  [Generate Training Data from Skill]                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Real-World Use Case Examples

### Use Case 1: SaaS Company with Internal Docs

```
Scenario: A company wants a support agent that answers questions about their product
          based on their internal documentation (50 pages of guides + API docs).

What they upload:  product-guide.pdf, api-reference.pdf
Objective:         "Answer customer support questions accurately based on our docs"

What they get:
  → API endpoint they embed in their help desk widget
  → The widget answers customer questions with citations to their docs
  → They update their docs → re-run the skill pipeline → instant update

How they use it:
  Customer types: "How do I set up SSO?"
  Widget responds with step-by-step from their docs, citing page/section
```

### Use Case 2: Educator Building a Tutor

```
Scenario: A professor wants an AI tutor for their course material.

What they upload:  textbook.pdf, lecture-notes.pdf, past-exams.pdf
Objective:         "Tutor students on organic chemistry, test their understanding"

What they get:
  → Claude Project they share with students (download package)
  → Students chat with a tutor grounded in the actual course material
  → Tutor asks Socratic questions, doesn't just give answers
  → All responses cite the textbook

How they use it:
  Student: "I don't understand SN1 vs SN2 reactions"
  Tutor: [explains using textbook examples, cites Chapter 7, asks follow-up]
```

### Use Case 3: Law Firm with Regulatory Knowledge

```
Scenario: A law firm wants an assistant that knows their specific regulatory framework.

What they upload:  regulation-2024.pdf, compliance-guide.pdf, case-precedents.pdf
Objective:         "Answer compliance questions with exact regulatory citations"

What they get:
  → API endpoint for their internal compliance tool
  → Every answer cites the exact regulation section + page
  → When regulations update, they re-upload → regenerate skill → done

How they use it:
  Lawyer: "Can we process EU customer data in our US servers?"
  Agent: "Per [Regulation 2024, Section 4.2.1, p.47], cross-border data
          transfers require... [cites 3 specific sections]"
```

### Use Case 4: Developer Building a Domain-Specific Chatbot

```
Scenario: A developer wants to add a chess tutor to their app.

What they get:  API endpoint + API key

Integration (5 minutes):
  1. Get API key from vLLora dashboard
  2. Add one fetch() call to their app
  3. Display response to user
  4. Done — the skill handles everything else (retrieval, prompting, citations)

They never touch:
  - Prompt engineering
  - RAG pipeline setup
  - Vector database configuration
  - Embedding model selection
  - Context window management

We handle all of that. They just call an API.
```

---

## What Makes This Different from "Just Upload to ChatGPT"

| Aspect | Manual upload to ChatGPT/Claude | vLLora Skill |
|--------|-------------------------------|--------------|
| Knowledge processing | Raw file dump, hope the model figures it out | Structured extraction, chunking, indexing, embedding |
| Synthetic dataset | None — model has zero examples of good responses | 523 graded conversations the model can reference at runtime |
| Behavioral consistency | Random — tone/depth/style varies per response | Consistent — model mimics patterns from synthetic examples |
| Quality control | None — no testing before use | 30-test automated suite, pass/fail, quality scores |
| Reasoning guidance | None — model improvises | Domain-specific reasoning templates with trigger patterns |
| Self-evaluation | None — model doesn't check itself | Built-in rubric the model uses to verify responses |
| Source citations | Inconsistent, often hallucinated | Structured citations linked to actual knowledge chunks |
| Iteration | Re-upload files, hope it improves | Edit skill components, re-test, see what changed |
| Multi-platform | Locked to one platform | Export for Claude, GPT, API, or custom integration |
| JSONL export | Not available | Full synthetic dataset downloadable for any use |
| Fine-tune path | Completely separate workflow | Integrated: skill generates better training data |

---

## Summary: The User Journey

```
1. USER CREATES
   "I want a chess opening tutor" + uploads 2 PDFs
                    │
                    ▼
2. LUCY GENERATES (5-10 minutes, automated)
   Extracts knowledge → Builds index → Generates 500+ synthetic
   conversations → Grades all with quality scores (used for ranking) →
   Creates reasoning templates → Assembles skill → Runs 30 tests
                    │
                    ▼
3. USER REVIEWS
   Sees: 599 chunks, 523 conversations (scored), 87% test pass rate
   Can: Try it immediately, browse conversations, see test results
                    │
                    ▼
4. USER DEPLOYS (pick one or more)
   ├── API endpoint     → Embed in any app with one HTTP call
   ├── Claude export    → Import into Claude Project in 2 minutes
   ├── GPT export       → Create Custom GPT in 2 minutes
   ├── JSON export      → Plug into any custom RAG pipeline
   └── JSONL download   → Use the synthetic dataset however you want
                    │
                    ▼
5. USER ITERATES (ongoing)
   ├── Update knowledge → Re-upload docs, regenerate skill
   ├── Improve quality  → Edit conversations, refine system prompt, re-test
   └── Optimize cost    → Use skill to fine-tune a smaller model
```

### The Three Things the User Always Gets

No matter which deployment option they choose:

1. **Knowledge index** — their docs, structured and searchable (provides facts)
2. **Synthetic dataset** — hundreds of graded conversations in JSONL (provides behavior)
3. **Skill config** — system prompt + rubric + templates (provides identity)

The model consults all three at runtime. Knowledge tells it *what to say*. Synthetic conversations tell it *how to say it*. Skill config tells it *who it is*.

The key insight: **the user never needs to understand RAG, embeddings, prompt engineering, or fine-tuning.** They upload docs, state their goal, and get a working specialist they can use anywhere.

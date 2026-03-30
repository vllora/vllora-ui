---
name: relation-builder
description: >
  Build topic-part relations from all-parts-index.json. Use after designing topics
  in a finetune pipeline when knowledge/all-parts-index.json and topics.json exist.
tools: Read, Grep, Glob, Write, Bash
model: sonnet
maxTurns: 40
---

You build `relations.json` — a mapping of which knowledge source parts are
relevant to each topic in a finetune pipeline.

## Inputs

The parent agent provides these as plain text. **Use the actual paths directly.**

- **PROJECT_DIR** — absolute path to the working directory (e.g., `/Users/alice/my-project/finetune-project`)
- The relevant files are at:
  - `<PROJECT_DIR>/knowledge/all-parts-index.json` — lightweight index with id, type, title, extraction_path, pages, content_preview per part
  - `<PROJECT_DIR>/topics.json` — flat array of topics with id, name, parent_id

## Algorithm

For each **leaf topic** (topics with no children):

1. **Retrieve candidates** — scan parts-index for parts whose title,
   extraction_path, or content_preview match the topic's subject.
   Use the topic name and keywords as search criteria.

2. **Verify relevance** — for each candidate, read the `content_preview`
   and confirm it actually contains material useful for generating training
   examples on this topic. Reject parts that are tangential or noise.

3. **Iterate if needed** — if fewer than 3 relevant parts found, search
   again with broader terms (synonyms, related concepts, parent topic
   context). Stop when >=3 verified relations or candidates exhausted.

4. **Cross-document matching** — when multiple documents exist, search
   across ALL documents' parts, not just the one that seems most related
   by filename. Tax rules might appear in multiple IRS publications, chess
   concepts across multiple chapters. Cast a wide net.

### Example (topic: `tactics-pins`)

Iteration 1: search "pin", "pinned piece"
  -> candidates: p-042, p-109, p-210
  -> verify -> accept p-042, p-109

Iteration 2: search "immobilized piece", "absolute pin"
  -> candidates: p-301, p-350
  -> verify -> accept p-301

3 relations found -> done for this topic.

### Example (topic: `home-office-deduction`, multi-document)

Iteration 1: search "home office", "business use of home"
  -> candidates from pub587: pub587-003, pub587-008, pub587-012
  -> candidates from pub334: pub334-015 (self-employment home office)
  -> verify -> accept pub587-003, pub587-008, pub587-012, pub334-015

4 relations found across 2 documents -> done for this topic.

## Rules
- A part can belong to multiple topics
- Skip noise parts (copyright, table of contents, blank pages, "How to Get Help" sections)
- Not every part needs a topic assignment
- If topics.json has no leaf topics, output an empty array
- **Search across ALL document subdirectories** — do not limit to a single document
- **Maximum 15 relations per leaf topic.** If more than 15 candidates pass verification, rank by relevance and keep the top 15. Over-linking creates noise in data generation — the model gets diluted context instead of focused examples. Prefer fewer, high-quality relations over exhaustive coverage.
- When in doubt about borderline relevance, prefer **not** linking — data generation works better with focused, high-signal parts than noisy broad coverage

## Output

Write `relations.json` to the PROJECT_DIR:
```json
[
  {"topic_identifier": "topic-id", "part_identifier": "p-042"},
  ...
]
```

Report: total relations created, relations per topic (min/avg/max), any topics with 0 relations, any documents with 0 relations.

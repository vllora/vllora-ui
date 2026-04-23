# vllora × OpenClaw Integration

**Status:** v2 roadmap (not v0). Ship when demand emerges.
**Parent spec:** [finetune-skill-command-redesign.md](./finetune-skill-command-redesign.md)
**Date:** 2026-04-23

This document specifies how vllora integrates with [OpenClaw](https://openclaw.ai/) — an open-source cross-platform personal AI agent. OpenClaw is **not** a Claude Code fork; it's a host-layer agent with multi-chat surfaces (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, CLI) and multi-LLM support. This makes it a natural second surface for the vllora pipeline beyond Claude Code.

---

## 1. The invariant (recap)

From the parent spec §2.14:

> **The CLI is the integration point. Plugins are per-host, thin wrappers that shell out.**

Every host plugin does the same three things — and only these three things:

1. Expose the 9 thin pipeline verbs (Layer A §2.3.2) as host-native commands / skills / buttons / whatever.
2. For each invocation: shell out to `vllora finetune <verb>`.
3. Stream stdout back into the host's conversational surface.

Zero pipeline logic lives in any plugin. Rewriting for a new host is mechanical work, not an architecture change.

**Note on the orchestrator command** (`/finetune` in the Claude Code plugin, per parent §2.3.1): that's a Claude-Code-specific thick-agent pattern and does **not** port to OpenClaw. OpenClaw has its own agent model and can host its own equivalent orchestrator if desired — but it's a separate design problem, not a port. The thin verbs + CLI always port; the orchestrator is bonus per host.

### 1.1 Auth note — OpenClaw and Claude subscriptions

As of early 2026, **Anthropic cut off the ability to use Claude Pro/Max subscriptions as OpenClaw's backend LLM.** OpenClaw was one of the tools identified as a "third-party harness bypassing Claude Code" and lost subscription-auth access for its own LLM calls (it can still use `ANTHROPIC_API_KEY` or other providers).

**This does not affect our integration.** The vllora CLI's `claude -p` workers are completely independent of OpenClaw's backend LLM:

```
 [OpenClaw chat]          (OpenClaw's own LLM — GPT-4, local model, etc.)
      │
      │  runs skill → spawns subprocess
      ▼
 [vllora CLI]             (Python process, separate from OpenClaw)
      │
      │  spawns workers
      ▼
 [claude -p]              (Anthropic's binary, inherits user's claude login OR
                           ANTHROPIC_API_KEY — same rules as any other caller
                           of claude -p; vllora's pattern is ToS-compliant per
                           parent doc §2.10.1)
```

Two separate auth paths:
- **OpenClaw's own LLM** — configured by OpenClaw user (post-2026 crackdown, this is NOT Claude subscription; likely GPT-4, local model, or `ANTHROPIC_API_KEY` API billing).
- **vllora workers' LLM** — always `claude -p`, inherits user's independent Claude auth (subscription OK for this path because vllora is a documented subprocess caller, not a harness replacing Claude Code).

Users need both configured for the OpenClaw × vllora combo to work:
1. OpenClaw-level auth (for its own agent reasoning)
2. Claude auth (`claude login` or `ANTHROPIC_API_KEY`) that `claude -p` inherits when vllora spawns it

`vllora doctor` validates (2); OpenClaw's install flow validates (1).

---

## 2. What stays the same across hosts

| Concern | Lives in | Never changes per host |
|---|---|---|
| Pipeline verbs | `vllora finetune *` (CLI) | ✓ |
| Worker subprocess model | CLI workers → `claude -p` | ✓ |
| Auth model | Claude CLI inheritance | ✓ |
| Gateway HTTP contract | CLI → gateway | ✓ |
| Storage model (local + DB) | `finetune-project/` + `~/.vllora/vllora.db` | ✓ |
| Journal schema | `pipeline-journal.json` | ✓ |

**Auth note.** All LLM-heavy work flows through `claude -p`. Every host plugin — Claude Code, OpenClaw, whatever — still requires `claude login` (subscription) or `ANTHROPIC_API_KEY` (CI). OpenClaw being Anthropic-agnostic doesn't make vllora Anthropic-agnostic. The host's own LLM choices are independent of what our workers need.

---

## 3. What varies per host

| Concern | Claude Code | OpenClaw |
|---|---|---|
| **Plugin manifest format** | `plugin.json` + markdown commands | npm `package.json` + TS/JS skills |
| **Command authoring language** | Markdown with prompt frontmatter | TypeScript handlers |
| **Streaming convention** | stream-JSON events | async iterators (likely) |
| **Install mechanism** | Symlink from pip package | `npm install @vllora/openclaw-plugin` |
| **User surface** | Chat with rich markdown | WhatsApp / Telegram / Slack / CLI — plainer, async-friendly, mobile-aware |

---

## 4. Concrete plugin shape

```
  @vllora/openclaw-plugin/           (npm package, published separately)
  ├── package.json
  ├── manifest.json                   # OpenClaw plugin metadata
  ├── README.md
  └── skills/
      ├── quickstart.ts               # wraps `vllora finetune quickstart`
      ├── init.ts                     #        `vllora finetune init`
      ├── sources.ts                  #        `vllora finetune sources`
      ├── import-records.ts           #        `vllora finetune import-records`
      ├── plan.ts                     #        `vllora finetune plan`
      ├── generate.ts                 #        `vllora finetune generate`
      ├── eval.ts                     #        `vllora finetune eval`
      ├── train.ts                    #        `vllora finetune train`
      └── status.ts                   #        `vllora finetune status`
```

Each skill is a thin handler:

```typescript
// skills/plan.ts (illustrative — actual shape depends on OpenClaw's plugin API)
import { spawn } from "node:child_process";
import type { Skill, SkillContext } from "@openclaw/sdk";

export const planSkill: Skill = {
  name: "vllora-finetune-plan",
  description: "Build topic hierarchy + grader draft for the current vllora workflow",
  intents: ["plan my fine-tune", "build topics", "draft grader"],
  handler: async (ctx: SkillContext) => {
    const child = spawn("vllora", ["finetune", "plan"], {
      cwd: ctx.projectDir ?? process.cwd(),
    });
    for await (const line of child.stdout) {
      await ctx.stream(line.toString());
    }
    return ctx.awaitExit(child);
  },
};
```

The `spawn("vllora", ...)` line is identical to what the Claude Code plugin does — just wrapped in the host's own handler shape.

---

## 5. End-to-end pipeline through OpenClaw

Same pipeline as parent spec §3.3, with one additional actor at the front: OpenClaw relays between the user's chat surface (WhatsApp / Telegram / Slack / CLI) and the vllora CLI.

```
  USER            OPENCLAW              vllora CLI            WORKERS              GATEWAY+DB
  (mobile/       (Node.js host          (Python — Layer       (claude -p           (Rust + SQLite)
   desktop       + @vllora/openclaw-     A verbs, same         subprocesses)
   chat)         plugin)                 as Claude Code
                                         path)

  [WhatsApp]
  "fine-tune a
   support agent
   from these PDFs"
   + attaches
     3 PDFs
      │
      ▼
  OPENCLAW receives message
   • saves PDFs to ~/Downloads/wf-xyz/
   • parses intent: fine-tune pipeline
   • dispatches to @vllora/openclaw-plugin
      │
      ▼
  PLUGIN.skills.quickstart.handler(ctx)
   • spawns: vllora finetune quickstart
              --objective "support agent"
              --sources ~/Downloads/wf-xyz/
              --non-interactive
      │
      ▼
                          [CLI]   vllora finetune quickstart
                                   • writes local files
                                   • chains: init → sources → plan → generate → eval → train
                                   • every LLM-heavy step spawns:
                                      [WORKER] claude -p
                                                   (knowledge_extractor, relation_builder,
                                                    grader_drafter, record_generator,
                                                    training_monitor)
                                                             │
                                                             ▼
                                                      writes knowledge/, records,
                                                      grader.js, metrics
                                   • uploads to gateway via HTTP:
                                                             │
                                                             ▼
                                                                     [GATEWAY]
                                                                      INSERT workflows,
                                                                             source_documents,
                                                                             knowledge_parts,
                                                                             topics, relations,
                                                                             records, graders,
                                                                             evaluation_runs,
                                                                             training_jobs, ...
                                                                      runs inference for eval
                                                                      runs GRPO for train

                          [CLI] stdout (stream-JSON + human text)
                              │
                              ▼
  PLUGIN pipes events back as async-iterable chunks
      │
      ▼
  OPENCLAW formats per chat surface
   (WhatsApp: plain text + occasional media
    Slack:    rich text + attachments
    Desktop:  terminal-style)
      │
      ▼
  [WhatsApp]                (intermittent; user may close chat)
   "Extracting 3 PDFs… 3/3 done."
   "Drafting plan: 8 topics found. (View plan.md link.)"
   "Generating 240 records… quality gate PASS."
   "Eval iter 1/5: readiness PASS. Selected model: qwen-4b."
   "Training started (job-uuid). I'll ping when done (~2-3 hrs)."
           …
   [2 hours later — user is away]
   "Training complete! Adapter: adapter-xyz. Converged: yes."
   "Full report: /Downloads/wf-xyz/training/monitor-report-1.md"
```

**Notes on this flow:**

- **User surface is multi-modal.** The same vllora pipeline works whether user is in WhatsApp on their phone, Slack on laptop, or iMessage on the commute. OpenClaw abstracts the chat surface.
- **Long-running work gracefully handled.** User can close the chat; OpenClaw's persistent memory means it remembers what to ping when training finishes. Claude Code's tight-loop session model is less natural for 3-hour GRPO runs.
- **Plugin adds zero pipeline logic.** The CLI invocation is identical to what the Claude Code plugin runs. Debug logs, journal, and gateway writes look the same regardless of host.
- **Auth path is unchanged.** `claude -p` workers still inherit `claude login` — OpenClaw doesn't need to know about this. User authenticates once per machine via standard Claude CLI.
- **Errors propagate the same way.** Quality gate FAIL, readiness FAIL, training non-convergence all surface through OpenClaw's chat as formatted messages, exactly as they would in Claude Code.

---

## 6. Where OpenClaw genuinely adds value beyond Claude Code

Not duplicative — complementary. OpenClaw enables:

- **Mobile oversight of long training** — kick off `/finetune-train` on desktop; monitor progress from WhatsApp while on the go. When training completes (2–3 hours later), OpenClaw pings you via your preferred chat surface with `training_monitor`'s final report.
- **Cross-session iteration** — from any chat, ask *"what's the eval status on wf-abc12?"*; OpenClaw runs `vllora finetune status` + `jobs status`, summarizes.
- **Scheduled pipelines** — power users can build OpenClaw self-skills like *"every Friday 5pm, re-run eval on the production adapter; alert in Slack if readiness drops."* Our CLI's deterministic verbs make this trivial to automate on top.
- **Multi-LLM hosting freedom** — OpenClaw users already running GPT-4 or local models for other tasks get vllora as an additional capability without locking into a single LLM ecosystem for their whole workflow.

---

## 7. When to ship

Criteria for triggering the v2 OpenClaw plugin build:

1. ≥10 vllora users publicly asking for OpenClaw support (or equivalent signal).
2. OpenClaw plugin API stable and documented.
3. Our CLI surface has been stable for ≥1 minor version (avoid moving targets).
4. We have a committed maintainer for the OpenClaw plugin (or the OpenClaw community builds it — community-built plugins are explicitly in their model).

Until then, **Path A is the default**: OpenClaw users invoke our CLI via OpenClaw's shell tool. One line in our README: *"OpenClaw users: run `vllora finetune <verb>` from OpenClaw's shell. Example: …"*

---

## 8. Same model applies to other hosts

The criteria and architecture above generalize. For any future host `X` (OpenCode, Cline, Aider, Continue.dev, custom enterprise agent):

- **Today:** shell out to our CLI via `X`'s shell/Bash tool. Works zero-effort.
- **Later:** ship `@vllora/X-plugin` as a per-host wrapper when demand justifies.
- **Never:** duplicate pipeline logic in the plugin. Never fork the CLI per host.

The plugin surface **scales with host count**. The pipeline **stays singular**.

---

## 9. Open questions

1. **OpenClaw plugin API shape** — verify manifest format, skill handler signature, streaming conventions against OpenClaw's actual SDK (not yet read at time of writing).
2. **PDF / file attachment handling** — does OpenClaw standardize on a local-filesystem path for attachments across chat surfaces, or does it vary (WhatsApp vs Slack)? Our `sources` command needs a local path.
3. **Auth bridging for non-Anthropic users** — if an OpenClaw user has configured GPT-4 but no Claude auth, our workers fail. Should the plugin detect + prompt for `claude login` at install time?
4. **Cross-harness project ownership** — if a user starts a workflow in Claude Code and continues from OpenClaw (same machine, same `finetune-project/`), does anything break? (Should be fine — journal is host-agnostic — but worth testing.)

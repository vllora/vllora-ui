# vLLora Finetune — Product Overview

## What is it?

vLLora Finetune turns a plain-English description of what you want your AI model to do into a production-ready finetuned model. No ML expertise required.

You describe the goal. Lucy — your AI finetune assistant — handles the rest: generating training data, evaluating quality, and launching the training job. The entire process happens in one workspace, guided step by step.

---

## The Problem

Most people who want to finetune a model don't know where to start. The questions pile up fast:

- *What data do I need? How much?*
- *Where do I get training examples if I don't have any?*
- *How do I know if my data is actually good enough?*
- *What's the right process — what comes first, what comes after?*

The result: people either give up before starting, or spend weeks manually collecting and formatting data with no confidence it will work.

vLLora removes that uncertainty. You describe what you want your model to do, and an AI assistant walks you through the entire process — generating useful training data, checking its quality, and running the finetune. You don't need to figure out the "right" process. It's already built in.

---

## Two Ways to Start

### Path 1: Start from Scratch

For users who have an idea but no data.

> "I want a chess tutor that explains positions to beginners."

That's all you need. Type your objective and hit **Start Finetune**. Lucy takes over from there.

You can also upload files — PDFs, text documents, internal guides — as knowledge sources. Lucy reads them and uses the content to generate more accurate, domain-specific training data. For example, upload your company's product docs and Lucy will create training examples grounded in your actual product, not generic guesses.

### Path 2: Route Existing Calls

For users who already have an LLM integration in production.

Point your existing API calls at vLLora's endpoint (`localhost:9090/v1/chat/completions`). Every request flows through to your model as normal, but vLLora captures each interaction as a training trace. Lucy then uses these real-world interactions as the foundation for your finetune — enhancing and expanding them into a full training dataset.

---

## What Happens After You Start

You don't need to know how the pipeline works — Lucy handles it. But here's what you'll see happen:

### Lucy proposes a plan

Right after you start, Lucy analyzes your objective and shows you a plan card: what she's going to do, in what order, and roughly how long it will take. You review it and click **Approve & Execute**. Nothing runs without your say-so.

### Your data takes shape

Lucy breaks your objective into topics to ensure broad coverage — you'll see them appear in the workspace. Then she generates training conversations for each topic. If you uploaded reference documents, she grounds the examples in that material. New records stream into your table in real time.

### Quality gets checked

Lucy sets up an evaluator tailored to your objective and scores every training example. You see results broken down by quality — which examples are strong, which are weak, which topics need more work. You can ask Lucy to regenerate or improve anything that doesn't meet the bar.

### Training launches

Once the data looks good, Lucy uploads it and kicks off a finetune job. You pick the base model, Lucy handles the rest. Progress is tracked live in the workspace.

### You get a model

When training completes, you have a finetuned model ID ready to use. Route traffic to it, test it, deploy it.

### You keep improving it

Finetuning isn't a one-shot thing. After you deploy, you can come back — add more training data, re-run evaluation on new examples, tweak topic coverage, and launch another training round. The workspace keeps everything in one place so you can see how your data and scores change over time. Each iteration makes the model better, and Lucy is there to help every time.

---

## Lucy — The AI Assistant

Lucy lives in a sidebar panel alongside your workspace. She's not a chatbot that answers questions — she's an agent that does the work.

Think of Lucy as a knowledgeable ML engineer sitting next to you. You tell her what you want, she figures out how to get there, shows you a plan, and executes it. She explains what she's doing along the way, and every major action — plan approval, data review, training launch — requires your explicit go-ahead.

You can also jump in at any point: ask Lucy to regenerate weak examples, adjust topic coverage, change the evaluation criteria, or add more reference material. She adapts to whatever state the project is in.

---

## The Workspace

The workspace is a single page with everything you need:

- **Left sidebar** — Lucy chat panel with plan cards, progress indicators, and quick actions
- **Main area** — Tabbed view of your dataset: overview, records table, topic coverage, evaluation results, training status
- **Header** — Dataset selector, navigation back to the finetune list

The workspace updates in real time as Lucy works. When she generates data, new records appear in the table. When she runs an evaluation, scores populate. When training starts, progress bars fill.

---

## Key Concepts

### Objective

A natural-language description of what you want your finetuned model to do. This is the seed that drives everything — topic generation, data synthesis, evaluation criteria. The more specific, the better.

### Knowledge Sources

Files you upload (PDFs, text documents, guides) that give Lucy real content to work from. Instead of generating training data from imagination, Lucy reads your materials and creates examples based on actual information. This is especially valuable when accuracy matters — product docs, medical guidelines, legal frameworks, internal playbooks. Upload the source of truth, and the training data stays grounded in it.

### Training Records

Each record is a conversation example: input messages and the ideal output. Records can come from:
- Lucy's synthetic generation
- Captured API traces
- Uploaded JSONL files
- Manual creation

### Topics

A hierarchical taxonomy that organizes your training data. Topics ensure coverage — you don't end up with 500 examples about one thing and zero about another.

### Evaluator (Grader)

An AI-powered scoring system that rates each training record against your objective. It catches problems before they reach training: off-topic examples, incorrect information, wrong tone, incomplete responses.

### Plan

Before Lucy executes anything, she proposes a plan — a list of steps with descriptions and time estimates. You can review, adjust, or approve. This keeps you informed and in control, even when Lucy is doing most of the work.

---

## Example Walkthrough

**Goal:** Build a chess tutor that explains positions to beginners.

You open the finetune page, type *"A chess tutor assistant that analyzes board positions, suggests optimal moves with clear explanations, and adapts to the player's skill level"*, and click **Start Finetune**.

Lucy creates the experiment and immediately shows a plan: she'll organize topics (opening theory, tactics, endgames, etc.), generate ~200 training conversations, set up an evaluator for chess accuracy and teaching quality, score everything, and launch training.

You approve. Lucy gets to work — topics appear, training records stream in, evaluation scores populate. You notice the "endgame techniques" examples could be better, so you tell Lucy. She regenerates them.

Everything looks good. Training starts. A few hours later, you have a finetuned model ID, ready to deploy.

Total hands-on time: ~15 minutes, spread across the session.

---

## Who is it For?

- **People who want to finetune but don't know where to start** — vLLora gives you a clear path from idea to model
- **Developers** who want a custom model for their product but don't have training data
- **Teams** with existing LLM integrations who want to finetune on their real usage patterns

You don't need ML expertise. You don't need to already have data. You just need to know what you want your model to do.

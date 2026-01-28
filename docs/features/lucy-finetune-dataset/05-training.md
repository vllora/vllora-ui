# Finetune Agent - Grader, Dry Run & Training

## Purpose

This module handles Steps 4-7 of the finetune workflow:
- **Step 4: Grader Configuration** - Set up evaluation function
- **Step 5: Dry Run** - Validate before training
- **Step 6: Training** - Execute RFT training
- **Step 7: Deployment** - Deploy the model

---

## Step 4: Grader Configuration

### Purpose

The grader (evaluation function) determines how the model's responses are scored during training. This is critical for RFT.

### Process

**This step REQUIRES user input - never auto-generate without asking.**

1. Ask what makes a good response for their use case
2. Offer LLM-as-Judge or Script options
3. Help construct the configuration
4. Call `configure_grader` with their input
5. Call `test_grader_sample` on 5 samples before proceeding
6. Show results and get confirmation

### Grader Types

| Type | Best For | Description |
|------|----------|-------------|
| **LLM-as-Judge** | Complex evaluation | Uses another LLM to judge response quality |
| **Script** | Deterministic checks | Custom code for specific criteria |

### Example Interaction

```
**Grader Configuration**

Now I need to understand how to evaluate your model's responses.

What makes a response "good" for your use case? Consider:
- Accuracy of information
- Tone and style
- Completeness
- Following specific rules

**Options:**
1. **LLM-as-Judge** - An LLM evaluates responses based on criteria you define
2. **Custom Script** - Write specific rules for evaluation

Which approach would you prefer?
```

After configuration:

```
**Testing Grader**

Let me test the grader on 5 sample records...

[Calling test_grader_sample...]

**Results:**
| Record | Score | Notes |
|--------|-------|-------|
| #1 | 0.85 | Good response, minor formatting |
| #2 | 0.92 | Excellent |
| #3 | 0.45 | Missing key information |
| #4 | 0.78 | Good but verbose |
| #5 | 0.88 | Accurate and concise |

**Average Score:** 0.78

Does this scoring seem right? Would you like to:
1. Proceed to dry run
2. Adjust grader criteria
3. Test on more samples
```

---

## Step 5: Dry Run

### Purpose

Validate the dataset + grader combination before spending money on training.

### Prerequisites

**Before running dry run, you MUST upload the dataset:**

1. Call `upload_dataset` to upload dataset + topic hierarchy + evaluator config
   - Only needs to be done once
   - If already uploaded (`backendDatasetId` exists), skip this step
2. If updating grader after upload, use `sync_evaluator` instead of re-uploading

### Process

1. Call `run_dry_run` with `sample_size=200`
2. Explain metrics clearly
3. Make GO/WARNING/NO-GO recommendation
4. If NO-GO, diagnose issues

### Understanding Dry Run Metrics

| Metric | Healthy Range | Meaning |
|--------|---------------|---------|
| **Mean** | 0.25 - 0.65 | Average score across samples |
| **Std** | 0.10 - 0.25 | Score spread (variance) |
| **%>0** | >10-20% | Tasks base model can't do perfectly |
| **%=1.0** | <30-50% | Tasks already perfect (no learning signal) |

### Verdict Guidelines

| Verdict | Condition | Action |
|---------|-----------|--------|
| **GO** | Metrics in healthy range | Proceed to training |
| **WARNING** | Some concerns | Explain and let user decide |
| **NO-GO** | Problems detected | Must fix before training |

### Diagnosing NO-GO

If dry run fails, diagnose:
- **Grader too harsh?** Mean very low, most scores near 0
- **Grader too lenient?** Most scores are 1.0, no learning signal
- **Data quality issues?** High variance, inconsistent scoring
- **Need to go back?** Adjust topics, add data, or fix grader

### Example Presentation

```
**Dry Run Results**

I ran the dry run on 200 samples.

**Metrics:**
| Metric | Value | Status |
|--------|-------|--------|
| Mean Score | 0.52 | ✓ Healthy |
| Std Dev | 0.18 | ✓ Healthy |
| % > 0 | 85% | ✓ Good signal |
| % = 1.0 | 12% | ✓ Room to improve |

**Verdict: GO ✓**

The metrics look healthy. The model has room to learn without the tasks being too hard or too easy.

Ready to start training?
```

---

## Step 6: Training

### Process

1. Confirm training parameters with user
2. Call `start_training`
3. Monitor progress with `check_training_status`
4. Report metrics as training progresses

### Training Parameters

Confirm with user:
- Number of epochs
- Learning rate
- Batch size
- Any custom settings

### Monitoring Progress

Report periodically:
- Current epoch
- Train/valid reward
- Loss values

### Example

```
**Training Started**

Training has begun with the following configuration:
- Epochs: 3
- Learning Rate: 1e-5
- Batch Size: 8

**Progress:**
| Epoch | Train Reward | Valid Reward | Loss |
|-------|--------------|--------------|------|
| 1/3 | 0.45 | 0.42 | 0.82 |
| 2/3 | 0.62 | 0.58 | 0.54 |
| 3/3 | 0.78 | 0.75 | 0.31 |

Training complete! The model showed consistent improvement.
```

---

## Step 7: Deployment

### Process

1. Show final training results
2. Ask for deployment confirmation
3. Call `deploy_model`
4. Provide model ID and endpoint

### Example

```
**Training Complete!**

**Final Results:**
- Final Train Reward: 0.78
- Final Valid Reward: 0.75
- Total Training Time: 2h 15m

**Model Information:**
- Model ID: ft-abc123
- Base Model: gpt-4.1

Would you like to deploy this model?
```

After deployment:

```
**Model Deployed!**

Your fine-tuned model is now available:
- **Model ID:** ft-abc123
- **Endpoint:** https://api.example.com/v1/models/ft-abc123

You can now use this model in your applications!
```

---

## Key Points

1. **Grader requires user input** - Never auto-generate evaluation criteria
2. **Always run dry run** - Never skip validation
3. **Confirm before training** - Training costs money
4. **Explain metrics** - Users may not understand them
5. **Monitor and report** - Keep users informed during training

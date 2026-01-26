# 10 - Code Reference

[← Back to Index](./00_INDEX.md) | [← Previous](./09_UI_Screens.md)

---

## Validation Functions

### 1. Structural Validation

```python
def validate_structure(record: dict) -> tuple[bool, str]:
    """Validate basic JSON structure for RFT"""
    
    if "messages" not in record:
        return False, "missing_messages_array"
    
    messages = record["messages"]
    if not isinstance(messages, list) or len(messages) == 0:
        return False, "empty_messages"
    
    valid_roles = {"system", "user", "assistant", "tool"}
    
    for i, msg in enumerate(messages):
        if not isinstance(msg, dict):
            return False, f"message_{i}_not_dict"
        
        if "role" not in msg:
            return False, f"message_{i}_missing_role"
        
        if msg["role"] not in valid_roles:
            return False, f"message_{i}_invalid_role"
        
        if "content" not in msg and "tool_calls" not in msg:
            return False, f"message_{i}_missing_content"
    
    # Check for at least one user message
    has_user = any(msg["role"] == "user" for msg in messages)
    if not has_user:
        return False, "no_user_message"
    
    return True, "ok"
```

### 2. Content Validation

```python
def validate_content(record: dict, min_length: int = 10) -> tuple[bool, str]:
    """Validate message content quality"""
    
    for i, msg in enumerate(record["messages"]):
        content = msg.get("content", "")
        
        if content is None:
            return False, f"message_{i}_null_content"
        
        if msg["role"] == "user":
            if not content or not content.strip():
                return False, "user_message_empty"
            
            if len(content.strip()) < min_length:
                return False, "user_message_too_short"
        
        # Check for control characters
        if isinstance(content, str):
            if any(ord(c) < 32 and c not in '\n\r\t' for c in content):
                return False, f"message_{i}_control_characters"
    
    return True, "ok"
```

### 3. Tool Chain Validation

```python
def validate_tool_chain(record: dict) -> tuple[bool, str]:
    """Validate tool call/result consistency"""
    
    messages = record.get("messages", [])
    pending_calls = {}
    
    for i, msg in enumerate(messages):
        # Track assistant tool calls
        if msg["role"] == "assistant" and "tool_calls" in msg:
            for tc in msg["tool_calls"]:
                if "id" not in tc:
                    return False, f"message_{i}_tool_call_missing_id"
                pending_calls[tc["id"]] = tc
        
        # Validate tool results
        if msg["role"] == "tool":
            tool_call_id = msg.get("tool_call_id")
            if not tool_call_id:
                return False, f"message_{i}_tool_result_missing_id"
            if tool_call_id not in pending_calls:
                return False, f"message_{i}_orphan_tool_result"
            del pending_calls[tool_call_id]
    
    return True, "ok"
```

### 4. Grader Compatibility

```python
def validate_grader_compat(record: dict, required_fields: list = None) -> tuple[bool, str]:
    """Validate record works with grader templates"""
    
    if "reference_answer" in record:
        ref = record["reference_answer"]
        if ref is None:
            return False, "reference_answer_null"
    
    if required_fields:
        for field in required_fields:
            if field not in record:
                return False, f"missing_field_{field}"
            if record[field] is None:
                return False, f"null_field_{field}"
    
    return True, "ok"
```

### 5. Length Validation

```python
def validate_length(record: dict, max_tokens: int = 8000) -> tuple[bool, str]:
    """Validate context length"""
    
    total_chars = sum(
        len(msg.get("content", "") or "") 
        for msg in record["messages"]
    )
    estimated_tokens = total_chars // 4  # Rough estimate
    
    if estimated_tokens > max_tokens:
        return False, f"exceeds_max_tokens_{estimated_tokens}"
    
    return True, "ok"
```

### 6. Deduplication

```python
import hashlib

def compute_hash(record: dict) -> str:
    """Compute hash for deduplication"""
    
    user_content = " ".join(
        msg.get("content", "") 
        for msg in record["messages"] 
        if msg.get("role") == "user"
    )
    normalized = " ".join(user_content.split()).lower()
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]
```

---

## Complete Validation Pipeline

```python
import json

def validate_record(record: dict, config: dict = None) -> tuple[bool, list[str]]:
    """Complete validation for a single record"""
    
    config = config or {}
    errors = []
    
    # Structural (mandatory)
    valid, err = validate_structure(record)
    if not valid:
        return False, [err]
    
    # Content (mandatory)
    valid, err = validate_content(record, config.get("min_length", 10))
    if not valid:
        errors.append(err)
    
    # Tool chain (if applicable)
    has_tools = record.get("tools") or any(
        "tool_calls" in m for m in record["messages"]
    )
    if has_tools:
        valid, err = validate_tool_chain(record)
        if not valid:
            errors.append(err)
    
    # Grader compat (mandatory)
    valid, err = validate_grader_compat(record, config.get("required_fields"))
    if not valid:
        errors.append(err)
    
    # Length (recommended)
    valid, err = validate_length(record, config.get("max_tokens", 8000))
    if not valid:
        errors.append(err)
    
    return len(errors) == 0, errors


def run_hygiene_filter(input_file: str, output_file: str, config: dict = None) -> dict:
    """Run full hygiene filter on dataset"""
    
    stats = {
        "total": 0,
        "valid": 0,
        "rejected": 0,
        "errors_by_type": {},
        "duplicates": 0
    }
    
    seen_hashes = set()
    valid_records = []
    
    with open(input_file) as f:
        for line in f:
            stats["total"] += 1
            
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                stats["rejected"] += 1
                stats["errors_by_type"]["invalid_json"] = \
                    stats["errors_by_type"].get("invalid_json", 0) + 1
                continue
            
            # Validate
            is_valid, errors = validate_record(record, config)
            
            if not is_valid:
                stats["rejected"] += 1
                for err in errors:
                    stats["errors_by_type"][err] = \
                        stats["errors_by_type"].get(err, 0) + 1
                continue
            
            # Deduplicate
            h = compute_hash(record)
            if h in seen_hashes:
                stats["duplicates"] += 1
                continue
            seen_hashes.add(h)
            
            stats["valid"] += 1
            valid_records.append(record)
    
    # Write output
    with open(output_file, 'w') as f:
        for r in valid_records:
            f.write(json.dumps(r) + '\n')
    
    return stats
```

---

## Synthetic Validation

```python
import re

def validate_synthetic_quality(record: dict, seed_hashes: set) -> tuple[bool, str]:
    """Validate synthetic prompt quality"""
    
    user_content = ""
    for msg in record["messages"]:
        if msg["role"] == "user":
            user_content = msg.get("content", "")
    
    # Check for gibberish
    if not user_content or len(user_content.strip()) < 10:
        return False, "too_short"
    
    # Check for LLM artifacts
    bad_patterns = [
        r'I cannot|I\'m sorry|As an AI',
        r'\[INSERT|TODO|PLACEHOLDER\]',
        r'Example \d+:',
    ]
    for pattern in bad_patterns:
        if re.search(pattern, user_content, re.IGNORECASE):
            return False, "llm_artifact"
    
    # Check duplicate of seed
    h = compute_hash(record)
    if h in seed_hashes:
        return False, "duplicate_of_seed"
    
    return True, "ok"
```

---

## Dry Run Execution

```python
import openai
import statistics

def run_dry_run(prompts: list, grader_config: dict, sample_size: int = 300) -> dict:
    """Execute dry run validation"""
    
    # Sample prompts
    import random
    samples = random.sample(prompts, min(sample_size, len(prompts)))
    
    scores = []
    
    for prompt in samples:
        # Generate response
        response = openai.chat.completions.create(
            model="o4-mini",
            messages=prompt["messages"]
        )
        output = response.choices[0].message.content
        
        # Score with grader (simplified)
        score = evaluate_with_grader(output, prompt, grader_config)
        scores.append(score)
    
    # Compute statistics
    result = {
        "samples": len(scores),
        "mean": statistics.mean(scores),
        "std": statistics.stdev(scores) if len(scores) > 1 else 0,
        "min": min(scores),
        "max": max(scores),
        "median": statistics.median(scores)
    }
    
    # Determine verdict
    if result["mean"] < 0.10:
        result["verdict"] = "FAIL"
        result["reason"] = "Mean too low - use SFT first"
    elif result["mean"] > 0.90:
        result["verdict"] = "WARN"
        result["reason"] = "Mean too high - RFT may not help"
    elif result["std"] < 0.10:
        result["verdict"] = "FAIL"
        result["reason"] = "No variance - grader doesn't differentiate"
    else:
        result["verdict"] = "GO"
        result["reason"] = "Ready for training"
    
    return result
```

---

[Next: Appendix →](./11_Appendix.md)

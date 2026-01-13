# Datasets Page - Product Guide

## Overview

The Datasets page (`/datasets`) provides a unified interface for managing collections of LLM trace data. Users can organize spans from their traces into datasets for analysis, fine-tuning, or evaluation purposes.

**Key Value Props:**
- Collect and organize LLM interactions from traces
- Categorize with topics for easy filtering
- Edit extracted data for fine-tuning preparation
- AI-assisted organization with Lucy

---

## Page Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              /datasets                                        │
├───────────────────────────┬──────────────────────────────────────────────────┤
│                           │                                                  │
│   Lucy Chat Panel         │        Datasets List Panel                       │
│   (384px fixed width)     │        (flexible width, scrollable)              │
│                           │                                                  │
│   ┌───────────────────┐   │   ┌──────────────────────────────────────────┐   │
│   │ Lucy Assistant    │   │   │ Datasets              [🔍 Search...]      │   │
│   │ BETA              │   │   │ Manage and monitor...    [+ New Dataset] │   │
│   │ [+ New Chat]      │   │   ├──────────────────────────────────────────┤   │
│   ├───────────────────┤   │   │ ▼ Safety Test Suite          124 records │   │
│   │                   │   │   │   openai  span_1  Topic: SAFETY          │   │
│   │  Chat with Lucy   │   │   │   openai  span_2  Topic: JAILBREAK       │   │
│   │  for help         │   │   │   ...                                    │   │
│   │                   │   │   │             See all 124 records →        │   │
│   │                   │   │   │                                          │   │
│   │                   │   │   │ ▶ RAG Accuracy Logs        1,402 records │   │
│   └───────────────────┘   │   │ ▶ Latency Benchmarks          45 records │   │
│                           │   └──────────────────────────────────────────┘   │
└───────────────────────────┴──────────────────────────────────────────────────┘
```

---

## Features

### Dataset Management

| Feature | Description |
|---------|-------------|
| Create Dataset | Click "+ New Dataset", enter name |
| Rename Dataset | Click "⋯" menu → "Rename" |
| Delete Dataset | Click "⋯" menu → "Delete" (with confirmation) |
| Export Dataset | Export as JSON file with all records |
| Search Datasets | Filter by name in the search bar |

### Record Management

| Feature | Description |
|---------|-------------|
| View Records | Click dataset row to expand and see records |
| Edit Topic | Click topic text for inline editing |
| Edit Data | Click data preview to open JSON editor |
| Delete Record | Click trash icon (with confirmation) |
| Bulk Select | Checkbox selection for multiple records |
| Bulk Delete | Delete all selected records |
| Bulk Topic | Assign same topic to selected records |

### Sorting

Records can be sorted by:
- **Timestamp** (default) - When the record was added
- **Topic** - Alphabetical order (empty topics last)
- **Evaluation** - By score (unevaluated last)

Access via toolbar dropdown or clickable column headers.

### Lucy AI Assistant

Lucy is available in the left panel to help with:
- Listing and describing datasets
- Analyzing records
- Organizing and categorizing data
- Answering questions about features

---

## User Flows

### Adding Spans to a Dataset

**From Traces/Threads View:**

1. Click "Select" button to enable selection mode
2. Check boxes appear on span rows
3. Select one or more spans
4. Click "Add to Dataset" in the floating action bar
5. Choose "New Dataset" or "Existing Dataset"
6. Optionally enter a topic
7. Click "Add X Spans"
8. Confirmation toast appears

**From Span Detail View:**

1. Open any span to see its details
2. Scroll to the footer section
3. Click "Add to Dataset" button
4. Same dialog flow as above

### Editing Record Data

1. Navigate to dataset detail view
2. Find the record you want to edit
3. Click on the data preview text
4. Monaco JSON editor opens in a dialog
5. Edit the JSON data
6. Editor validates in real-time (shows errors if invalid)
7. Click "Save Changes"
8. Confirmation toast appears

### Viewing Dataset Membership

When viewing a span's details, the footer shows which datasets it belongs to:
- Up to 3 dataset badges shown
- "+N more" tooltip if in more datasets
- Click "Add to Dataset" to add to more

---

## Data Structure

### What Gets Stored

When a span is added to a dataset, the following is extracted:

**Input:**
- Messages (the prompt/conversation)
- Tools (if tool use was enabled)
- Tool choice settings

**Output:**
- Response message
- Tool calls (if any)
- Finish reason

This **DataInfo** structure is stored instead of the full span, making it suitable for fine-tuning exports.

### Record Fields

Each record has:
- **ID**: Unique identifier
- **Data**: The extracted DataInfo
- **Span ID**: Reference to original span (for deduplication)
- **Topic**: Optional category (e.g., "safety", "math", "coding")
- **Evaluation**: Score and feedback (for future use)
- **Timestamps**: Created and last updated times

---

## UI States

### Loading
- Initial page load shows spinner
- Record loading shows per-dataset spinner

### Empty States
- No datasets: Suggests adding spans from traces
- No records in dataset: Shows empty message
- No search results: Shows "No matches" message

### Errors
- Database errors show error message
- Failed operations show toast notification

---

## Tips

1. **Use topics** to categorize records for easy filtering later
2. **Bulk operations** are faster than editing one at a time
3. **Export** datasets before making major changes as backup
4. **Lucy** can help explain features or analyze your data
5. **Click column headers** to quickly sort records

---

## Limitations

- **Storage**: Uses browser IndexedDB (local only, ~5-10MB limit)
- **No sync**: Data doesn't sync across browsers/devices
- **Evaluation**: Scoring feature is prepared but not yet functional
- **Import**: Can export but not import datasets (future feature)

---

## Related Features

- **Traces Page**: Where you select spans to add
- **Span Detail**: Shows which datasets a span is in
- **Lucy Agent**: AI assistant available across pages

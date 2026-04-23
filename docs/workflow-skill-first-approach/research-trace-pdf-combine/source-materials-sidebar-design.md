# Source Materials Sidebar — Design Document

> **Purpose**: Restructure the Source Materials sidebar to handle multiple PDFs and trace files with type-appropriate children.
> **Date**: 2026-04-15
> **Status**: Implementing

## Problem

The current sidebar shows all sources as a flat list. When there are multiple PDFs and trace files, users can't distinguish types or find analysis artifacts. Trace-specific views (Training Impact, Priority, Grader Hints, Seed Queries) were previously tabs inside the trace viewer — now they're sidebar children, but only under the first OTel Traces source. PDFs have no children even though they show content differently.

## Research Summary

| Platform | Pattern | Lesson |
|----------|---------|--------|
| Figma | Group by type, type-specific children | Don't force uniform child structure |
| VS Code | Filesystem mirror | Works when users know the structure |
| W&B | Artifacts grouped by type | Each type has its own metadata schema |
| MLflow | Flat artifact tree | Mirrors actual directory — abstract away |
| Nielsen Norman | Task mental model > storage model | Group by what users do, not how it's stored |

**Key finding**: PDFs and traces produce fundamentally different artifacts. Forcing identical children creates empty/meaningless nodes.

## Design

### Sidebar Structure

**Single PDF + Single Trace (common case):**
```
SOURCE MATERIALS  2
  All Sources                     2
  retail-customer-service-policy  92    ← PDF: click → see extracted parts
  Production Traces              460    ← Trace: click → see conversations
    Training Impact                     ← trace-only children
    Priority & Coverage
    Grader Hints
    Seed Queries
```

**Multiple PDFs + Multiple Traces:**
```
SOURCE MATERIALS  5
  All Sources                     5
  Documents                            ← group header (collapsible)
    retail-policy.pdf             92
    employee-handbook.pdf         45
    product-catalog.pdf           30
  Production Traces                    ← group header (collapsible)
    customer-support-logs        460
      Training Impact
      Priority & Coverage
      Grader Hints
      Seed Queries
    internal-qa-traces           120
      Training Impact
      Priority & Coverage
      Grader Hints
      Seed Queries
```

**PDF-only mode (no traces):**
```
SOURCE MATERIALS  2
  All Sources                     2
  retail-policy.pdf              92
  employee-handbook.pdf          45
```
No Training Impact or analysis children — those are trace-specific.

### Rules

1. **PDFs are leaf nodes** — clicking shows extracted parts in content area. No children needed.
2. **Trace sources get 4 children** — Training Impact, Priority & Coverage, Grader Hints, Seed Queries. Each trace source gets its own set.
3. **Group headers appear when >1 source of same type** — "Documents" header for multiple PDFs, "Production Traces" header for multiple trace files.
4. **Single source of a type = no group header** — just the source directly.
5. **Don't mirror filesystem** — no `pdfs/` or `knowledge/` in the sidebar.
6. **Source type detection** — use `traceBundleId` (non-null = trace) from the KnowledgeSource model.
7. **Badge shows parts count** for PDFs, conversation count for traces.

### Type Detection

```typescript
const isTraceSource = (src: KnowledgeSource) => 
  src.traceBundleId != null || src.metadata?.kind === "otel-trace";
```

### Implementation

Only `DatasetExplorer.tsx` changes — split sources into `docSources` and `traceSources`, render with type-appropriate structure.

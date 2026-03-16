# Entity Relationships: Knowledge, Topics, and Records

## Overview

The finetune pipeline produces three core entities -- knowledge sources/parts, topics, and records -- connected through explicit relationships. Understanding these relationships enables traceability: when a topic scores poorly in evaluation, you can trace back through relations to the source knowledge parts and original document.

## Core Entities

### Knowledge Sources and Parts

- **KnowledgeSource**: represents an uploaded document (PDF, text, etc.)
- **KnowledgeSourcePart**: extracted content from a source, typed as `text`, `table`, or `image`
- Key fields: `id`, `reference_id`, `source_id`, `type`, `content`, `extraction_path`, `extraction_metadata` (pages), `content_metadata`
- Stored in gateway SQLite: `knowledge_sources` and `knowledge_source_parts` tables

### Topics

- Flat array with `parent_id` for hierarchy (not nested)
- Key fields: `id`, `reference_id`, `name`, `parent_id`, `system_prompt`
- Derived from document structure and/or objective
- Stored in: `workflow_topics` table

### Records (Training Data)

- JSONL format with messages array
- Key fields: `id`, `topic` (leaf topic path), `data.input.messages`
- Naming convention encodes topic: "billing-refunds-001"
- Stored in: `workflow_records` table

## Relationship Architecture

### Record -> Topic

- Link: `record.topic` field contains leaf topic path (e.g., "billing/refunds")
- Also linked via `topic_id` FK in the database
- Direction: every record belongs to exactly one leaf topic

### Topic -> Knowledge Parts (Topic-Source Relations)

- Link: bridge table `topic_source_relations` with `{topic_identifier, part_identifier}`
- Built by relation-builder subagent during skill Step 3
- Uses iterative retrieve-and-verify per leaf topic against `parts-index.json`
- Uploaded via `POST /finetune/workflows/{id}/topics/relations`
- A topic can link to many parts, a part can link to many topics (many-to-many)

### Knowledge Part -> Source

- Link: `source_id` FK on each part
- A source has many parts, each part belongs to one source

### Part -> Original Document Location

- `extraction_path`: JSON-encoded heading hierarchy (e.g., `["3 Model Architecture", "3.2 Attention"]`)
- `extraction_metadata`: page numbers, `doc_item` JSON pointer back to Docling output
- Enables locating exact content within original PDF

## Data Flow (Skill Pipeline)

```
Step 2: Document Extraction
  PDF/Documents -> Docling Serve -> knowledge_parts.json + parts-index.json
  Upload: POST /knowledge (multipart with file) -> POST /knowledge/{ks_id}/parts

Step 3: Topic Design + Relation Building
  parts-index.json + objective -> topics.json
  relation-builder subagent -> relations.json [{topic_identifier, part_identifier}]
  Upload: POST /topics, POST /topics/relations

Step 4: Training Data Generation
  topics + system_prompts + knowledge context -> training.jsonl
  Upload: POST /records

Step 5: Grader Configuration
  Evaluation function -> PATCH /evaluator

Step 6: Package and Upload
  All data uploaded to gateway, then packaged for cloud training
```

## Key Identifier Mapping

| Entity | ID (internal) | Reference ID (external) | Used in relations via |
|--------|--------------|------------------------|----------------------|
| Knowledge Source | UUID (server) | e.g., "doc-001" | -- |
| Source Part | UUID (server) | e.g., "p-001" (original skill id) | `part_identifier` |
| Topic | UUID (server) | e.g., "billing" (original skill id) | `topic_identifier` |
| Record | custom (e.g., "billing-001") | -- | `topic` field |

Important: When the skill uploads parts, the original `id` becomes `reference_id` on the server (server assigns UUIDs). Relations use either id or reference_id for lookup.

## UI Visualization Status

### Fully Visualized

**Record -> Topic**

- Records table: colored topic badges per row
- Record detail dialog: "Assigned Topic" with hierarchy breadcrumb
- Canvas view: topic hierarchy graph with record count badges
- Explorer tree: topics under `data/` with count badges
- Coverage distribution: bar chart showing topic balance

**Knowledge Part -> Source**

- Explorer tree: `knowledge/` folder with source subfolders containing typed parts (text/table/image icons)
- Knowledge Part Viewer: source name breadcrumb in header
- Knowledge Sources Panel: expandable sources with part listings and global search

**Part -> Original Document**

- Part viewer header: page range badges (e.g., "page:1-2")
- Source viewer: "Show original" toggle for side-by-side PDF preview via iframe
- Backend endpoint: `GET /knowledge/{ks_id}/file` serves original uploaded file

### Gap: Topic -> Knowledge Parts

- Data exists: `TopicHierarchyNode` has `sourceChunkRefs` (array of "sourceId:chunkId" strings)
- Relations uploaded to gateway via API
- NOT visualized: no UI shows which knowledge parts inform a given topic
- Potential enhancement: show linked source parts on topic detail view, enable navigation from topic to relevant knowledge sections

## Traceability Chain

The full chain enables root cause analysis for evaluation results:

```
Poor eval score on record
  -> record.topic identifies the topic
  -> topic_source_relations shows which knowledge parts informed that topic
  -> knowledge_source_part shows the extracted content + extraction_path + pages
  -> knowledge_source links to original document
  -> "Show original" displays the actual PDF at the relevant section
```

This traceability is critical for improving training data quality: if a topic consistently scores low, you can check whether the source material is sufficient, whether extraction captured the right content, and whether the generated records faithfully represent the source.

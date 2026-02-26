/**
 * Lucy Message Utilities
 *
 * Shared utility functions for Lucy message rendering.
 */

import { DistriMessage, DistriEvent, isDistriMessage } from '@distri/core';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedContent {
  text: string;
  imageParts: Array<{ part_type: 'image'; data: any }>;
}

// ============================================================================
// Content Extraction
// ============================================================================

export function extractContent(message: DistriMessage | DistriEvent): ExtractedContent {
  if (!isDistriMessage(message)) {
    return { text: '', imageParts: [] };
  }

  const distriMessage = message as DistriMessage;
  const textParts =
    distriMessage.parts
      ?.filter((p) => p.part_type === 'text')
      ?.map((p) => (p as { part_type: 'text'; data: string }).data)
      ?.filter((text) => text && text.trim()) || [];

  const imageParts = (distriMessage.parts?.filter((p) => p.part_type === 'image') ||
    []) as Array<{
    part_type: 'image';
    data: any;
  }>;

  return {
    text: textParts.join('').trim(),
    imageParts,
  };
}

// ============================================================================
// Timestamp Formatting
// ============================================================================

export function formatTimestamp(timestamp?: string | number): string {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1m ago';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1h ago';
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// Friendly Tool Messages
// ============================================================================

export function getFriendlyToolMessage(toolName: string, input: any): string {
  switch (toolName) {
    // Observability tools
    case 'search':
    case 'search_traces':
    case 'query_spans':
      return `Searching "${input?.query || ''}"`;
    case 'analyze':
    case 'analyze_error':
      return 'Analyzing traces...';
    case 'get_span_details':
      return 'Getting span details...';
    case 'filter_spans':
      return 'Filtering spans...';
    case 'fetch_spans_summary':
      return 'Fetching spans summary...';

    // Plan tools
    case 'propose_plan':
      return 'Proposing plan...';
    case 'save_plan':
      return 'Saving plan...';
    case 'adjust_plan':
      return 'Adjusting plan...';
    case 'execute_plan':
      return 'Executing plan...';

    // Topic tools
    case 'generate_topics':
      return 'Generating topics...';
    case 'get_topic_hierarchy':
      return 'Loading topic hierarchy...';
    case 'adjust_topic_hierarchy':
      return 'Adjusting topic hierarchy...';
    case 'apply_topic_hierarchy':
      return 'Applying topic hierarchy...';

    // Data generation tools
    case 'generate_synthetic_data':
      return input?.topic_name
        ? `Generating data for "${input.topic_name}"...`
        : 'Generating training data...';
    case 'generate_initial_data':
      return 'Generating initial training data...';
    case 'generate_preview':
      return 'Generating data preview...';
    case 'generate_record_variants':
      return 'Creating record variants...';
    case 'categorize_records':
      return 'Categorizing records...';
    case 'validate_records':
      return 'Validating records...';
    case 'analyze_coverage':
      return 'Analyzing topic coverage...';
    case 'update_record':
      return 'Updating record...';

    // Evaluation tools
    case 'configure_grader':
      return 'Configuring evaluation grader...';
    case 'generate_grader':
      return 'Generating evaluation grader...';
    case 'test_grader_sample':
      return 'Testing grader on sample...';
    case 'sync_evaluator':
      return 'Syncing evaluator config...';
    case 'run_evaluation':
      return 'Running evaluation...';

    // Training tools
    case 'start_training':
      return 'Starting fine-tune training...';
    case 'check_training_status':
      return 'Checking training status...';
    case 'upload_dataset':
      return 'Uploading training data...';
    case 'deploy_model':
      return 'Deploying model...';

    // Knowledge source tools
    case 'upload_knowledge_source':
      return 'Uploading document...';
    case 'list_knowledge_sources':
      return 'Listing documents...';
    case 'extract_topics_from_source':
      return 'Extracting topics from document...';
    case 'search_knowledge':
      return `Searching knowledge base${input?.query ? ` for "${input.query}"` : ''}...`;
    case 'analyze_knowledge_sources':
      return 'Analyzing documents...';

    // Dataset state tools
    case 'get_dataset_state':
      return 'Loading experiment state...';
    case 'get_dataset_records':
      return 'Loading records...';
    case 'update_objective':
      return 'Updating objective...';
    case 'regenerate_readme':
      return 'Regenerating README...';

    // Workflow tools
    case 'start_finetune_workflow':
      return 'Starting workflow...';
    case 'get_workflow_status':
      return 'Checking workflow status...';
    case 'advance_to_step':
      return input?.step ? `Advancing to ${input.step.replace(/_/g, ' ')}...` : 'Advancing workflow...';
    case 'rollback_to_step':
      return 'Rolling back workflow...';
    case 'write_todos':
      return 'Updating task list...';

    default:
      return `Running ${toolName}...`;
  }
}

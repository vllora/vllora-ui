/**
 * SourcesProcessingMessage
 *
 * Component that shows "documents processing" message and auto-triggers setup plan when done.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { emitter } from '@/utils/eventEmitter';
import * as knowledgeDB from '@/services/knowledge-sources-db';

interface SourcesProcessingMessageProps {
  datasetId: string;
  originalMessage?: string;
}

export function SourcesProcessingMessage({
  datasetId,
  originalMessage,
}: SourcesProcessingMessageProps) {
  const [sourcesReady, setSourcesReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [hasAutoSwitchedToDocsTab, setHasAutoSwitchedToDocsTab] = useState(false);

  // Auto-switch to Docs tab on first render (only once)
  // This helps user see the document processing progress
  useEffect(() => {
    if (!hasAutoSwitchedToDocsTab && datasetId && !sourcesReady) {
      setHasAutoSwitchedToDocsTab(true);
      console.log('[SourcesProcessingMessage] Auto-switching to Docs tab');
      emitter.emit('vllora_open_drawer', { type: 'docs' });
    }
  }, [hasAutoSwitchedToDocsTab, datasetId, sourcesReady]);

  // Check if all sources are ready and auto-trigger plan generation
  const checkSources = useCallback(async () => {
    if (!datasetId) return;
    try {
      const sources = await knowledgeDB.getKnowledgeSourcesByDataset(datasetId);
      const processing = sources.filter((s) => s.status === 'processing');
      if (processing.length === 0 && sources.length > 0) {
        setSourcesReady(true);
      }
    } catch (error) {
      console.error('[SourcesProcessingMessage] Error checking sources:', error);
    }
  }, [datasetId]);

  // Auto-trigger setup plan generation when sources become ready
  useEffect(() => {
    if (sourcesReady && !autoTriggered && datasetId) {
      setAutoTriggered(true);
      console.log('[SourcesProcessingMessage] Documents ready, auto-triggering setup plan');
      // Emit event to trigger Lucy to generate the setup plan
      emitter.emit('vllora_lucy_prompt', {
        prompt: 'My documents have finished processing. Please use the propose_setup_plan tool to create a comprehensive setup plan based on the uploaded documents.',
      });
    }
  }, [sourcesReady, autoTriggered, datasetId]);

  // Listen for knowledge source updates
  useEffect(() => {
    const handleUpdate = ({ datasetId: updatedId }: { datasetId: string }) => {
      console.log('[SourcesProcessingMessage] Received update for dataset:', updatedId);
      if (updatedId === datasetId) {
        checkSources();
      }
    };

    emitter.on('vllora_knowledge_source_updated', handleUpdate);

    // Also check immediately in case we missed the event
    checkSources();

    return () => {
      emitter.off('vllora_knowledge_source_updated', handleUpdate);
    };
  }, [datasetId, checkSources]);

  // Manual refresh handler
  const handleManualCheck = async () => {
    setChecking(true);
    await checkSources();
    setChecking(false);
  };

  // If sources are now ready, show success message (auto-trigger already sent)
  if (sourcesReady) {
    return (
      <div className=" rounded-lg bg-green-500/10 p-4">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-medium">Documents ready!</span>
        </div>
        <div className="text-[12px] text-muted-foreground mt-2">
          Your documents have finished processing. Generating setup plan...
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-muted/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm font-medium">Documents still processing</span>
        </div>
        <button
          onClick={handleManualCheck}
          disabled={checking}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="text-[12px] text-muted-foreground mt-2">
        {originalMessage || 'Please wait for document processing to complete, then try again.'}
      </div>
    </div>
  );
}

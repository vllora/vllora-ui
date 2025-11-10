import { useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { ConversationWindow } from '@/components/chat/conversation/ConversationWindow';
import { TracesRightSidebar } from '@/components/chat/TracesRightSidebar';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

export const ConversationAndTraces = () => {
  const [searchParams] = useSearchParams();
  const { isDefaultProject } = ProjectsConsumer();
  const navigate = useNavigate();
  const { selectedThreadId, threads, projectId, isRightSidebarCollapsed, updateThread, selectedThread, setIsRightSidebarCollapsed } = ThreadsConsumer();
  const {refreshRuns, clearAll} = ChatWindowConsumer();
  const isCurrentThreadDraft = useMemo(() => {
    if (selectedThread) {
      return selectedThread.is_from_local
    }
    return true;
  }, [selectedThread])

  useEffect(() => {
    if (selectedThread) {
      if(!selectedThread.is_from_local) {
        refreshRuns();
      } else {
        clearAll();
      }
    }
  }, [selectedThread?.thread_id, selectedThread?.is_from_local, refreshRuns]);
  const handleModelChange = useCallback((modelId: string) => {
    // Update URL with new model
    const params = new URLSearchParams(searchParams);
    params.set('model', modelId);
    if (selectedThreadId) {
      params.set('threadId', selectedThreadId);
      // Update the thread's input_models
      const thread = threads.find((t) => t.thread_id === selectedThreadId);
      if (thread) {
        const updatedModels = thread.input_models.includes(modelId)
          ? thread.input_models
          : thread.is_from_local ? [modelId] : [...thread.input_models, modelId];
        updateThread(selectedThreadId, {
          input_models: updatedModels,
        });
      }
    }
    if (projectId && !isDefaultProject(projectId)) {
      params.set('projectId', projectId);
    } else {
      params.delete('projectId');
    }
    navigate(`/chat?${params.toString()}`);
  }, [selectedThreadId, threads, searchParams, projectId, updateThread, navigate, isDefaultProject]);

  if (!selectedThreadId || !projectId) {
    return null;
  }
  return <div className="flex flex-1 flex-row">
    <div className="flex-1 flex flex-col overflow-hidden w-[20vw]">
      <ConversationWindow
        threadId={selectedThreadId}
        threadTitle={threads.find((t) => t.thread_id === selectedThreadId)?.title}
        projectId={projectId}
        widgetId={`chat-${selectedThreadId}`}
        onModelChange={handleModelChange}
        isDraft={isCurrentThreadDraft}
      />
    </div>

    {/* Right Sidebar - Traces */}
    <TracesRightSidebar
      threadId={selectedThreadId}
      isCollapsed={isRightSidebarCollapsed}
      onToggle={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
    />
  </div>
}
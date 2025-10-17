import { ThreadsProvider } from '@/contexts/ThreadsContext';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ChatPage } from './content';
import { useCallback, useState, useEffect } from 'react';
import { DebugPage } from '../debug';
import { TabSelectionHeader } from '@/components/TabSelectionHeader';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';

export function ChatPageWrapper() {
  const { currentProjectId } = ProjectsConsumer();

  if (!currentProjectId) {
    return null;
  }

  return (
    <ThreadsProvider projectId={currentProjectId}>
      <ChatPage />
    </ThreadsProvider>
  );
}


export function ChatAndDebugPageWrapper() {
  const { currentProjectId, isDefaultProject } = ProjectsConsumer();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize from URL or default to 'threads'
  const tabFromUrl = searchParams.get('tab') || 'threads';
  const [currentTab, setCurrentTab] = useState<string>(tabFromUrl);

  // Sync state with URL when it changes
  useEffect(() => {
    setCurrentTab(tabFromUrl);
  }, [tabFromUrl]);

  if (!currentProjectId) {
    return null;
  }

  const handleProjectChange = useCallback((newProjectId: string) => {
    localStorage.setItem('currentProjectId', newProjectId);
    // Update the project_id query param while keeping current path (omit if default)
    const params = new URLSearchParams(searchParams);
    if (isDefaultProject(newProjectId)) {
      params.delete('project_id');
    } else {
      params.set('project_id', newProjectId);
    }
    const queryString = params.toString();
    navigate(`${location.pathname}${queryString ? '?' + queryString : ''}`);
  }, [location.pathname, navigate, searchParams, isDefaultProject]);

  return <div className="flex flex-col h-full flex-1">
    <TabSelectionHeader onProjectChange={handleProjectChange} currentTab={currentTab} onTabChange={setCurrentTab} />

    {/* Content Area */}
    {currentTab === "threads" ? <ChatPageWrapper /> : <DebugPage />}
  </div>
}

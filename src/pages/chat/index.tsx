import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useCallback, useState, useEffect } from 'react';
import { TabSelectionHeader } from '@/components/TabSelectionHeader';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { TracesPageProvider } from '@/contexts/TracesPageContext';
import { TracesPageContent } from './traces/content';
import { ThreadPage } from './threads';

export function ThreadsAndTracesPage() {
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

  return (
    <PageContent
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      handleProjectChange={handleProjectChange}
      projectId={currentProjectId}
    />
  );
}

function PageContent({
  currentTab,
  setCurrentTab,
  handleProjectChange,
  projectId,
}: {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  handleProjectChange: (projectId: string) => void;
  projectId: string;
}) {
  return (
    <div className="flex flex-col h-full flex-1">
      <TabSelectionHeader
        onProjectChange={handleProjectChange}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
      />

      {/* Content Area */}
      {currentTab === "threads" ? (
        <ThreadPage />
      ) : (
        <TracesPageProvider projectId={projectId}>
          <TracesPageContent />
        </TracesPageProvider>
      )}
    </div>
  );
}

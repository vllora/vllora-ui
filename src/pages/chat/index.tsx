import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useCallback, useState, useEffect } from 'react';
import { TabSelectionHeader } from '@/components/TabSelectionHeader';
import { useSearchParams } from "react-router";
import { TracesPageProvider } from '@/contexts/TracesPageContext';
import { TracesPageContent } from './traces/content';
import { ThreadPage } from './threads';

export function ThreadsAndTracesPage(props: {
  accountInfoComponent?: React.ReactNode;
}) {
  const { accountInfoComponent } = props;
  const { currentProjectId } = ProjectsConsumer();
  const [searchParams] = useSearchParams();

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
  }, []);

  return (
    <PageContent
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      handleProjectChange={handleProjectChange}
      projectId={currentProjectId}
      accountInfoComponent={accountInfoComponent}
    />
  );
}

function PageContent({
  currentTab,
  setCurrentTab,
  handleProjectChange,
  projectId,
  accountInfoComponent,
}: {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  handleProjectChange: (projectId: string) => void;
  projectId: string;
  accountInfoComponent?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full flex-1">
      <TabSelectionHeader
        onProjectChange={handleProjectChange}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        accountInfoComponent={accountInfoComponent}
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

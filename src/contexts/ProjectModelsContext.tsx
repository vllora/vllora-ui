import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { fetchProjectModels } from '@/services/models-api';
import { ModelInfo } from '@/types/models';
import { ProjectsConsumer } from './ProjectContext';

export type ProjectModelsContextType = ReturnType<typeof useProjectModels>;

const LocalModelsContext = createContext<ProjectModelsContextType | undefined>(undefined);

export function useProjectModels() {
  const {currentProjectId} = ProjectsConsumer();
  const { data, loading, error, run: refetchModels } = useRequest<ModelInfo[], []>(
    () => fetchProjectModels({ projectId: currentProjectId }),
    {
      refreshDeps: [currentProjectId],
      onError: (err) => {
        toast.error('Failed to load local models', {
          description: err.message || 'An error occurred while loading local models',
        });
      },
    }
  );

  return {
    models: data || [],
    loading,
    error,
    refetchModels,
  };
}

export function ProjectModelsProvider({
  children
}: {
  children: ReactNode;
}) {
  const value = useProjectModels();
  return <LocalModelsContext.Provider value={value}>{children}</LocalModelsContext.Provider>;
}

export function ProjectModelsConsumer() {
  const context = useContext(LocalModelsContext);
  if (context === undefined) {
    throw new Error('ProjectModelsConsumer must be used within a ProjectModelsProvider');
  }
  return context;
}

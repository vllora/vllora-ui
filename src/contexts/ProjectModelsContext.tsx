import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { fetchProjectModels } from '@/services/models-api';
import { ModelInfo } from '@/types/models';

export type ProjectModelsContextType = ReturnType<typeof useProjectModels>;

const LocalModelsContext = createContext<ProjectModelsContextType | undefined>(undefined);

export function useProjectModels(projectId?: string) {
  const { data, loading, error, run: refetchModels } = useRequest<ModelInfo[], []>(
    () => fetchProjectModels({ projectId }),
    {
      ready: !!projectId,
      refreshDeps: [projectId],
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
  projectId,
  children
}: {
  projectId?: string;
  children: ReactNode;
}) {
  const value = useProjectModels(projectId);
  return <LocalModelsContext.Provider value={value}>{children}</LocalModelsContext.Provider>;
}

export function ProjectModelsConsumer() {
  const context = useContext(LocalModelsContext);
  if (context === undefined) {
    throw new Error('ProjectModelsConsumer must be used within a ProjectModelsProvider');
  }
  return context;
}

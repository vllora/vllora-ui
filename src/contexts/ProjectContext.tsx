import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { listProjects, type Project } from '@/services/projects-api';

export type ProjectContextType = ReturnType<typeof useProject>;

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function useProject() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: projects = [], loading, error, run: refetchProjects } = useRequest(listProjects, {
    onError: (err) => {
      toast.error('Failed to load projects', {
        description: err.message || 'An error occurred while loading projects',
      });
    },
  });

  // Derive current project from URL projectId
  const currentProject = useMemo(() => {
    if (!projectId || projects.length === 0) return null;
    return projects.find((p) => p.id === projectId) || null;
  }, [projectId, projects]);

  return {
    projects,
    loading,
    error,
    refetchProjects,
    currentProject,
    currentProjectId: projectId,
  };
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const value = useProject();
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function ProjectsConsumer() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('ProjectsConsumer must be used within a ProjectProvider');
  }
  return context;
}

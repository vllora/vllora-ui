import { createContext, useContext, useMemo, useCallback, ReactNode, useState } from 'react';
import { useRequest } from 'ahooks';
import { useSearchParams, useParams } from "react-router";
import { toast } from 'sonner';
import { listProjects } from '@/services/projects-api';

export type ProjectContextType = ReturnType<typeof useProject>;

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function useProject(props: {
  project_id_from: 'path' | 'query_string'
}) {
  const { project_id_from } = props
  const [searchParams] = useSearchParams();
  const params = useParams();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Extract projectId from URL path params (e.g., /projects/:projectId/chat)
  // or from query string (e.g., /chat?projectId=123)
  // Path params take precedence over query params
  const projectIdFromSearchParam = searchParams.get('project_id');

  const { data: projects = [], loading, error, run: refetchProjects } = useRequest(listProjects, {
    onError: (err) => {
      toast.error('Failed to load projects', {
        description: err.message || 'An error occurred while loading projects',
      });
    },
  });

  // Get default project
  const defaultProject = useMemo(() => {
    if (projects.length === 0) return null;
    return projects.find((p) => p.is_default) || projects[0] || null;
  }, [projects]);

  // Determine current project ID: use URL param, or fallback to default/first project
  const currentProjectId = useMemo(() => {
    if (project_id_from === 'path') {
      return params.projectId
    } else {
      return projectIdFromSearchParam || defaultProject?.id
    }
  }, [projectIdFromSearchParam, defaultProject, project_id_from, params, searchParams]);

  // Derive current project from determined project ID
  const currentProject = useMemo(() => {
    if (!currentProjectId || projects.length === 0) return null;
    return projects.find((p) => p.id === currentProjectId) || null;
  }, [currentProjectId, projects]);

  // Helper to check if a project ID is the default
  const isDefaultProject = useCallback((projectId?: string) => {
    if (!projectId || !defaultProject) return false;
    return projectId === defaultProject.id;
  }, [defaultProject]);

  return {
    projects,
    loading,
    error,
    refetchProjects,
    currentProject,
    currentProjectId,
    defaultProject,
    isDefaultProject,
    project_id_from,
    setIsCreateDialogOpen,
    isCreateDialogOpen
  };
}

export function ProjectsProvider({ project_id_from, children }: { project_id_from: 'path' | 'query_string', children: ReactNode }) {
  const value = useProject({ project_id_from });
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function ProjectsConsumer() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('ProjectsConsumer must be used within a ProjectsProvider');
  }
  return context;
}

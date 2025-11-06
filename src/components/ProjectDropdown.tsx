import { ChevronDown, Plus, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { Link, useNavigate, useLocation } from "react-router";
import { useCallback } from 'react';

interface ProjectDropdownProps {
  onProjectChange?: (projectId: string) => void;
}

export function ProjectDropdown({ onProjectChange }: ProjectDropdownProps) {
  const { projects, loading, currentProject, currentProjectId, isDefaultProject, project_id_from } = ProjectsConsumer();
  const navigate = useNavigate();
  const location = useLocation();

  const handleProjectSelect = useCallback((projectId: string) => {
    // Skip if already selected
    if (projectId === currentProjectId) return;

    if (project_id_from == 'query_string') {
      // Update URL with new project_id query parameter (omit if default project)
      const searchParams = new URLSearchParams(location.search);
      if (isDefaultProject(projectId)) {
        searchParams.delete('project_id');
      } else {
        searchParams.set('project_id', projectId);
      }
      const queryString = searchParams.toString();
      navigate(`${location.pathname}${queryString ? '?' + queryString : ''}`);
    }
    if (project_id_from === 'path' && currentProjectId  && location.pathname.includes(currentProjectId)) {
      let newPathName = location.pathname.replace(currentProjectId || '', projectId || '')
      navigate(newPathName);
    }
    if (onProjectChange) {
      onProjectChange(projectId);
    }
  }, [location, navigate, onProjectChange, currentProjectId, isDefaultProject, project_id_from]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-3 min-w-[240px] justify-between backdrop-blur-xl bg-card/50 border-border hover:bg-card/80 hover:border-[rgba(var(--theme-500),0.3)] transition-all duration-200 shadow-sm"
        >
          <div className="flex items-center gap-2 truncate">
            <FolderOpen className="h-4 w-4 flex-shrink-0 text-[rgb(var(--theme-500))]" />
            <span className="truncate font-medium">
              {loading ? 'Loading...' : currentProject?.name || 'Select Project'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50 transition-transform duration-200" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[320px] backdrop-blur-xl bg-card/95 border-border/50 shadow-xl"
      >
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Select Project
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/50" />

        {/* Recent Projects */}
        <div className="max-h-[400px] overflow-y-auto py-1">
          {projects.map((project) => {
            const isSelected = project.id === currentProjectId;
            return (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleProjectSelect(project.id)}
                className={`flex items-center gap-3 cursor-pointer rounded-lg mx-1 px-3 py-2.5 transition-all duration-200 ${isSelected
                  ? 'bg-accent/50'
                  : 'hover:bg-accent focus:bg-accent'
                  }`}
              >
                <FolderOpen className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-[rgb(var(--theme-500))]' : 'text-muted-foreground'}`} />
                <div className="flex-1 truncate">
                  <div className="font-medium truncate">{project.name}</div>
                  {project.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {project.description}
                    </div>
                  )}
                </div>
                {project.is_default && (
                  <span className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 px-2 py-0.5 rounded-full font-medium border border-yellow-500/20">
                    Default
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </div>

        <DropdownMenuSeparator className="bg-border/50 my-1" />

        {/* Actions */}
        <div className="py-1">
          <Link to="/projects">
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer rounded-lg mx-1 px-3 py-2 hover:bg-accent transition-colors duration-200">
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">All Projects</span>
            </DropdownMenuItem>
          </Link>

          <DropdownMenuItem disabled={true} className="flex items-center gap-3 cursor-pointer rounded-lg mx-1 px-3 py-2 text-[rgb(var(--theme-600))] dark:text-[rgb(var(--theme-400))] hover:bg-[rgba(var(--theme-500),0.1)] transition-all duration-200">
            <Plus className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">New Project</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
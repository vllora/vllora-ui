import { useState, useEffect } from 'react';
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
import { listProjects, type Project } from '@/services/projects-api';
import { Link } from 'react-router-dom';

interface ProjectDropdownProps {
  currentProjectId?: string;
  onProjectChange?: (projectId: string) => void;
}

export function ProjectDropdown({ currentProjectId, onProjectChange }: ProjectDropdownProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (currentProjectId && projects.length > 0) {
      const project = projects.find((p) => p.id === currentProjectId);
      setCurrentProject(project || null);
    } else if (projects.length > 0 && !currentProjectId) {
      // Set first project as default if no current project
      const defaultProject = projects.find((p) => p.is_default) || projects[0];
      setCurrentProject(defaultProject);
      if (onProjectChange && defaultProject) {
        onProjectChange(defaultProject.id);
      }
    }
  }, [currentProjectId, projects, onProjectChange]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await listProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = (projectId: string) => {
    // Skip if already selected
    if (projectId === currentProjectId) return;

    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      if (onProjectChange) {
        onProjectChange(projectId);
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-3 min-w-[240px] justify-between backdrop-blur-xl bg-card/50 border-border/50 hover:bg-card/80 hover:border-emerald-500/30 transition-all duration-200 shadow-sm"
        >
          <div className="flex items-center gap-2 truncate">
            <FolderOpen className="h-4 w-4 flex-shrink-0 text-emerald-500" />
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
                className={`flex items-center gap-3 cursor-pointer rounded-lg mx-1 px-3 py-2.5 transition-all duration-200 ${
                  isSelected
                    ? 'bg-accent/50'
                    : 'hover:bg-accent focus:bg-accent'
                }`}
              >
                <FolderOpen className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-emerald-500' : 'text-muted-foreground'}`} />
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

          <Link to="/projects?action=create">
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer rounded-lg mx-1 px-3 py-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200">
              <Plus className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">New Project</span>
            </DropdownMenuItem>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
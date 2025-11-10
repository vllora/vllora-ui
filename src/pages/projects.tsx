import { useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { deleteProject } from '@/services/projects-api';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { CreateProjectDialog } from './CreateProjectDialog';
import { ProjectCard } from './ProjectCard';
import { CurrentAppConsumer } from '@/lib';

export function ProjectsPage() {
  const { projects, loading, refetchProjects, isDefaultProject } = ProjectsConsumer();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { app_mode } = CurrentAppConsumer();

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await deleteProject(projectId);
      refetchProjects();
      toast.success('Project deleted', {
        description: 'The project has been deleted successfully',
      });
    } catch (error) {
      toast.error('Failed to delete project', {
        description: error instanceof Error ? error.message : 'An error occurred',
      });
      console.error('Failed to delete project:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInMonths = Math.floor(diffInDays / 30);

    // Show relative time for dates < 1 month
    if (diffInMonths < 1) {
      if (diffInSeconds < 60) {
        return diffInSeconds === 1 ? '1 second ago' : `${diffInSeconds} seconds ago`;
      } else if (diffInMinutes < 60) {
        return diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`;
      } else if (diffInHours < 24) {
        return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
      } else {
        return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
      }
    }

    // Show absolute date for dates > 1 month
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden flex-1">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[rgba(var(--theme-500),0.1)]">
                <FolderOpen className="h-6 w-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Projects</h1>
                <p className="text-sm text-muted-foreground">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                </p>
              </div>
            </div>
            <Button
              disabled={app_mode === 'vllora'}
              className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] hover:from-[rgb(var(--theme-500))] hover:to-[rgb(var(--theme-700))] text-white shadow-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>
      </div>

      {/* Projects Grid - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-full" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <FolderOpen className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                <p className="text-muted-foreground text-center max-w-sm">
                  Create your first project to organize your models, chats, and analytics.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isDefaultProject={isDefaultProject}
                  formatDate={formatDate}
                  onDelete={handleDeleteProject}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onProjectCreated={refetchProjects}
      />
    </div>
  );
}
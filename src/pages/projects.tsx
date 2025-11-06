import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createProject,
  deleteProject,
  type CreateProjectRequest,
} from '@/services/projects-api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ProjectsConsumer } from '@/contexts/ProjectContext';

export function ProjectsPage() {
  const { projects, loading, refetchProjects, isDefaultProject } = ProjectsConsumer();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Open create dialog if ?action=create in URL
    if (searchParams.get('action') === 'create') {
      setIsCreateDialogOpen(true);
    }
  }, [searchParams]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      setCreating(true);
      const request: CreateProjectRequest = {
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
      };
      await createProject(request);

      // Reset form
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreateDialogOpen(false);

      // Refresh projects list
      refetchProjects();

      // Clear URL params
      navigate('/projects', { replace: true });

      toast.success('Project created', {
        description: `${newProjectName} has been created successfully`,
      });
    } catch (error) {
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'An error occurred',
      });
      console.error('Failed to create project:', error);
    } finally {
      setCreating(false);
    }
  };

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
              disabled
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
                <Card
                  key={project.id}
                  className="hover:border-[rgb(var(--theme-500))] hover:shadow-lg hover:shadow-[rgba(var(--theme-500),0.1)] transition-all duration-200 group cursor-pointer relative overflow-hidden"
                  onClick={() => {
                    // Navigate to project with path-based routing
                    if (isDefaultProject(project.id)) {
                      navigate('/projects');
                    } else {
                      navigate(`/projects/${project.id}`);
                    }
                  }}
                >
                  {/* Gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[rgba(var(--theme-500),0.05)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                  <CardHeader className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <FolderOpen className="h-5 w-5 text-[rgb(var(--theme-500))] flex-shrink-0" />
                          <span className="truncate">{project.name}</span>
                          {project.is_default && (
                            <Badge variant="secondary" className="flex-shrink-0 text-xs">
                              Default
                            </Badge>
                          )}
                        </CardTitle>
                        {project.description && (
                          <CardDescription className="mt-2 line-clamp-2">
                            {project.description}
                          </CardDescription>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-medium">Created:</span>
                      <span>{formatDate(project.created_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new project to organize your models, chats, and analytics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                placeholder="My Project"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCreateProject();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe your project..."
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setNewProjectName('');
                setNewProjectDescription('');
                navigate('/projects', { replace: true });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || creating}
              className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] hover:from-[rgb(var(--theme-500))] hover:to-[rgb(var(--theme-700))] text-white"
            >
              {creating ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
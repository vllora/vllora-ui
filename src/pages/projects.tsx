import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  const { projects, loading, refetchProjects } = ProjectsConsumer();
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
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-8 w-8 text-[rgb(var(--theme-500))]" />
          <h1 className="text-3xl font-bold">Projects</h1>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] hover:from-[rgb(var(--theme-500))] hover:to-[rgb(var(--theme-700))] text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-full" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No projects yet. Create your first project to get started!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="hover:border-[rgba(var(--theme-500),0.5)] transition-colors group cursor-pointer"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-[rgb(var(--theme-500))]" />
                      {project.name}
                      {project.is_default && (
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      )}
                    </CardTitle>
                    {project.description && (
                      <CardDescription className="mt-2">
                        {project.description}
                      </CardDescription>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent card click
                      handleDeleteProject(project.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Created: {formatDate(project.created_at)}</p>
                  <p>Updated: {formatDate(project.updated_at)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from "react-router";
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import {
  createProject,
  type CreateProjectRequest,
} from '@/services/projects-api';

interface CreateProjectDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: () => void;
}

export function CreateProjectDialog({
  isOpen,
  onOpenChange,
  onProjectCreated,
}: CreateProjectDialogProps) {
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Open dialog if ?action=create in URL
    if (searchParams.get('action') === 'create') {
      onOpenChange(true);
    }
  }, [searchParams, onOpenChange]);

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
      onOpenChange(false);

      // Refresh projects list
      onProjectCreated();

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

  const handleCancel = () => {
    onOpenChange(false);
    setNewProjectName('');
    setNewProjectDescription('');
    navigate('/projects', { replace: true });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={handleCancel}>
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
  );
}

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { deleteCustomProviderDefinition } from '@/services/custom-providers-api';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';

interface CustomProviderRowProps {
  provider: {
    id: string;
    name: string;
    endpoint?: string;
  };
  modelCount?: number;
  onEdit: () => void;
  onAddModel: () => void;
}

export function CustomProviderRow({
  provider,
  modelCount = 0,
  onEdit,
  onAddModel,
}: CustomProviderRowProps) {
  const { currentProjectId } = ProjectsConsumer();
  const { refetchProviders } = ProviderKeysConsumer();
  const { refetchModels } = ProjectModelsConsumer();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCustomProviderDefinition(provider.id, currentProjectId);
      toast.success(`Provider "${provider.name}" deleted`);
      await refetchProviders();
      refetchModels();
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete provider');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer"
        onClick={onEdit}
      >
        <div className="flex items-center gap-3">
          <ProviderIcon provider_name={provider.name} className="w-6 h-6" />
          <div>
            <span className="font-medium">{provider.name}</span>
            {provider.endpoint && (
              <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                {provider.endpoint}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onAddModel();
            }}
            className="h-8 px-2 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="Add model"
          >
            <Plus className="h-3 w-3 mr-1" />
            Model
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
            className="h-8 px-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete provider"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {modelCount} {modelCount === 1 ? 'model' : 'models'}
          </span>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{provider.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

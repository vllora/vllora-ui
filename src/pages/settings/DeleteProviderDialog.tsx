import { AlertTriangle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteProviderDialogProps {
    open: boolean;
    providerName: string;
    deleting: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

export const DeleteProviderDialog = ({
    open,
    providerName,
    deleting,
    onOpenChange,
    onConfirm,
}: DeleteProviderDialogProps) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <DialogTitle>Delete Provider Credentials</DialogTitle>
                            <DialogDescription>
                                This action cannot be undone
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="py-4">
                    <p className="text-sm text-muted-foreground">
                        Are you sure you want to delete the credentials for{' '}
                        <span className="font-semibold text-foreground capitalize">{providerName}</span>?
                        You will need to reconfigure them to use this provider again.
                    </p>
                </div>

                <DialogFooter>
                    <div className="flex gap-2 justify-end w-full">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={onConfirm}
                            disabled={deleting}
                        >
                            {deleting ? 'Deleting...' : 'Delete Credentials'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

import { Save } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ProviderCredentialForm } from './ProviderCredentialForm';
import type { ProviderInfo } from '@/services/providers-api';
import type { CredentialFormValues } from './ProviderCredentialForm';

interface ProviderCredentialModalProps {
    open: boolean;
    provider: ProviderInfo | null;
    values: CredentialFormValues;
    showKeys: Record<string, boolean>;
    saving: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (values: CredentialFormValues) => void;
    onToggleShow: (field: string) => void;
    onSave: () => void;
    onRefresh?: () => void;
}

export const ProviderCredentialModal = ({
    open,
    provider,
    values,
    showKeys,
    saving,
    onOpenChange,
    onChange,
    onToggleShow,
    onSave,
    onRefresh,
}: ProviderCredentialModalProps) => {
    if (!provider) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <ProviderIcon provider_name={provider.name} className="w-10 h-10" />
                        <div>
                            <DialogTitle className="capitalize">{provider.name} Configuration</DialogTitle>
                            <DialogDescription>
                                Configure your {provider.name} credentials
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="py-4">
                    <ProviderCredentialForm
                        providerType={provider.provider_type}
                        providerName={provider.name}
                        values={values}
                        showKeys={showKeys}
                        onChange={onChange}
                        onToggleShow={onToggleShow}
                        onClose={async () => {
                            // Backend already saved during session init
                            // Refresh providers list to show updated status
                            if (onRefresh) {
                                await onRefresh();
                            }
                            // Close modal
                            onOpenChange(false);
                        }}
                    />
                </div>

                <DialogFooter>
                    <div className="flex items-center justify-between w-full">
                        <div className="text-xs text-muted-foreground">
                            Press <kbd className="px-1.5 py-0.5 bg-muted rounded border">Esc</kbd> to cancel
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={onSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    'Saving...'
                                ) : (
                                    <>
                                        <Save className="h-4 w-4 mr-1" />
                                        Save
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

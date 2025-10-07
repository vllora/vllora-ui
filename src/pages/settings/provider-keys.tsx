import { Save, Trash2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { ProviderKeysLoader } from './ProviderKeysLoader';
import { ProviderCredentialModal } from './ProviderCredentialModal';
import { DeleteProviderDialog } from './DeleteProviderDialog';

export const ProviderKeysPage = () => {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-1 flex-col gap-6 overflow-scroll">
                <ProviderKeysContent />
            </div>
        </div>
    )
}

const ProviderKeysContent = () => {
    const {
        providers,
        loading,
        error,
        editingProvider,
        modalOpen,
        deleteDialogOpen,
        providerToDelete,
        credentialValues,
        showKeys,
        saving,
        saveProvider,
        startDeleteProvider,
        confirmDeleteProvider,
        cancelDeleteProvider,
        toggleShowKeyField,
        getShowKeyField,
        startEditing,
        cancelEditing,
        updateCredentialValues,
        setModalOpen,
    } = ProviderKeysConsumer();

    const editingProviderData = providers.find(p => p.name === editingProvider);

    if (loading) {
        return <ProviderKeysLoader />;
    }

    const handleStartEditing = (provider: typeof providers[0]) => {
        startEditing(provider.name);
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        cancelEditing();
    };

    const handleSaveModal = () => {
        if (editingProvider) {
            saveProvider(editingProvider);
        }
    };

    return (
        <>
            {/* Credential Configuration Modal */}
            <ProviderCredentialModal
                open={modalOpen}
                provider={editingProviderData || null}
                values={credentialValues[editingProvider || ''] || {}}
                showKeys={
                    editingProvider
                        ? Object.fromEntries(
                              Object.keys(credentialValues[editingProvider] || {}).map((field) => [
                                  field,
                                  getShowKeyField(editingProvider, field),
                              ])
                          )
                        : {}
                }
                saving={saving[editingProvider || ''] || false}
                onOpenChange={handleCloseModal}
                onChange={(values) => editingProvider && updateCredentialValues(editingProvider, values)}
                onToggleShow={(field) => editingProvider && toggleShowKeyField(editingProvider, field)}
                onSave={handleSaveModal}
            />

            {/* Delete Confirmation Dialog */}
            <DeleteProviderDialog
                open={deleteDialogOpen}
                providerName={providerToDelete || ''}
                deleting={saving[providerToDelete || ''] || false}
                onOpenChange={cancelDeleteProvider}
                onConfirm={confirmDeleteProvider}
            />

            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Provider Keys</CardTitle>
                        <CardDescription>
                            Configure API keys for different AI providers. Your keys are stored securely and associated with your current project.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            </div>
                        )}

                        {/* Configured Providers */}
                        {providers.filter(p => p.has_credentials).length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground px-3">
                                    Configured
                                </h3>
                                <div className="border border-border rounded-lg divide-y divide-border">
                                    {providers
                                        .filter(p => p.has_credentials)
                                        .map((provider) => (
                                            <div
                                                key={provider.name}
                                                className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer"
                                                onClick={() => handleStartEditing(provider)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <ProviderIcon provider_name={provider.name} className="w-6 h-6" />
                                                    <span className="font-medium capitalize">{provider.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">
                                                        Configured
                                                    </span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            startDeleteProvider(provider.name);
                                                        }}
                                                        disabled={saving[provider.name]}
                                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Available Providers */}
                        {providers.filter(p => !p.has_credentials).length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground px-3">
                                    Available
                                </h3>
                                <div className="border border-border rounded-lg divide-y divide-border">
                                    {providers
                                        .filter(p => !p.has_credentials)
                                        .map((provider) => (
                                            <div
                                                key={provider.name}
                                                className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer"
                                                onClick={() => handleStartEditing(provider)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <ProviderIcon provider_name={provider.name} className="w-6 h-6" />
                                                    <span className="font-medium capitalize">{provider.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">
                                                        Not configured
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                    {providers.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            No providers available
                        </div>
                    )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

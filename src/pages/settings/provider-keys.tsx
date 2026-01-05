import { useState, useMemo } from 'react';
import { Trash2, AlertCircle, Plus, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { useProviderModal } from '@/contexts/ProviderModalContext';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import { ProviderKeysLoader } from './ProviderKeysLoader';
import { DeleteProviderDialog } from './DeleteProviderDialog';
import { CustomProviderDialog } from '@/components/settings/CustomProviderDialog';
import { AddCustomModelDialog } from '@/components/settings/AddCustomModelDialog';
import { QuickAddModelDialog } from '@/components/settings/QuickAddModelDialog';
import { CustomProviderRow } from '@/components/settings/CustomProviderRow';

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
        deleteDialogOpen,
        providerToDelete,
        saving,
        startDeleteProvider,
        confirmDeleteProvider,
        cancelDeleteProvider,
        refetchProviders,
    } = ProviderKeysConsumer();

    const { openProviderModal } = useProviderModal();
    const { models } = ProjectModelsConsumer();

    // Custom dialog states
    const [customProviderDialogOpen, setCustomProviderDialogOpen] = useState(false);
    const [quickAddModelDialogOpen, setQuickAddModelDialogOpen] = useState(false);
    const [addModelDialogOpen, setAddModelDialogOpen] = useState(false);
    const [addModelProvider, setAddModelProvider] = useState<string>('');

    // Separate providers into predefined and custom
    const { predefinedProviders, customProviders } = useMemo(() => {
        const predefined = providers.filter(p => !p.is_custom);
        const custom = providers.filter(p => p.is_custom);
        return { predefinedProviders: predefined, customProviders: custom };
    }, [providers]);

    // Count models per provider
    const modelCountByProvider = useMemo(() => {
        const counts: Record<string, number> = {};
        models.forEach(model => {
            const providerName = model.inference_provider?.provider;
            if (providerName) {
                counts[providerName] = (counts[providerName] || 0) + 1;
            }
        });
        return counts;
    }, [models]);

    const configuredPredefined = predefinedProviders.filter(p => p.has_credentials);
    const availablePredefined = predefinedProviders.filter(p => !p.has_credentials);

    if (loading) {
        return <ProviderKeysLoader />;
    }

    const handleProviderClick = (providerName: string) => {
        openProviderModal(providerName, () => {
            refetchProviders();
        });
    };

    const handleAddModel = (providerName: string) => {
        setAddModelProvider(providerName);
        setAddModelDialogOpen(true);
    };

    return (
        <>
            {/* Delete Confirmation Dialog */}
            <DeleteProviderDialog
                open={deleteDialogOpen}
                providerName={providerToDelete || ''}
                deleting={saving[providerToDelete || ''] || false}
                onOpenChange={cancelDeleteProvider}
                onConfirm={confirmDeleteProvider}
            />

            {/* Custom Provider Dialog */}
            <CustomProviderDialog
                open={customProviderDialogOpen}
                onOpenChange={setCustomProviderDialogOpen}
                onSuccess={refetchProviders}
            />

            {/* Quick Add Model Dialog */}
            <QuickAddModelDialog
                open={quickAddModelDialogOpen}
                onOpenChange={setQuickAddModelDialogOpen}
                onSuccess={refetchProviders}
            />

            {/* Add Model to Provider Dialog */}
            <AddCustomModelDialog
                open={addModelDialogOpen}
                onOpenChange={setAddModelDialogOpen}
                providerName={addModelProvider}
                onSuccess={refetchProviders}
            />

            <div className="space-y-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold">Provider Keys</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Configure API keys for different AI providers. Your keys are stored securely and associated with your current project.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickAddModelDialogOpen(true)}
                        >
                            <Bot className="h-4 w-4 mr-1" />
                            Add Model
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setCustomProviderDialogOpen(true)}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Provider
                        </Button>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                )}

                {/* Configured Providers */}
                {configuredPredefined.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground px-3">
                            Configured
                        </h3>
                        <div className="border border-border rounded-lg divide-y divide-border">
                            {configuredPredefined.map((provider) => (
                                <div
                                    key={provider.name}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer"
                                    onClick={() => handleProviderClick(provider.name)}
                                >
                                    <div className="flex items-center gap-3">
                                        <ProviderIcon provider_name={provider.name} className="w-6 h-6" />
                                        <span className="font-medium capitalize">{provider.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                       
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddModel(provider.name);
                                            }}
                                            className="h-8 px-2 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Add custom model"
                                        >
                                            <Plus className="h-3 w-3 mr-1" />
                                            Model
                                        </Button>
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
                                         <span className="text-xs text-muted-foreground">
                                            Configured
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Providers */}
                {customProviders.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground px-3">
                            Custom
                        </h3>
                        <div className="border border-border rounded-lg divide-y divide-border">
                            {customProviders.map((provider) => (
                                <CustomProviderRow
                                    key={provider.name}
                                    provider={provider}
                                    modelCount={modelCountByProvider[provider.name] || 0}
                                    onEdit={() => handleProviderClick(provider.name)}
                                    onAddModel={() => handleAddModel(provider.name)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Available Providers */}
                {availablePredefined.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground px-3">
                            Available
                        </h3>
                        <div className="border border-border rounded-lg divide-y divide-border">
                            {availablePredefined.map((provider) => (
                                <div
                                    key={provider.name}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer"
                                    onClick={() => handleProviderClick(provider.name)}
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
            </div>
        </>
    );
}

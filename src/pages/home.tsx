import { AlertCircle, RefreshCw, Server, MessageSquare, BookOpen, ExternalLink, ChevronRight } from 'lucide-react';
import { LocalModelsExplorer } from '@/components/models/local/LocalModelsExplorer';
import { LocalModelsSkeletonLoader } from '@/components/models/local/LocalModelsSkeletonLoader';
import { LocalModelsConsumer } from '@/contexts/LocalModelsContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBackendUrl } from '@/config/api';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProviderCredentialModal } from '@/pages/settings/ProviderCredentialModal';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function HomePage() {
  const { models: localModels, loading: localLoading, error: localError, refetchModels: localRefetch } = LocalModelsConsumer();
  const { currentProjectId, isDefaultProject } = ProjectsConsumer();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Quick Links Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card 
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => {
              // Navigate to chat while preserving project context
              const params = new URLSearchParams();
              if (currentProjectId && !isDefaultProject(currentProjectId)) {
                params.set('project_id', currentProjectId);
              }
              const queryString = params.toString();
              navigate(`/chat${queryString ? '?' + queryString : ''}`);
            }}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-[rgb(var(--theme-500))]/10">
                <MessageSquare className="w-6 h-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Chat</h3>
                <p className="text-muted-foreground text-sm">Start a conversation with AI models</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => window.open('https://docs.ellora.ai', '_blank')}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-[rgb(var(--theme-500))]/10">
                <BookOpen className="w-6 h-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Documentation</h3>
                <p className="text-muted-foreground text-sm">Learn how to use Ellora UI</p>
              </div>
              <ExternalLink className="w-5 h-5 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </div>

        {/* Provider Setup Section - only show if no providers are configured */}
        <ProviderSetupSection />

        {/* Models Section */}
        <div className="mt-8">
          <header className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Available Models</h2>
            <p className="text-muted-foreground">
              Browse and manage your AI models
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Server className="w-4 h-4 text-[rgb(var(--theme-500))]" />
              <span className="text-sm text-muted-foreground">
                Running on <span className="text-[rgb(var(--theme-500))] font-medium">{getBackendUrl()}</span>
              </span>
            </div>
          </header>

          {/* Loading State */}
          {localLoading && (
            <div className="flex flex-col space-y-6">
              <LocalModelsSkeletonLoader viewMode="grid" count={9} />
            </div>
          )}

          {/* Error State */}
          {localError && !localLoading && (
            <div className="flex flex-col items-center justify-center py-12 bg-card border border-border rounded-lg">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-xl font-semibold text-card-foreground mb-2">Failed to Load Models</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {localError.message}
              </p>
              <Button
                onClick={() => localRefetch()}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          )}

          {/* Local Models Explorer */}
          {!localLoading && !localError && (
            <LocalModelsExplorer
              models={localModels}
              showViewModeToggle={true}
              showStats={true}
              statsTitle="Models"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ProviderSetupSection() {
  const {
    providers,
    loading: providersLoading,
    editingProvider,
    modalOpen,
    credentialValues,
    saving,
    startEditing,
    setModalOpen,
    updateCredentialValues,
    toggleShowKeyField,
    getShowKeyField,
    saveProvider,
    refetchProviders,
    cancelEditing,
  } = ProviderKeysConsumer();

  const navigate = useNavigate();

  if (providersLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configure your first provider</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-muted/50 rounded-lg" />
            <div className="h-16 bg-muted/50 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Check if any providers are configured
  const hasConfiguredProviders = providers.some(p => p.has_credentials);
  
  // Hide the section if providers are already configured
  if (hasConfiguredProviders) {
    return null;
  }

  const langdbProvider = providers.find(p => p.name.toLowerCase() === 'langdb');
  const otherProviders = providers.filter(p => p.name.toLowerCase() !== 'langdb').slice(0, 6);

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

  const editingProviderData = providers.find(p => p.name === editingProvider);

  return (
    <>
      {/* Provider Configuration Modal */}
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
        onRefresh={refetchProviders}
      />

      <Card>
        <CardHeader>
          <CardTitle>Configure your first provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* LangDB Featured Provider */}
          {langdbProvider && (
            <div className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer group"
                 onClick={() => handleStartEditing(langdbProvider)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <ProviderIcon provider_name={langdbProvider.name} className="w-8 h-8" />
                  <div>
                    <h3 className="font-semibold capitalize">{langdbProvider.name}</h3>
                    <p className="text-sm text-muted-foreground">Connect your LangDB account</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    langdbProvider.has_credentials 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                  }`}>
                    {langdbProvider.has_credentials ? 'Configured' : 'Not configured'}
                  </span>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </div>
          )}

          {/* Other Providers */}
          {otherProviders.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">Other Providers</h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate('/settings')}
                  className="text-xs"
                >
                  View all
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {otherProviders.map((provider) => (
                  <div
                    key={provider.name}
                    className="border border-border rounded-lg p-3 hover:bg-accent/50 transition-colors cursor-pointer group"
                    onClick={() => handleStartEditing(provider)}
                  >
                    <div className="flex items-center gap-3">
                      <ProviderIcon provider_name={provider.name} className="w-5 h-5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm capitalize truncate">{provider.name}</p>
                        <span className={`text-xs ${
                          provider.has_credentials 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-yellow-600 dark:text-yellow-400'
                        }`}>
                          {provider.has_credentials ? 'Configured' : 'Not configured'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
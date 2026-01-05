import { useState } from 'react';
import { AlertCircle, RefreshCw, MessageSquare, BookOpen, ExternalLink, ChevronRight, ArrowRight, Activity, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { LocalModelCard } from '@/components/models/local/LocalModelCard';
import { LocalModelsSkeletonLoader } from '@/components/models/local/LocalModelsSkeletonLoader';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { useProviderModal } from '@/contexts/ProviderModalContext';
import { CustomProviderDialog } from '@/components/settings/CustomProviderDialog';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { useNavigate } from "react-router";
import { ModelInfo } from '@/types/models';
import { CurrentAppConsumer } from '@/lib';

// Helper function to get top models based on benchmark ranking
function getTopModelsByBenchmark(models: ModelInfo[], limit: number = 12): ModelInfo[] {
  // First, sort all models by release date (newest first)
  const sortedByDate = [...models].sort((a, b) => {
    const dateA = new Date(a.release_date || a.langdb_release_date || 0).getTime();
    const dateB = new Date(b.release_date || b.langdb_release_date || 0).getTime();
    return dateB - dateA; // Newest first
  });

  // Filter models that have benchmark info with ranks
  const modelsWithRank = sortedByDate.filter(m =>
    m.benchmark_info?.rank && Object.keys(m.benchmark_info.rank).length > 0
  );

  // Get all unique benchmark categories
  const allCategories = new Set<string>();
  modelsWithRank.forEach(m => {
    if (m.benchmark_info?.rank) {
      Object.keys(m.benchmark_info.rank).forEach(cat => allCategories.add(cat));
    }
  });

  // For each category, get top 5 models (by rank, lower is better)
  const selectedModelNames = new Set<string>();

  allCategories.forEach(category => {
    const modelsInCategory = modelsWithRank
      .filter(m => m.benchmark_info?.rank?.[category] !== undefined)
      .sort((a, b) => {
        const rankA = a.benchmark_info?.rank?.[category] || Infinity;
        const rankB = b.benchmark_info?.rank?.[category] || Infinity;
        return rankA - rankB;
      })
      .slice(0, 5);

    // Collect model names (will be deduplicated by Set)
    modelsInCategory.forEach(model => {
      selectedModelNames.add(model.model);
    });
  });

  // Now get ALL providers for each selected model name from the full sorted list
  const uniqueTopModels = sortedByDate.filter(m => selectedModelNames.has(m.model));

  // If we don't have enough model instances, add more from sorted by date
  if (uniqueTopModels.length < limit) {
    const additionalModels = sortedByDate
      .filter(m => !selectedModelNames.has(m.model))
      .slice(0, limit - uniqueTopModels.length);
    return [...uniqueTopModels, ...additionalModels];
  }

  return uniqueTopModels;
}

export function HomePage() {
  const { models: localModels, loading: localLoading, error: localError } = ProjectModelsConsumer();
  const { currentProjectId, isDefaultProject, project_id_from } = ProjectsConsumer();
  const { providers } = ProviderKeysConsumer();
  const { app_mode } = CurrentAppConsumer()
  const navigate = useNavigate();

  // Create provider configuration status mapping from /providers API
  // has_credentials === true means the provider has actual credentials configured
  const providerStatusMap = useMemo(() => {
    const map = new Map<string, boolean>();
    providers.forEach(p => {
      if (p?.name) {
        map.set(p.name.toLowerCase(), p.has_credentials);
      }
    });
    return map;
  }, [providers]);

  // Get top models by benchmark ranking (4 columns × 3 rows = 12 cards)
  // Models are already grouped by the API, no need for client-side grouping
  const topModels = useMemo(() => {
    const targetCardCount = 12;
    const selectedModels = getTopModelsByBenchmark(localModels, targetCardCount);

    // Return exactly 12 cards (4 × 3 grid)
    return selectedModels.slice(0, targetCardCount);
  }, [localModels]);

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">

        {/* Quick Links Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => {
              // Navigate to chat while preserving project context
              const params = new URLSearchParams();
              if (currentProjectId && !isDefaultProject(currentProjectId) && project_id_from === 'query_string') {
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
            onClick={() => {
              // Navigate to traces while preserving project context
              const params = new URLSearchParams();
              params.set('tab', 'traces');
              if (currentProjectId && !isDefaultProject(currentProjectId) && project_id_from === 'query_string') {
                params.set('project_id', currentProjectId);
              }
              const queryString = params.toString();
              navigate(`/chat?${queryString}`);
            }}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-[rgb(var(--theme-500))]/10">
                <Activity className="w-6 h-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Debug</h3>
                <p className="text-muted-foreground text-sm">Monitor and debug API traces</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => window.open(app_mode === 'vllora' ? 'https://vllora.dev/docs' : 'https://docs.langdb.ai/', '_blank')}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-[rgb(var(--theme-500))]/10">
                <BookOpen className="w-6 h-6 text-[rgb(var(--theme-500))]" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Documentation</h3>
                <p className="text-muted-foreground text-sm">Learn how to use {app_mode === 'vllora' ? 'vLLora' : 'LangDB'}</p>
              </div>
              <ExternalLink className="w-5 h-5 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </div>

        {/* Provider Setup Section - only show when app mode is vllora */}
        {app_mode === 'vllora' && <ProviderSetupSection />}

        {/* Models Section */}
        <div className="mt-6">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">Top Models</h2>
                <p className="text-muted-foreground">
                  Discover high-performing AI models
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate('/models')}
                className="flex items-center gap-2"
              >
                View All Models
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {localLoading && (
            <div className="flex flex-col space-y-6">
              <LocalModelsSkeletonLoader viewMode="grid" count={12} />
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
                onClick={() => {}}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          )}

          {/* Top Models Grid */}
          {!localLoading && !localError && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {topModels.map((model, index) => (
                <LocalModelCard
                  key={`${model.inference_provider.provider}/${model.model}-${index}`}
                  model={model}
                  providerStatusMap={providerStatusMap}
                  showDescription={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ProviderSetupSection() {
  const { providers, loading: providersLoading, refetchProviders } = ProviderKeysConsumer();
  const { openProviderModal } = useProviderModal();
  const navigate = useNavigate();
  const [customProviderDialogOpen, setCustomProviderDialogOpen] = useState(false);

  if (providersLoading) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Configure your provider</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-muted/50 rounded-lg" />
          <div className="h-16 bg-muted/50 rounded-lg" />
        </div>
      </div>
    );
  }

  // Filter out custom providers for the main list, show only predefined
  const predefinedProviders = providers.filter(p => !p.is_custom);

  // Order providers: OpenAI first, then LangDB, then rest
  const openaiProvider = predefinedProviders.find(p => p?.name?.toLowerCase() === 'openai');
  const langdbProvider = predefinedProviders.find(p => p?.name?.toLowerCase() === 'langdb');
  const otherProviders = predefinedProviders.filter(p =>
    p?.name && p.name.toLowerCase() !== 'openai' && p.name.toLowerCase() !== 'langdb'
  );

  const orderedProviders = [
    openaiProvider,
    langdbProvider,
    ...otherProviders
  ].filter((p): p is typeof providers[0] => p !== undefined).slice(0, 5); // Show 5 to leave room for Add Custom

  const handleProviderClick = (providerName: string) => {
    openProviderModal(providerName, () => {
      refetchProviders();
    });
  };

  return (
    <>
      {/* Custom Provider Dialog */}
      <CustomProviderDialog
        open={customProviderDialogOpen}
        onOpenChange={setCustomProviderDialogOpen}
        onSuccess={refetchProviders}
      />

      <div>
        <div className="flex flex-row items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Configure your provider</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/settings?section=providers`)}
            className="text-xs"
          >
            View all
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {orderedProviders.map((provider) => (
            <div
              key={provider.name}
              className="border border-border rounded-lg p-3 hover:bg-accent/50 transition-colors cursor-pointer group"
              onClick={() => handleProviderClick(provider.name)}
            >
              <div className="flex items-center gap-3">
                <ProviderIcon provider_name={provider.name} className="w-5 h-5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm capitalize truncate">{provider.name}</p>
                  <span className={`text-xs ${provider.has_credentials
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                    }`}>
                    {provider.has_credentials ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {/* Add Custom Provider Card */}
          <div
            className="border border-dashed border-border rounded-lg p-3 hover:bg-accent/50 hover:border-solid transition-colors cursor-pointer group"
            onClick={() => setCustomProviderDialogOpen(true)}
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                <Plus className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">Add Custom</p>
                <span className="text-xs text-muted-foreground">
                  Custom endpoint
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
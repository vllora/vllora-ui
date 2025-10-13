import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndeterminateCheckbox } from "@/components/ui/indeterminate-checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelListSkeleton, ConfigSummarySkeleton } from "./ModelListSkeleton";
import { ModelTooltipContent } from "./ModelTooltipContent";
import { ModelCard } from "./ModelCard";
import {
  Search,
  CheckSquare,
  Square,
  Save,
  RotateCcw,
  ChevronDown,
  InfoIcon
} from "lucide-react";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { getModelFullName } from "@/utils/model-fullname";
import { motion, AnimatePresence } from "framer-motion";
import { useModels } from "@/hooks/useModels";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { getModelRestrictions, updateModelRestrictions } from "@/services/model-restrictions-api";
import { useRequest } from "ahooks";
import { toast } from "sonner";

type GroupedModels = {
  [provider: string]: any[];
};

export const ModelsPage = () => {
  const { models } = useModels();
  const { currentProjectId } = ProjectsConsumer();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [currentConfigModels, setCurrentConfigModels] = useState<string[]>([]);

  // Reference for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // API calls
  const { data: modelRestrictions, loading: loadingModelRestrictions, run: fetchModelRestrictions } = useRequest(
    getModelRestrictions,
    { manual: true }
  );

  const { loading: updatingModelRestrictions, run: updateRestrictions } = useRequest(
    updateModelRestrictions,
    { manual: true }
  );

  useEffect(() => {
    if (currentProjectId) {
      fetchModelRestrictions(currentProjectId);
    }
  }, [currentProjectId, fetchModelRestrictions]);

  // Initialize all models as available by default
  useEffect(() => {
    resetToDefaults();
  }, [modelRestrictions, models]);

  // Group and filter models
  const groupedModels: GroupedModels = useMemo(() => {
    const groups: GroupedModels = {};
    models?.forEach(model => {
      const matchesSearch = searchTerm === "" ||
        model.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.inference_provider.provider.toLowerCase().includes(searchTerm.toLowerCase());

      if (matchesSearch) {
        const provider = model.inference_provider.provider;
        if (!groups[provider]) {
          groups[provider] = [];
        }
        groups[provider].push(model);
      }
    });

    // Sort providers alphabetically
    const sortedGroups: GroupedModels = {};
    Object.keys(groups).sort().forEach(provider => {
      sortedGroups[provider] = groups[provider];
    });

    return sortedGroups;
  }, [models, searchTerm]);

  const isEnabledSave = useMemo(() => {
    if (loadingModelRestrictions || updatingModelRestrictions) {
      return false;
    }
    if (!modelRestrictions?.restrictions || modelRestrictions.restrictions.length < 1) {
      if (models && models.length > 0 && currentConfigModels.length > 0 && currentConfigModels.length === models.length) {
        return false;
      }
      return currentConfigModels.length > 0;
    }
    let serverAllows = [...(modelRestrictions.restrictions?.[0].allowed_models || [])].sort();
    let currentAllow = [...currentConfigModels].sort();
    return JSON.stringify(serverAllows) !== JSON.stringify(currentAllow);
  }, [currentConfigModels, modelRestrictions, loadingModelRestrictions, updatingModelRestrictions, models]);

  // Statistics
  const totalModels = models?.length || 0;

  // Toggle individual model
  const toggleModel = useCallback((modelId: string) => {
    setCurrentConfigModels(prev => {
      const newModels = [...prev];
      const index = newModels.indexOf(modelId);
      if (index > -1) {
        newModels.splice(index, 1);
      } else {
        newModels.push(modelId);
      }
      return newModels;
    });
  }, []);

  // Select all models
  const selectAllModels = useCallback(() => {
    if (models) {
      const allModels: string[] = [];
      models.forEach(model => {
        const keyName = getModelFullName(model);
        allModels.push(keyName);
      });
      setCurrentConfigModels(allModels);
    }
  }, [models]);

  // Deselect all models
  const deselectAllModels = useCallback(() => {
    if (models) {
      setCurrentConfigModels([]);
    }
  }, [models]);

  // Toggle provider
  const toggleProvider = useCallback(({
    provider,
    selectAll,
  }: {
    provider: string;
    selectAll: boolean;
  }) => {
    if (selectAll) {
      const modelsByProviderNames = models?.filter(m => m.inference_provider.provider === provider).map(m => getModelFullName(m)) || [];
      setCurrentConfigModels(prev => {
        let newModels = [...prev];
        modelsByProviderNames.forEach(model => {
          if (!newModels.includes(model)) {
            newModels.push(model);
          }
        });
        newModels.sort();
        return newModels;
      });
    } else {
      setCurrentConfigModels(prev => {
        const newModels = [...prev].filter(m => {
          return !m.startsWith(`${provider}/`);
        });
        return newModels;
      });
    }
  }, [models]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    if (modelRestrictions?.restrictions && modelRestrictions.restrictions.length > 0) {
      let currentModelRestrictions = modelRestrictions.restrictions[0];
      setCurrentConfigModels([...currentModelRestrictions.allowed_models]);
    } else if (models) {
      // Default all models to available
      const defaultModels: string[] = models.map(model => {
        const keyName = getModelFullName(model);
        return keyName;
      });
      setCurrentConfigModels(defaultModels);
    }
  }, [modelRestrictions, models]);

  // Save configuration
  const saveConfiguration = useCallback(async () => {
    if (!currentProjectId) return;
    
    try {
      await updateRestrictions(currentProjectId, currentConfigModels);
      toast.success("Model restrictions updated successfully");
      // Refresh the restrictions
      await fetchModelRestrictions(currentProjectId);
    } catch (error) {
      toast.error("Failed to update model restrictions");
      console.error("Error updating model restrictions:", error);
    }
  }, [currentProjectId, currentConfigModels, updateRestrictions, fetchModelRestrictions]);

  // Toggle provider expansion
  const toggleProviderExpansion = (provider: string) => {
    setExpandedProviders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(provider)) {
        newSet.delete(provider);
      } else {
        newSet.add(provider);
      }
      return newSet;
    });
  };

  // Get provider statistics
  const getProviderStats = useCallback((provider: string) => {
    const providerModels = groupedModels[provider] || [];
    const enabled = providerModels.filter(model => {
      const keyName = getModelFullName(model);
      return currentConfigModels.includes(keyName);
    }).length;
    return { enabled, total: providerModels.length };
  }, [groupedModels, currentConfigModels]);

  return (
    <div className="flex flex-col flex-1 bg-background text-foreground h-full w-full">
      <div className="px-6 py-8 pt-0 w-full flex flex-col h-full">
        {/* Header - Sticky */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 sticky top-0 z-20 bg-background pt-4"
        >
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-1">Model Configuration</h1>
            <p className="text-sm text-zinc-400">Manage available models for your project</p>
          </div>
          {/* Search and Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Input
                placeholder="Search models and providers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-xs bg-zinc-900 border-zinc-700 text-foreground placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-transparent transition-all duration-200"
              />
            </div>

            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllModels}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-all duration-200"
                    >
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select All
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Enable all available models</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deselectAllModels}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-all duration-200"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Select None
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Disable all models</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetToDefaults}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-all duration-200"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset to default configuration</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </motion.div>

        {/* Models List - Scrollable */}
        <motion.div
          ref={scrollContainerRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="space-y-4 mb-8 overflow-y-auto flex-1"
          style={{ maxHeight: 'calc(100vh - 300px)' }}
        >
          {loadingModelRestrictions ? (
            <ModelListSkeleton />
          ) : Object.entries(groupedModels).length === 0 ? (
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="py-12 text-center">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Search className="h-10 w-10 text-muted-foreground opacity-40" />
                  <div className="text-lg font-medium">
                    {searchTerm ? "No models match your search" : "No models available"}
                  </div>
                  {searchTerm && (
                    <p className="text-sm text-muted-foreground">Try adjusting your search terms</p>
                  )}
                  {searchTerm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchTerm('')}
                      className="mt-2"
                    >
                      Clear Search
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedModels).map(([provider, providerModels]) => {
              const isExpanded = expandedProviders.has(provider);
              const stats = getProviderStats(provider);
              const allEnabled = stats.enabled === stats.total;
              const someEnabled = stats.enabled > 0 && stats.enabled < stats.total;
              const enabledPercentage = stats.total > 0 ? (stats.enabled / stats.total) * 100 : 0;

              return (
                <Card key={provider} className="bg-zinc-900 border-zinc-800 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                  <CardHeader
                    className="cursor-pointer hover:bg-zinc-800/50 transition-all duration-200 py-3 px-4"
                    onClick={() => toggleProviderExpansion(provider)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <IndeterminateCheckbox
                          checked={allEnabled}
                          indeterminate={someEnabled}
                          onCheckedChange={() => toggleProvider({
                            provider,
                            selectAll: !allEnabled,
                          })}
                          indeterminateColor="bg-white"
                          checkedColor="bg-white"
                          iconColorClass="text-black"
                          checkboxSizeClass="h-4 w-4"
                          className="border-white/20 data-[state=checked]:bg-white data-[state=checked]:text-black"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-zinc-800">
                            <ProviderIcon provider_name={provider} className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-sm font-semibold capitalize text-zinc-100">
                                {provider}
                              </CardTitle>
                              <span className="text-xs text-zinc-500">
                                {stats.enabled} of {stats.total}
                              </span>
                            </div>
                            {stats.enabled > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                <div className="h-1 w-20 bg-zinc-700 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-zinc-400 transition-all duration-300"
                                    style={{ width: `${enabledPercentage}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-zinc-500">
                                  {Math.round(enabledPercentage)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="h-4 w-4 text-zinc-400" />
                        </motion.div>
                      </div>
                    </div>
                  </CardHeader>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <CardContent className="pt-0 pb-4">
                          <div className="border-t border-border pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                              {providerModels.map(model => {
                                const modelKey = getModelFullName(model);
                                const isEnabled = currentConfigModels.includes(modelKey);

                                return (
                                  <ModelCard
                                    key={modelKey}
                                    model={model}
                                    modelKey={modelKey}
                                    isEnabled={isEnabled}
                                    onToggle={toggleModel}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })
          )}
        </motion.div>

        {/* Save Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-8 sticky bottom-0 z-20 bg-background pb-4"
        >
          <div className="bg-zinc-900 border-t border-zinc-800 rounded-lg shadow-lg">
            <div className="p-4">
              <div className="flex flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  {loadingModelRestrictions ? (
                    <ConfigSummarySkeleton />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-zinc-100">
                          {currentConfigModels.length} of {totalModels} models enabled
                        </div>
                      </div>
                      {currentConfigModels.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors hover:cursor-help">
                                <InfoIcon className="w-3 h-3"/>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md max-h-[300px] overflow-y-auto p-4 border border-zinc-700" side="top" align="start">
                              <ModelTooltipContent 
                                models={currentConfigModels} 
                                title="Selected Models:" 
                              />
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  onClick={saveConfiguration}
                  disabled={!isEnabledSave}
                  className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 font-medium px-5 py-2 h-9 transition-all duration-200 disabled:opacity-40 flex items-center"
                >
                  {updatingModelRestrictions ? (
                    <>
                      <div className="h-3 w-3 rounded-full border-2 border-t-transparent border-zinc-900 animate-spin mr-2"></div>
                      <span className="text-sm">Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5 mr-2" />
                      <span className="text-sm">Save Changes</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

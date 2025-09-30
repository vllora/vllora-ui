import { ModelPricing } from "@/types/models";

export function formatContextSize(size: number): string {
  if (size >= 1000000) {
    return `${(size / 1000000).toFixed(1)}M`;
  } else if (size >= 1000) {
    return `${(size / 1000).toFixed(0)}K`;
  }
  return size.toString();
}

export function formatCost(cost: number): string {
  if (cost === 0) return "Free";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function getModelFullName(model: ModelPricing): string {
  return `${model.model_provider}/${model.model}`;
}

export function getPublisherFromModel(model: string): string {
  const parts = model.split('/');
  return parts.length > 1 ? parts[0] : '';
}

export function getModelShortName(model: string): string {
  const parts = model.split('/');
  return parts.length > 1 ? parts[1] : model;
}

export function isNewModel(releaseDate?: string): boolean {
  if (!releaseDate) return false;
  const date = new Date(releaseDate);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return date > thirtyDaysAgo;
}

export function groupModelsByName(models: ModelPricing[]): Record<string, ModelPricing[]> {
  return models.reduce((acc, model) => {
    const key = model.model;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(model);
    return acc;
  }, {} as Record<string, ModelPricing[]>);
}

export function sortModelsByDate(models: ModelPricing[]): ModelPricing[] {
  return [...models].sort((a, b) => {
    const dateA = new Date(a.release_date || a.langdb_release_date || 0);
    const dateB = new Date(b.release_date || b.langdb_release_date || 0);
    return dateB.getTime() - dateA.getTime();
  });
}
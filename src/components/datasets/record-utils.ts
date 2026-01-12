/**
 * Utility functions for dataset records
 */

import { DatasetRecord } from "@/types/dataset-types";

// Helper to safely access record data as object
export const getDataAsObject = (record: DatasetRecord): Record<string, unknown> => {
  return (record.data as Record<string, unknown>) || {};
};

// Get label from record attributes
export const getLabel = (record: DatasetRecord): string | undefined => {
  const data = getDataAsObject(record);
  const attr = data.attribute as Record<string, unknown> | undefined;
  return attr?.label as string | undefined;
};

// Get provider name from record attributes
export const getProviderName = (record: DatasetRecord): string => {
  const data = getDataAsObject(record);
  const attr = data.attribute as Record<string, unknown> | undefined;
  const provider = attr?.provider_name as string | undefined;
  if (provider) return provider.toLowerCase();
  // Try to infer from model name
  const model = attr?.model as Record<string, unknown> | undefined;
  const modelName = (model?.name as string) || (attr?.model_name as string) || "";
  if (modelName.includes("gpt") || modelName.includes("o1") || modelName.includes("o3")) return "openai";
  if (modelName.includes("claude")) return "anthropic";
  if (modelName.includes("llama") || modelName.includes("meta")) return "meta";
  if (modelName.includes("gemini")) return "google";
  if (modelName.includes("mistral")) return "mistral";
  return "unknown";
};

// Get record display name (label or id truncated)
export const getRecordName = (record: DatasetRecord): string => {
  const label = getLabel(record);
  if (label) return label;
  const data = getDataAsObject(record);
  const spanId = (data.span_id as string) || record.id;
  if (spanId.length > 16) return spanId.slice(0, 16) + "...";
  return spanId;
};

// Get provider badge color
export const getProviderColor = (provider: string): string => {
  switch (provider) {
    case "openai": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "anthropic": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "meta": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "google": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "mistral": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

// Get topic badge color based on topic name
export const getTopicColor = (topic: string | undefined): string => {
  if (!topic) return "";
  const t = topic.toLowerCase();
  if (t.includes("safety") || t.includes("safe")) return "bg-green-500/20 text-green-400 border-green-500/30";
  if (t.includes("jailbreak") || t.includes("attack")) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (t.includes("pii") || t.includes("privacy")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (t.includes("error") || t.includes("fail")) return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-[rgb(var(--theme-500))]/20 text-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]/30";
};

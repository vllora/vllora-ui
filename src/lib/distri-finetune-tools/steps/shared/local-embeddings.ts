/**
 * Local Embeddings Singleton
 *
 * Lazy-loads the @huggingface/transformers pipeline with all-MiniLM-L6-v2
 * (~23MB quantized ONNX/WASM). The model is loaded once per browser session
 * and reused across invocations.
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

// Singleton state
let embeddingPipeline: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

export type EmbeddingProgressCallback = (info: {
  status: string;
  progress?: number;
  file?: string;
}) => void;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const BATCH_SIZE = 32;

/**
 * Get (or lazily initialize) the embedding pipeline.
 */
async function getPipeline(
  onProgress?: EmbeddingProgressCallback
): Promise<FeatureExtractionPipeline> {
  if (embeddingPipeline) return embeddingPipeline;

  if (!loadingPromise) {
    loadingPromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: onProgress
        ? (data: { status: string; progress?: number; file?: string }) => {
            onProgress({
              status: data.status,
              progress: data.progress,
              file: data.file,
            });
          }
        : undefined,
    }).then((p) => {
      embeddingPipeline = p as FeatureExtractionPipeline;
      loadingPromise = null;
      return embeddingPipeline;
    }).catch((err) => {
      loadingPromise = null;
      throw err;
    });
  }

  return loadingPromise;
}

/**
 * Embed an array of texts using the local all-MiniLM-L6-v2 model.
 * Batches inputs to avoid memory spikes on large documents.
 *
 * @returns A 2D array where each inner array is the embedding vector for the corresponding text.
 */
export async function embed(
  texts: string[],
  onProgress?: EmbeddingProgressCallback
): Promise<number[][]> {
  const pipe = await getPipeline(onProgress);
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const output = await pipe(batch, { pooling: 'mean', normalize: true });

    // output.tolist() returns number[][] for batched input
    const batchEmbeddings = output.tolist() as number[][];
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Check if the embedding model is already loaded in memory.
 */
export function isModelLoaded(): boolean {
  return embeddingPipeline !== null;
}

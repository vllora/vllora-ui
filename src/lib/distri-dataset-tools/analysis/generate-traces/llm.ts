/**
 * LLM utilities for trace generation
 */

import { DistriClient, type DistriMessage } from '@distri/core';
import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import { tryParseJson } from './utils';

/**
 * Simple semaphore for limiting concurrent operations
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];
  private runningCount = 0;

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<boolean> {
    if (this.permits > 0) {
      this.permits--;
      this.runningCount++;
      console.log(`[Semaphore] Acquired immediately. Running: ${this.runningCount}, Queued: ${this.queue.length}`);
      return true; // acquired immediately
    }
    console.log(`[Semaphore] No permits available, queuing... Running: ${this.runningCount}, Queued: ${this.queue.length + 1}`);
    return new Promise<boolean>((resolve) => {
      this.queue.push(() => {
        this.runningCount++;
        console.log(`[Semaphore] Acquired from queue. Running: ${this.runningCount}, Queued: ${this.queue.length}`);
        resolve(false); // acquired from queue
      });
    });
  }

  release(): void {
    this.runningCount--;
    const next = this.queue.shift();
    if (next) {
      console.log(`[Semaphore] Released, waking next queued task. Running: ${this.runningCount}, Queued: ${this.queue.length}`);
      next();
    } else {
      this.permits++;
      console.log(`[Semaphore] Released, no tasks waiting. Running: ${this.runningCount}, Available permits: ${this.permits}`);
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Global semaphore for LLM requests - will be configured per generateTraces call
let llmSemaphore: Semaphore | null = null;

let cachedLucyConfig: LucyConfig | null = null;

const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
  if (cachedLucyConfig) return cachedLucyConfig;
  cachedLucyConfig = await fetchLucyConfig();
  return cachedLucyConfig;
};

export function setLLMConcurrency(maxConcurrent: number): void {
  llmSemaphore = new Semaphore(maxConcurrent);
  console.log(`[generateTraces] LLM concurrency set to ${maxConcurrent}`);
}

export function initMessage(role: 'system' | 'user' | 'assistant', content: string): DistriMessage {
  return DistriClient.initDistriMessage(role, [{ part_type: 'text', data: content }]);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureResponseFormat(format?: unknown): unknown | undefined {
  if (!format || typeof format !== 'object') return undefined;
  const jsonSchema = (format as { json_schema?: { name?: unknown } }).json_schema;
  if (!jsonSchema || typeof jsonSchema !== 'object') return format;
  const name = (jsonSchema as { name?: unknown }).name;
  if (typeof name !== 'string') {
    return { ...(format as object), json_schema: { ...jsonSchema, name: 'assistant_turn' } };
  }
  const normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeName = normalized.length > 0 ? normalized : 'assistant_turn';
  if (safeName !== name) {
    return { ...(format as object), json_schema: { ...jsonSchema, name: safeName } };
  }
  return format;
}

// Timeout wrapper for promises
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// Default timeout for LLM calls (60 seconds)
const LLM_TIMEOUT_MS = 60000;

export async function callLLM(
  messages: DistriMessage[],
  options?: { responseFormat?: unknown; temperature?: number }
): Promise<string> {
  // Use semaphore to limit concurrent LLM requests
  const executeCall = async (): Promise<string> => {
    console.log(`[callLLM] Fetching Lucy config...`);
    const lucyConfig = await fetchLucyConfigCached();
    const rawUrl = lucyConfig.distri_url || getDistriUrl();
    const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;
    console.log(`[callLLM] Using base URL: ${baseUrl}`);

    const distriClient = DistriClient.create({ baseUrl });
    const modelSettingsFromConfig = lucyConfig.model_settings || {};
    const { response_format: _ignoredResponseFormat, ...modelSettingsBase } = modelSettingsFromConfig as Record<string, unknown>;
    const responseFormat = ensureResponseFormat(options?.responseFormat);

    const modelSettings = {
      ...modelSettingsBase,
      model: modelSettingsFromConfig.model || 'openai/gpt-4.1-mini',
      temperature: options?.temperature ?? modelSettingsFromConfig.temperature ?? 0.5,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    };

    console.log(`[callLLM] Model settings:`, { model: modelSettings.model, temperature: modelSettings.temperature });

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const startTime = Date.now();
        console.log(`[callLLM] Attempt ${attempt + 1}/3 - calling distriClient.llm()...`);

        // Add timeout to the LLM call
        const response = await withTimeout(
          distriClient.llm(messages, [], { model_settings: modelSettings }),
          LLM_TIMEOUT_MS,
          'LLM call'
        );

        const elapsed = Date.now() - startTime;
        if (!response.content) {
          throw new Error('LLM returned empty response');
        }
        console.log(`[callLLM] Response received in ${elapsed}ms (${response.content.length} chars)`);
        return response.content.trim();
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[callLLM] Attempt ${attempt + 1}/3 failed: ${errMsg}`);
        if (attempt < 2) {
          const delay = 800 * Math.pow(2, attempt);
          console.log(`[callLLM] Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('LLM call failed');
  };

  // If semaphore is set, use it to limit concurrency
  if (llmSemaphore) {
    console.log(`[callLLM] Requesting semaphore...`);
    return llmSemaphore.run(async () => {
      console.log(`[callLLM] Semaphore acquired, starting execution...`);
      return executeCall();
    });
  }
  return executeCall();
}

export async function callLLMText(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = systemPrompt
    ? [initMessage('system', systemPrompt), initMessage('user', prompt)]
    : [initMessage('user', prompt)];
  return callLLM(messages);
}

export async function callLLMJson<T>(messages: DistriMessage[], responseFormat: unknown): Promise<T> {
  const content = await callLLM(messages, { responseFormat });
  const parsed = tryParseJson<T>(content);
  if (!parsed) {
    throw new Error('Failed to parse JSON response');
  }
  return parsed;
}

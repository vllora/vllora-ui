/**
 * Shared Lucy Client
 *
 * Direct fetch wrapper for the Lucy /lucy/v1/chat/completions endpoint.
 * Replaces DistriClient for LLM calls that need multipart content blocks
 * (e.g., file content blocks for native document understanding).
 */

import { getInferObjectiveUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';

// =============================================================================
// Types
// =============================================================================

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface FileContentBlock {
  type: 'file';
  file: {
    filename: string;
    file_data: string; // data:<mime>;base64,...
  };
}

export type ContentBlock = TextContentBlock | FileContentBlock;

export interface LucyMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface LucyChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
  label?: string;
}

// =============================================================================
// Lucy Config Cache
// =============================================================================

let cachedLucyConfig: LucyConfig | null = null;

export async function fetchLucyConfigCached(): Promise<LucyConfig> {
  if (cachedLucyConfig) return cachedLucyConfig;
  const config = await fetchLucyConfig();
  cachedLucyConfig = config || {};
  return cachedLucyConfig;
}

// =============================================================================
// Main Client
// =============================================================================

/**
 * Call the Lucy chat completions endpoint directly via fetch.
 * Supports multipart content blocks (text + file) in messages.
 *
 * Returns the assistant's response content as a string.
 */
/** Per-request timeout in ms — prevents hanging when LLM is unresponsive */
const LLM_REQUEST_TIMEOUT_MS = 90_000;

export async function callLucy(
  messages: LucyMessage[],
  options: LucyChatOptions = {},
): Promise<string> {
  const lucyConfig = await fetchLucyConfigCached();
  const modelSettings = lucyConfig.model_settings || {};

  const model = options.model || modelSettings.model || 'openai/gpt-4.1';
  const temperature = options.temperature ?? modelSettings.temperature ?? 0.7;
  const max_tokens = options.max_tokens || modelSettings.max_tokens || undefined;

  const isGpt5 = model.includes('gpt-5');

  const body: Record<string, unknown> = {
    model,
    messages,
    // gpt-5 series only supports default temperature (1)
    ...(isGpt5 ? {} : { temperature }),
  };

  if (max_tokens) {
    // gpt-5 series requires max_completion_tokens instead of max_tokens
    body[isGpt5 ? 'max_completion_tokens' : 'max_tokens'] = max_tokens;
  }

  if (options.response_format) {
    body.response_format = options.response_format;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(getInferObjectiveUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-label': options.label || 'lucy_chat',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lucy API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Lucy returned empty response');
      }

      return content;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error(`Lucy LLM call timed out after ${LLM_REQUEST_TIMEOUT_MS / 1000}s`);
      } else {
        lastError = err;
      }
      console.error(`[lucy-client] Attempt ${attempt + 1}/3 failed:`, lastError);
      if (attempt < 2) {
        const backoffMs = 800 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Lucy call failed');
}

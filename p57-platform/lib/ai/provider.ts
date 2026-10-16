/**
 * Model provider adapter.
 *
 * The platform ships working with NO external model connected. In that state the strategist,
 * generator, naming and copy features are served by the deterministic local engine
 * (lib/engine/recommend.ts, lib/engine/copy.ts) and the UI labels them as the
 * "Local strategist engine — no external model connected".
 *
 * If an administrator supplies an API key (Settings → AI, or an environment variable), the
 * platform will call that provider for language generation and idea variation. Numbers are still
 * produced by the pricing engine, never by the model.
 *
 * No endpoint is claimed to work without a configured key, and no integration is faked.
 */
import type { AIProviderConfig } from '@/lib/types';

export interface ModelCall {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelResult {
  ok: boolean;
  text: string | null;
  provider: string;
  model: string | null;
  durationMs: number;
  error?: string;
}

export interface ProviderResolution {
  config: AIProviderConfig;
  key: string | null;
  keySource: 'settings' | 'environment' | null;
}

const ENV_KEYS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
};

export const PROVIDER_CATALOGUE = [
  { id: 'local_strategist', label: 'Local strategist engine', models: ['rules-v1'] , note: 'Deterministic, catalogue-driven. Works with no network access and no key.' },
  { id: 'anthropic', label: 'Anthropic Claude', models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'], note: 'Requires your own API key.' },
  { id: 'openai', label: 'OpenAI', models: ['gpt-5', 'gpt-4.1', 'gpt-4o-mini'], note: 'Requires your own API key.' },
  { id: 'gemini', label: 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], note: 'Requires your own API key.' },
] as const;

export function resolveProvider(config: AIProviderConfig): ProviderResolution {
  if (config.provider !== 'local_strategist' && config.keyHint) {
    return { config, key: config.keyHint, keySource: 'settings' };
  }
  if (config.provider !== 'local_strategist') {
    for (const env of ENV_KEYS[config.provider] ?? []) {
      const key = process.env[env];
      if (key && key.length > 8) return { config, key, keySource: 'environment' };
    }
  }
  return { config: { ...config, provider: 'local_strategist', model: 'rules-v1' }, key: null, keySource: null };
}

export function maskKey(key: string | null): string | null {
  if (!key) return null;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/**
 * The stored config keeps the full key server-side only; the browser receives a masked hint.
 * (Field is named `keyHint` for that reason — it holds the real key in the database.)
 */
export async function callModel(resolution: ProviderResolution, call: ModelCall): Promise<ModelResult> {
  const started = Date.now();
  const { config, key } = resolution;
  if (!key) {
    return { ok: false, text: null, provider: 'local_strategist', model: 'rules-v1', durationMs: 0, error: 'No model provider configured — local strategist engine in use.' };
  }
  try {
    if (config.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: config.model, max_tokens: call.maxTokens ?? 2000, temperature: call.temperature ?? 0.6,
          system: call.system, messages: [{ role: 'user', content: call.user }],
        }),
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      const text = (json.content ?? []).map((c: any) => c.text ?? '').join('').trim();
      return { ok: true, text, provider: config.provider, model: config.model, durationMs: Date.now() - started };
    }
    if (config.provider === 'openai') {
      const res = await fetch(`${config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: config.model, temperature: call.temperature ?? 0.6, max_tokens: call.maxTokens ?? 2000,
          messages: [{ role: 'system', content: call.system }, { role: 'user', content: call.user }],
          response_format: { type: 'json_object' },
        }),
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      return { ok: true, text: json.choices?.[0]?.message?.content ?? null, provider: config.provider, model: config.model, durationMs: Date.now() - started };
    }
    if (config.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: call.system }] },
          contents: [{ role: 'user', parts: [{ text: call.user }] }],
          generationConfig: { temperature: call.temperature ?? 0.6, maxOutputTokens: call.maxTokens ?? 2000, responseMimeType: 'application/json' },
        }),
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      const text = (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
      return { ok: true, text, provider: config.provider, model: config.model, durationMs: Date.now() - started };
    }
    throw new Error(`Unsupported provider ${config.provider}`);
  } catch (err: any) {
    return { ok: false, text: null, provider: config.provider, model: config.model, durationMs: Date.now() - started, error: err?.message ?? 'Model call failed' };
  }
}

export function parseJsonLoose(text: string | null): any | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

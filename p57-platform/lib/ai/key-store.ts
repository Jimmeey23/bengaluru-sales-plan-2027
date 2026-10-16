/**
 * Durable store for the AI provider configuration, including the API key.
 *
 * The workspace database is rebuilt whenever the seed version changes, which would silently drop
 * a key someone pasted into Settings → AI. This file lives beside the database, is gitignored and
 * written owner-read-only, and is the source the seed restores the AI settings from — so a key
 * saved once applies to every member, every session and every re-seed until it is removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AIProviderConfig } from '@/lib/types';

// On Vercel only /tmp is writable and it does not outlive the function instance; there the durable
// route is an OPENAI_API_KEY (or ANTHROPIC_/GEMINI_) environment variable, which the seed picks up.
const STORE_PATH = process.env.P57_AI_CONFIG_PATH
  || (process.env.VERCEL ? path.join('/tmp', 'p57-ai-config.json') : path.join(process.cwd(), 'data', 'ai-config.local.json'));

export function readStoredAiConfig(): AIProviderConfig | null {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return parsed && typeof parsed.provider === 'string' ? (parsed as AIProviderConfig) : null;
  } catch {
    return null;
  }
}

/** Without a saved config, a provider key in the environment makes that provider the default. */
export function environmentAiConfig(): AIProviderConfig | null {
  const now = new Date().toISOString();
  const from = (provider: AIProviderConfig['provider'], model: string): AIProviderConfig => ({
    provider, model, keyConfigured: true, keyHint: null, baseUrl: null, label: '', updatedAt: now, updatedBy: 'environment',
  });
  if (process.env.OPENAI_API_KEY) return from('openai', 'gpt-4.1');
  if (process.env.ANTHROPIC_API_KEY) return from('anthropic', 'claude-sonnet-4-5');
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return from('gemini', 'gemini-2.5-flash');
  return null;
}

export function writeStoredAiConfig(config: AIProviderConfig): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

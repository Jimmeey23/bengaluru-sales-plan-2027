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

const STORE_PATH = process.env.P57_AI_CONFIG_PATH || path.join(process.cwd(), 'data', 'ai-config.local.json');

export function readStoredAiConfig(): AIProviderConfig | null {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return parsed && typeof parsed.provider === 'string' ? (parsed as AIProviderConfig) : null;
  } catch {
    return null;
  }
}

export function writeStoredAiConfig(config: AIProviderConfig): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

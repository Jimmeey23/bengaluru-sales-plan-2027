import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runSeed } from './seed';
import { SEED_VERSION } from './version';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.P57_DB_PATH || path.join(DATA_DIR, 'app.db');

declare global {
  // eslint-disable-next-line no-var
  var __p57db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (global.__p57db) return global.__p57db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(process.cwd(), 'lib', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  runMigrations(db);
  global.__p57db = db;
  const seeded = db.prepare(`SELECT value FROM meta WHERE key = 'seed_version'`).get() as { value: string } | undefined;
  if (!seeded || seeded.value !== SEED_VERSION) {
    runSeed(db);
  }
  return db;
}


function runMigrations(db: Database.Database) {
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  // additive migrations for forward compatibility
  ensureColumn('offers', 'generation_json', 'generation_json TEXT');
  ensureColumn('catalogue_products', 'manual_review_note', 'manual_review_note TEXT');
  ensureColumn('campaigns', 'actuals_json', 'actuals_json TEXT');
  // Generation history records which provider line produced each result, so a local-engine run is
  // never mistaken later for a model-backed one.
  ensureColumn('ai_generations', 'provider_label', 'provider_label TEXT');
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function jsonGet<T>(row: any, key: string, fallback: T): T {
  const raw = row?.[key];
  if (raw == null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function readDerived<T>(file: string): T | null {
  const p = path.join(DATA_DIR, 'derived', file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return null; }
}

export { SEED_VERSION };

-- Physique 57 India — Offer Management & Revenue Optimisation Platform
-- SQLite schema (single-file, server-side). Designed so every entity maps cleanly onto
-- PostgreSQL/Supabase when the platform moves to managed infrastructure: JSON columns here
-- become jsonb, TEXT ids become uuid, and the migration path is a column-for-column copy.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  city        TEXT NOT NULL,
  brand       TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','manager','sales','viewer')),
  title         TEXT NOT NULL DEFAULT '',
  avatar_color  TEXT NOT NULL DEFAULT '#B4533A',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- catalogue
CREATE TABLE IF NOT EXISTS catalogue_products (
  id                     TEXT PRIMARY KEY,
  source_id              TEXT NOT NULL,
  source_file            TEXT NOT NULL,
  source_index           INTEGER NOT NULL,
  raw_block              TEXT NOT NULL,
  raw_block_hash         TEXT NOT NULL,
  name                   TEXT NOT NULL,
  product_class          TEXT NOT NULL,
  exclusion_reason       TEXT,
  status                 TEXT NOT NULL DEFAULT 'review',
  status_basis           TEXT NOT NULL DEFAULT '',
  location_id            TEXT NOT NULL REFERENCES locations(id),
  price                  REAL,
  price_type             TEXT,
  duration               REAL,
  duration_unit          TEXT,
  duration_days          INTEGER,
  credits                INTEGER,
  complimentary_credits  INTEGER,
  credit_source          TEXT,
  unlimited_access       INTEGER NOT NULL DEFAULT 0,
  private_session_count  INTEGER,
  is_intro_offer         INTEGER NOT NULL DEFAULT 0,
  audience_restriction   TEXT NOT NULL DEFAULT 'general_public',
  description            TEXT NOT NULL DEFAULT '',
  benefits_json          TEXT NOT NULL DEFAULT '[]',
  policies_json          TEXT NOT NULL DEFAULT '{}',
  eligibility_json       TEXT NOT NULL DEFAULT '{}',
  observed_json          TEXT,
  tags_json              TEXT NOT NULL DEFAULT '[]',
  parse_confidence       TEXT NOT NULL DEFAULT 'medium',
  warnings_json          TEXT NOT NULL DEFAULT '[]',
  manual_review_note     TEXT,
  soft_deleted           INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT,
  modified_at            TEXT,
  version                INTEGER NOT NULL DEFAULT 1,
  updated_at             TEXT NOT NULL,
  updated_by             TEXT
);
CREATE INDEX IF NOT EXISTS idx_catalogue_location ON catalogue_products(location_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_class ON catalogue_products(product_class);

CREATE TABLE IF NOT EXISTS catalogue_versions (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  snapshot_json  TEXT NOT NULL,
  changed_fields TEXT NOT NULL DEFAULT '[]',
  note           TEXT,
  author_id      TEXT,
  created_at     TEXT NOT NULL
);

-- ---------------------------------------------------------------- offers
CREATE TABLE IF NOT EXISTS offers (
  id                   TEXT PRIMARY KEY,
  code                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  internal_title       TEXT,
  description          TEXT NOT NULL DEFAULT '',
  promo_copy           TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'draft',
  origin               TEXT NOT NULL DEFAULT 'manual',
  base_product_id      TEXT REFERENCES catalogue_products(id),
  base_product_name    TEXT,
  location_ids         TEXT NOT NULL DEFAULT '[]',
  components           TEXT NOT NULL DEFAULT '[]',
  audience_segments    TEXT NOT NULL DEFAULT '[]',
  objectives           TEXT NOT NULL DEFAULT '[]',
  eligibility          TEXT NOT NULL DEFAULT '{}',
  terms                TEXT NOT NULL DEFAULT '{}',
  tags                 TEXT NOT NULL DEFAULT '[]',
  collection_ids       TEXT NOT NULL DEFAULT '[]',
  campaign_id          TEXT,
  owner_id             TEXT NOT NULL REFERENCES users(id),
  collaborator_ids     TEXT NOT NULL DEFAULT '[]',
  internal_notes       TEXT NOT NULL DEFAULT '',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  published_at         TEXT,
  expires_on           TEXT,
  version              INTEGER NOT NULL DEFAULT 1,
  approved_version     INTEGER,
  requires_reapproval  INTEGER NOT NULL DEFAULT 0,
  favourite            INTEGER NOT NULL DEFAULT 0,
  pinned               INTEGER NOT NULL DEFAULT 0,
  archived_at          TEXT,
  metrics_json         TEXT,
  generation_json      TEXT,
  concept_only         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_owner ON offers(owner_id);
CREATE INDEX IF NOT EXISTS idx_offers_campaign ON offers(campaign_id);

CREATE TABLE IF NOT EXISTS offer_versions (
  id             TEXT PRIMARY KEY,
  offer_id       TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  snapshot_json  TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  changed_fields TEXT NOT NULL DEFAULT '[]',
  author_id      TEXT NOT NULL,
  approval_state TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_offer ON offer_versions(offer_id);

CREATE TABLE IF NOT EXISTS approvals (
  id         TEXT PRIMARY KEY,
  offer_id   TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  action     TEXT NOT NULL,
  actor_id   TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  offer_id    TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  mentions    TEXT NOT NULL DEFAULT '[]',
  parent_id   TEXT,
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  entity_label TEXT NOT NULL,
  detail       TEXT,
  meta_json    TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  accent      TEXT NOT NULL DEFAULT 'ink',
  kind        TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  objective         TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  audience_segments TEXT NOT NULL DEFAULT '[]',
  location_ids      TEXT NOT NULL DEFAULT '[]',
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'planned',
  offer_ids         TEXT NOT NULL DEFAULT '[]',
  owner_id          TEXT NOT NULL,
  member_ids        TEXT NOT NULL DEFAULT '[]',
  messaging         TEXT NOT NULL DEFAULT '',
  expected_json     TEXT NOT NULL DEFAULT '[]',
  actuals_json      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ai_generations (
  id              TEXT PRIMARY KEY,
  mode            TEXT NOT NULL,
  provider        TEXT NOT NULL,
  /** Human-readable provider line shown in the workspace ("Local strategist engine — no key"). */
  provider_label  TEXT,
  engine_version  TEXT NOT NULL,
  prompt          TEXT,
  inputs_json     TEXT NOT NULL DEFAULT '{}',
  output_summary  TEXT NOT NULL DEFAULT '',
  offer_ids_json  TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  fallback_reason TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  href       TEXT NOT NULL DEFAULT '/offers',
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- Actual outcomes recorded against an offer (populated only when genuine sales data exists).
CREATE TABLE IF NOT EXISTS performance_records (
  id         TEXT PRIMARY KEY,
  offer_id   TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  metric     TEXT NOT NULL,
  label      TEXT NOT NULL,
  expected   REAL,
  actual     REAL,
  unit       TEXT NOT NULL DEFAULT '',
  basis      TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT '',
  period     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
  id           TEXT PRIMARY KEY,
  filename     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT '',
  rows         INTEGER NOT NULL DEFAULT 0,
  inserted     INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  flagged      INTEGER NOT NULL DEFAULT 0,
  report_json  TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'processed',
  created_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL
);

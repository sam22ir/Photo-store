-- Lamsa Studio database schema (Cloudflare D1)
-- Paste this whole file into the D1 Console and run it once.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  style TEXT,
  input_key TEXT,
  output_key TEXT,
  prompt TEXT,
  status TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id, created_at);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  pack TEXT NOT NULL,
  amount_dzd INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  method TEXT NOT NULL,
  receipt_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- Migration: image size choice (run once on existing databases; fails if the column already exists)
ALTER TABLE generations ADD COLUMN size TEXT;

-- Migration 2026-11-18: versions, retries, edits, cutouts, brand kit, saved settings
ALTER TABLE generations ADD COLUMN batch_id TEXT;
ALTER TABLE generations ADD COLUMN parent_id TEXT;
ALTER TABLE generations ADD COLUMN kind TEXT;
ALTER TABLE generations ADD COLUMN free_retry INTEGER NOT NULL DEFAULT 0;
ALTER TABLE generations ADD COLUMN source_key TEXT;
ALTER TABLE generations ADD COLUMN logo_key TEXT;
CREATE INDEX IF NOT EXISTS idx_generations_retry ON generations(user_id, free_retry, created_at);
CREATE TABLE IF NOT EXISTS brand_kits (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  shop_name TEXT, colors TEXT, logo_key TEXT, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presets_user ON presets(user_id);

-- Migration 2026-11-18: Chargily online payments
ALTER TABLE payments ADD COLUMN checkout_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments(checkout_id);

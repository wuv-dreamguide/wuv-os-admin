/**
 * WUV Admin — SQLite database layer
 * v2.0 — Multi-tenant SaaS schema
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'wuv-admin.db');
let db;

function init() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Core tables (safe to run on existing DB) ─────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      type          TEXT DEFAULT 'school',
      status        TEXT DEFAULT 'active',
      device_limit  INTEGER DEFAULT 10,
      contact_email TEXT,
      contact_name  TEXT,
      notes         TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      tier          TEXT DEFAULT 'starter',
      device_limit  INTEGER DEFAULT 10,
      expires_at    TEXT,
      status        TEXT DEFAULT 'active',
      billing_ref   TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fleet_keys (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      key_value     TEXT UNIQUE NOT NULL,
      label         TEXT,
      is_active     INTEGER DEFAULT 1,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_users (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT,
      role          TEXT DEFAULT 'admin',
      is_active     INTEGER DEFAULT 1,
      last_login    TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id            TEXT PRIMARY KEY,
      machine_id    TEXT UNIQUE NOT NULL,
      hostname      TEXT,
      ip_address    TEXT,
      version       TEXT,
      fleet_key     TEXT,
      first_seen    TEXT NOT NULL,
      last_seen     TEXT NOT NULL,
      status        TEXT DEFAULT 'active',
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS heartbeats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id  TEXT NOT NULL,
      version     TEXT,
      ip_address  TEXT,
      hostname    TEXT,
      ts          TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ota_versions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      version     TEXT NOT NULL,
      channel     TEXT DEFAULT 'stable',
      url         TEXT NOT NULL,
      sha256      TEXT,
      size        INTEGER,
      build_date  TEXT,
      is_current  INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_heartbeats_machine ON heartbeats(machine_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_ts      ON heartbeats(received_at);
    CREATE INDEX IF NOT EXISTS idx_licenses_org       ON licenses(org_id);
    CREATE INDEX IF NOT EXISTS idx_fleet_keys_org     ON fleet_keys(org_id);
    CREATE INDEX IF NOT EXISTS idx_fleet_keys_value   ON fleet_keys(key_value);
    CREATE INDEX IF NOT EXISTS idx_org_users_email    ON org_users(email);
    CREATE INDEX IF NOT EXISTS idx_org_users_org      ON org_users(org_id);
  `);

  // ── Column migrations (safe to re-run — errors ignored) ───────
  const migrations = [
    `ALTER TABLE nodes ADD COLUMN org_id TEXT REFERENCES organizations(id)`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); console.log('[db] Migration applied:', sql.slice(0, 60)); }
    catch(e) { /* column already exists — skip */ }
  }

  // org_id index — only after column guaranteed to exist
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_org ON nodes(org_id)`); }
  catch(e) { /* already exists */ }

  console.log(`[db] Ready at ${DB_PATH}`);
}

function get() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

module.exports = { init, get };

/**
 * WUV Admin — SQLite database layer
 * v2.0 — Multi-tenant SaaS schema
 */

const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'wuv-admin.db');
let db;

function init() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- ── Organizations ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS organizations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      type          TEXT DEFAULT 'school',   -- school | refurbisher | business | internal
      status        TEXT DEFAULT 'active',   -- active | suspended | cancelled
      device_limit  INTEGER DEFAULT 10,
      contact_email TEXT,
      contact_name  TEXT,
      notes         TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    -- ── Licenses ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS licenses (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      tier          TEXT DEFAULT 'starter',  -- free | starter | pro | enterprise
      device_limit  INTEGER DEFAULT 10,
      expires_at    TEXT,                    -- NULL = no expiry
      status        TEXT DEFAULT 'active',   -- active | expired | suspended
      billing_ref   TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    -- ── Fleet Keys ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS fleet_keys (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      key_value     TEXT UNIQUE NOT NULL,
      label         TEXT,
      is_active     INTEGER DEFAULT 1,
      created_at    TEXT NOT NULL
    );

    -- ── Org Users ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS org_users (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT,
      role          TEXT DEFAULT 'admin',    -- admin | viewer
      is_active     INTEGER DEFAULT 1,
      last_login    TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    -- ── Nodes (upgraded with org_id) ──────────────────────────
    CREATE TABLE IF NOT EXISTS nodes (
      id            TEXT PRIMARY KEY,
      machine_id    TEXT UNIQUE NOT NULL,
      org_id        TEXT REFERENCES organizations(id),
      hostname      TEXT,
      ip_address    TEXT,
      version       TEXT,
      fleet_key     TEXT,
      first_seen    TEXT NOT NULL,
      last_seen     TEXT NOT NULL,
      status        TEXT DEFAULT 'active',
      notes         TEXT
    );

    -- ── Heartbeats ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS heartbeats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id  TEXT NOT NULL,
      version     TEXT,
      ip_address  TEXT,
      hostname    TEXT,
      ts          TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    -- ── OTA Versions ──────────────────────────────────────────
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

    -- ── Indexes ───────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_heartbeats_machine  ON heartbeats(machine_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_ts       ON heartbeats(received_at);
    CREATE INDEX IF NOT EXISTS idx_nodes_org           ON nodes(org_id);
    CREATE INDEX IF NOT EXISTS idx_fleet_keys_org      ON fleet_keys(org_id);
    CREATE INDEX IF NOT EXISTS idx_fleet_keys_value    ON fleet_keys(key_value);
    CREATE INDEX IF NOT EXISTS idx_licenses_org        ON licenses(org_id);
    CREATE INDEX IF NOT EXISTS idx_org_users_email     ON org_users(email);
    CREATE INDEX IF NOT EXISTS idx_org_users_org       ON org_users(org_id);

    -- Migrate existing nodes: add org_id column if missing
    -- (safe to run multiple times — IF NOT EXISTS handles it)
  `);

  // Add org_id to nodes if upgrading from v1
  try {
    db.exec(`ALTER TABLE nodes ADD COLUMN org_id TEXT REFERENCES organizations(id)`);
    console.log('[db] Migrated nodes table: added org_id column');
  } catch (e) {
    // Column already exists — fine
  }

  console.log(`[db] Initialized at ${DB_PATH}`);
}

function get() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

module.exports = { init, get };

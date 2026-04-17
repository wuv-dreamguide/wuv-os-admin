/**
 * WUV Admin — SQLite database layer
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'wuv-admin.db');
let db;

function init() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_heartbeats_machine ON heartbeats(machine_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_ts ON heartbeats(received_at);

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
  `);

  console.log(`[db] Initialized at ${DB_PATH}`);
}

function get() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

module.exports = { init, get };

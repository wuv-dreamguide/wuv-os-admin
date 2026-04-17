/**
 * POST /api/heartbeat
 * Receives phone-home pings from WUV OS nodes
 * Authenticated by x-fleet-key header (per-org or global)
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db  = require('../db');
const fs  = require('fs');
const router = express.Router();

const GLOBAL_FLEET_KEY = process.env.WUV_FLEET_KEY ||
  'wuvnode_25c58dedba74fb4842945b75ed6644fde8eee80c3a2a37fe3a0793a202e3c35a';

const VERSION_JSON = process.env.VERSION_JSON_PATH || '/iso/version.json';

function getCurrentVersion() {
  try {
    return JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8'));
  } catch (e) {
    return null;
  }
}

function resolveOrg(fleetKey, database) {
  // Check per-org fleet keys first
  const fk = database.prepare(
    `SELECT fk.org_id, o.status as org_status
     FROM fleet_keys fk
     JOIN organizations o ON o.id = fk.org_id
     WHERE fk.key_value = ? AND fk.is_active = 1`
  ).get(fleetKey);
  if (fk) return fk;

  // Fall back to global fleet key (legacy / unassigned)
  if (fleetKey === GLOBAL_FLEET_KEY) return { org_id: null, org_status: 'active' };

  return null;
}

router.post('/', (req, res) => {
  const fleetKey = req.headers['x-fleet-key'];
  if (!fleetKey) return res.status(403).json({ error: 'Fleet key required' });

  const database = db.get();
  const org = resolveOrg(fleetKey, database);

  if (!org) return res.status(403).json({ error: 'Invalid fleet key' });
  if (org.org_status === 'suspended') return res.status(403).json({ error: 'Organization suspended' });

  const { machine_id, version, hostname, ts } = req.body;
  if (!machine_id) return res.status(400).json({ error: 'machine_id required' });

  const now  = new Date().toISOString();
  const ip   = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  // Upsert node
  const existing = database.prepare('SELECT id FROM nodes WHERE machine_id = ?').get(machine_id);
  if (existing) {
    database.prepare(`
      UPDATE nodes SET last_seen=?, ip_address=?, version=?, hostname=?, status='active', org_id=COALESCE(org_id, ?)
      WHERE machine_id=?
    `).run(now, ip, version || null, hostname || null, org.org_id, machine_id);
  } else {
    database.prepare(`
      INSERT INTO nodes (id, machine_id, org_id, hostname, ip_address, version, fleet_key, first_seen, last_seen, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(uuidv4(), machine_id, org.org_id, hostname || null, ip, version || null, fleetKey, now, now);
  }

  // Log heartbeat
  database.prepare(`
    INSERT INTO heartbeats (machine_id, version, ip_address, hostname, ts, received_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(machine_id, version || null, ip, hostname || null, ts || now, now);

  const currentVer = getCurrentVersion();
  const updateAvailable = currentVer && version && currentVer.version !== version;

  console.log(`[heartbeat] machine=${machine_id} host=${hostname} v=${version} org=${org.org_id || 'global'} ip=${ip}`);

  res.json({
    ok: true,
    received_at: now,
    update_available: updateAvailable || false,
    latest_version: currentVer ? currentVer.version : null,
    latest_url: updateAvailable ? currentVer.url : null,
  });
});

module.exports = router;

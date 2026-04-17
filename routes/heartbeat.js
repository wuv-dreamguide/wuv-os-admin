/**
 * POST /api/heartbeat
 * Receives phone-home pings from WUV OS nodes
 * Authenticated by x-fleet-key header
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

const FLEET_KEY = process.env.WUV_FLEET_KEY ||
  'wuvnode_25c58dedba74fb4842945b75ed6644fde8eee80c3a2a37fe3a0793a202e3c35a';

// Check the current stable version from version.json on disk
const fs = require('fs');
const path = require('path');
const VERSION_JSON = process.env.VERSION_JSON_PATH ||
  '/var/www/html/iso/version.json';

function getCurrentVersion() {
  try {
    const raw = fs.readFileSync(VERSION_JSON, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

router.post('/', (req, res) => {
  const fleetKey = req.headers['x-fleet-key'];

  if (!fleetKey || fleetKey !== FLEET_KEY) {
    return res.status(403).json({ error: 'Invalid fleet key' });
  }

  const { machine_id, version, hostname, ts } = req.body;

  if (!machine_id) {
    return res.status(400).json({ error: 'machine_id required' });
  }

  const now = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const database = db.get();

  // Upsert node record
  const existing = database.prepare(
    'SELECT id FROM nodes WHERE machine_id = ?'
  ).get(machine_id);

  if (existing) {
    database.prepare(`
      UPDATE nodes SET
        last_seen  = ?,
        ip_address = ?,
        version    = ?,
        hostname   = ?,
        status     = 'active'
      WHERE machine_id = ?
    `).run(now, ip, version || null, hostname || null, machine_id);
  } else {
    database.prepare(`
      INSERT INTO nodes (id, machine_id, hostname, ip_address, version, fleet_key, first_seen, last_seen, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(uuidv4(), machine_id, hostname || null, ip, version || null, FLEET_KEY, now, now);
  }

  // Record heartbeat log
  database.prepare(`
    INSERT INTO heartbeats (machine_id, version, ip_address, hostname, ts, received_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(machine_id, version || null, ip, hostname || null, ts || now, now);

  // Check if OTA update is available
  const currentVer = getCurrentVersion();
  const updateAvailable = currentVer && version && currentVer.version !== version;

  console.log(`[heartbeat] node=${machine_id} version=${version} ip=${ip} update_available=${updateAvailable}`);

  res.json({
    ok: true,
    received_at: now,
    update_available: updateAvailable || false,
    latest_version: currentVer ? currentVer.version : null,
    latest_url: updateAvailable ? currentVer.url : null
  });
});

module.exports = router;

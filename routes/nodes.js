/**
 * GET    /api/nodes         — list all nodes
 * GET    /api/nodes/:id     — single node + recent heartbeats
 * PUT    /api/nodes/:id     — update node notes/status
 * DELETE /api/nodes/:id     — remove node from registry
 */

'use strict';

const express = require('express');
const db      = require('../db');
const router  = express.Router();

const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function isOffline(lastSeen) {
  return new Date(lastSeen).getTime() < Date.now() - OFFLINE_THRESHOLD_MS;
}

// List all nodes
router.get('/', (req, res) => {
  const nodes = db.get()
    .prepare('SELECT * FROM nodes ORDER BY last_seen DESC')
    .all()
    .map(n => ({ ...n, status: isOffline(n.last_seen) ? 'offline' : n.status }));

  res.json({ nodes, count: nodes.length });
});

// Single node + heartbeat history
router.get('/:id', (req, res) => {
  const database = db.get();
  const node = database
    .prepare('SELECT * FROM nodes WHERE id = ? OR machine_id = ?')
    .get(req.params.id, req.params.id);

  if (!node) return res.status(404).json({ error: 'Node not found' });

  node.status = isOffline(node.last_seen) ? 'offline' : node.status;

  const heartbeats = database
    .prepare('SELECT * FROM heartbeats WHERE machine_id = ? ORDER BY received_at DESC LIMIT 50')
    .all(node.machine_id);

  res.json({ node, heartbeats });
});

// Update node notes / status
router.put('/:id', (req, res) => {
  const { notes, status } = req.body;
  const allowed = ['active', 'offline', 'quarantine', 'decommissioned'];
  const safeStatus = allowed.includes(status) ? status : 'active';

  db.get()
    .prepare('UPDATE nodes SET notes = ?, status = ? WHERE id = ? OR machine_id = ?')
    .run(notes ?? null, safeStatus, req.params.id, req.params.id);

  res.json({ ok: true });
});

// Delete node + its heartbeat history
router.delete('/:id', (req, res) => {
  const database = db.get();
  const node = database
    .prepare('SELECT machine_id FROM nodes WHERE id = ? OR machine_id = ?')
    .get(req.params.id, req.params.id);

  if (!node) return res.status(404).json({ error: 'Node not found' });

  database.prepare('DELETE FROM heartbeats WHERE machine_id = ?').run(node.machine_id);
  database.prepare('DELETE FROM nodes WHERE machine_id = ?').run(node.machine_id);

  res.json({ ok: true });
});

module.exports = router;

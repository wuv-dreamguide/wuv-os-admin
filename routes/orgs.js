/**
 * Organization + License + Fleet Key + Org User management
 * Super admin: full access
 * Org admin: own org only
 */

'use strict';

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const { requireAuth, requireOrgAccess } = require('../middleware/auth');

const router = express.Router();
const OFFLINE_MS = 30 * 60 * 1000;

function isOffline(lastSeen) {
  return !lastSeen || new Date(lastSeen).getTime() < Date.now() - OFFLINE_MS;
}

function generateFleetKey() {
  const crypto = require('crypto');
  return 'wuvorg_' + crypto.randomBytes(32).toString('hex');
}

// ── List all orgs (super admin only) ──────────────────────────
router.get('/', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });

  const database = db.get();
  const orgs = database.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM nodes n WHERE n.org_id = o.id) as device_count,
      (SELECT COUNT(*) FROM nodes n WHERE n.org_id = o.id AND n.last_seen > datetime('now', '-30 minutes')) as online_count,
      l.tier, l.expires_at, l.status as license_status, l.device_limit as license_device_limit
    FROM organizations o
    LEFT JOIN licenses l ON l.org_id = o.id AND l.status = 'active'
    ORDER BY o.created_at DESC
  `).all();

  res.json({ orgs, count: orgs.length });
});

// ── Create org (super admin only) ─────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });

  const { name, type, contact_email, contact_name, device_limit, notes,
          license_tier, license_device_limit, license_expires_at } = req.body;

  if (!name) return res.status(400).json({ error: 'name required' });

  const database = db.get();
  const now = new Date().toISOString();
  const orgId = uuidv4();

  // Create org
  database.prepare(`
    INSERT INTO organizations (id, name, type, status, device_limit, contact_email, contact_name, notes, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `).run(orgId, name, type || 'school', device_limit || 10, contact_email || null,
         contact_name || null, notes || null, now, now);

  // Create default license
  const licId = uuidv4();
  database.prepare(`
    INSERT INTO licenses (id, org_id, tier, device_limit, expires_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(licId, orgId, license_tier || 'starter', license_device_limit || device_limit || 10,
         license_expires_at || null, now, now);

  // Auto-generate first fleet key
  const fkId    = uuidv4();
  const fkValue = generateFleetKey();
  database.prepare(`
    INSERT INTO fleet_keys (id, org_id, key_value, label, is_active, created_at)
    VALUES (?, ?, ?, 'Default', 1, ?)
  `).run(fkId, orgId, fkValue, now);

  const org = database.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  const fleetKey = database.prepare('SELECT * FROM fleet_keys WHERE id = ?').get(fkId);

  res.status(201).json({ org, fleet_key: fleetKey.key_value });
});

// ── Get single org ────────────────────────────────────────────
router.get('/:orgId', requireAuth, requireOrgAccess, (req, res) => {
  const database = db.get();
  const org = database.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.orgId);
  if (!org) return res.status(404).json({ error: 'Org not found' });

  const licenses   = database.prepare('SELECT * FROM licenses WHERE org_id = ? ORDER BY created_at DESC').all(org.id);
  const fleet_keys = database.prepare('SELECT id, label, key_value, is_active, created_at FROM fleet_keys WHERE org_id = ? ORDER BY created_at DESC').all(org.id);
  const users      = database.prepare('SELECT id, email, full_name, role, is_active, last_login, created_at FROM org_users WHERE org_id = ?').all(org.id);
  const devices    = database.prepare('SELECT * FROM nodes WHERE org_id = ? ORDER BY last_seen DESC').all(org.id)
    .map(n => ({ ...n, status: isOffline(n.last_seen) ? 'offline' : n.status }));

  res.json({ org, licenses, fleet_keys, users, devices });
});

// ── Update org ────────────────────────────────────────────────
router.put('/:orgId', requireAuth, requireOrgAccess, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  const { name, type, status, device_limit, contact_email, contact_name, notes } = req.body;
  const now = new Date().toISOString();
  db.get().prepare(`
    UPDATE organizations SET name=COALESCE(?,name), type=COALESCE(?,type), status=COALESCE(?,status),
    device_limit=COALESCE(?,device_limit), contact_email=COALESCE(?,contact_email),
    contact_name=COALESCE(?,contact_name), notes=COALESCE(?,notes), updated_at=? WHERE id=?
  `).run(name,type,status,device_limit,contact_email,contact_name,notes,now,req.params.orgId);
  res.json({ ok: true });
});

// ── Delete org (super admin only) ─────────────────────────────
router.delete('/:orgId', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  const database = db.get();
  database.prepare('DELETE FROM fleet_keys WHERE org_id = ?').run(req.params.orgId);
  database.prepare('DELETE FROM licenses WHERE org_id = ?').run(req.params.orgId);
  database.prepare('DELETE FROM org_users WHERE org_id = ?').run(req.params.orgId);
  database.prepare('UPDATE nodes SET org_id = NULL WHERE org_id = ?').run(req.params.orgId);
  database.prepare('DELETE FROM organizations WHERE id = ?').run(req.params.orgId);
  res.json({ ok: true });
});

// ── Fleet Keys ────────────────────────────────────────────────
router.get('/:orgId/fleet-keys', requireAuth, requireOrgAccess, (req, res) => {
  const keys = db.get().prepare(
    'SELECT id, label, key_value, is_active, created_at FROM fleet_keys WHERE org_id = ? ORDER BY created_at DESC'
  ).all(req.params.orgId);
  res.json({ fleet_keys: keys });
});

router.post('/:orgId/fleet-keys', requireAuth, requireOrgAccess, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  const { label } = req.body;
  const now = new Date().toISOString();
  const id  = uuidv4();
  const key = generateFleetKey();
  db.get().prepare(
    'INSERT INTO fleet_keys (id, org_id, key_value, label, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(id, req.params.orgId, key, label || 'Fleet Key', now);
  res.status(201).json({ id, key_value: key, label: label || 'Fleet Key' });
});

router.delete('/:orgId/fleet-keys/:keyId', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  db.get().prepare('DELETE FROM fleet_keys WHERE id = ? AND org_id = ?').run(req.params.keyId, req.params.orgId);
  res.json({ ok: true });
});

// ── Licenses ──────────────────────────────────────────────────
router.get('/:orgId/licenses', requireAuth, requireOrgAccess, (req, res) => {
  const licenses = db.get().prepare('SELECT * FROM licenses WHERE org_id = ? ORDER BY created_at DESC').all(req.params.orgId);
  res.json({ licenses });
});

router.post('/:orgId/licenses', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  const { tier, device_limit, expires_at, billing_ref } = req.body;
  const now = new Date().toISOString();
  const id  = uuidv4();
  db.get().prepare(`
    INSERT INTO licenses (id, org_id, tier, device_limit, expires_at, status, billing_ref, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(id, req.params.orgId, tier || 'starter', device_limit || 10, expires_at || null, billing_ref || null, now, now);
  res.status(201).json({ id, ok: true });
});

router.put('/:orgId/licenses/:licId', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  const { tier, device_limit, expires_at, status, billing_ref } = req.body;
  const now = new Date().toISOString();
  db.get().prepare(`
    UPDATE licenses SET tier=COALESCE(?,tier), device_limit=COALESCE(?,device_limit),
    expires_at=COALESCE(?,expires_at), status=COALESCE(?,status), billing_ref=COALESCE(?,billing_ref), updated_at=?
    WHERE id=? AND org_id=?
  `).run(tier,device_limit,expires_at,status,billing_ref,now,req.params.licId,req.params.orgId);
  res.json({ ok: true });
});

// ── Org Users ─────────────────────────────────────────────────
router.get('/:orgId/users', requireAuth, requireOrgAccess, (req, res) => {
  const users = db.get().prepare(
    'SELECT id, email, full_name, role, is_active, last_login, created_at FROM org_users WHERE org_id = ?'
  ).all(req.params.orgId);
  res.json({ users });
});

router.post('/:orgId/users', requireAuth, async (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  const { email, password, full_name, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const hash = await bcrypt.hash(password, 12);
  const now  = new Date().toISOString();
  const id   = uuidv4();
  try {
    db.get().prepare(`
      INSERT INTO org_users (id, org_id, email, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, req.params.orgId, email, hash, full_name || null, role || 'admin', now, now);
    res.status(201).json({ id, email, ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

router.delete('/:orgId/users/:userId', requireAuth, (req, res) => {
  if (!req.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
  db.get().prepare('DELETE FROM org_users WHERE id = ? AND org_id = ?').run(req.params.userId, req.params.orgId);
  res.json({ ok: true });
});

// ── Devices for org ───────────────────────────────────────────
router.get('/:orgId/devices', requireAuth, requireOrgAccess, (req, res) => {
  const devices = db.get().prepare(
    'SELECT * FROM nodes WHERE org_id = ? ORDER BY last_seen DESC'
  ).all(req.params.orgId).map(n => ({ ...n, status: isOffline(n.last_seen) ? 'offline' : n.status }));
  res.json({ devices, count: devices.length });
});

module.exports = router;

/**
 * WUV Admin — Auth middleware
 * Super admin: x-admin-token header
 * Org users: Bearer JWT
 */

'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

const ADMIN_TOKEN = process.env.WUV_ADMIN_TOKEN;
const JWT_SECRET  = process.env.JWT_SECRET;

if (!ADMIN_TOKEN) {
  console.error('[auth] FATAL: WUV_ADMIN_TOKEN not set');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('[auth] FATAL: JWT_SECRET not set');
  process.exit(1);
}

// Super admin only
function requireSuperAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized — token required' });
  const valid = crypto.timingSafeEqual(
    Buffer.from(token.padEnd(128)),
    Buffer.from(ADMIN_TOKEN.padEnd(128))
  );
  if (!valid) return res.status(403).json({ error: 'Forbidden' });
  req.isSuperAdmin = true;
  next();
}

// Org user JWT or super admin
function requireAuth(req, res, next) {
  const adminToken = req.headers['x-admin-token'] || req.query.token;
  if (adminToken) {
    try {
      const valid = crypto.timingSafeEqual(
        Buffer.from(adminToken.padEnd(128)),
        Buffer.from(ADMIN_TOKEN.padEnd(128))
      );
      if (valid) {
        req.isSuperAdmin = true;
        return next();
      }
    } catch (e) {}
  }

  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!bearerToken) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(bearerToken, JWT_SECRET);
    req.orgUser   = payload;
    req.orgId     = payload.org_id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Org admin: must belong to specific org (or be super admin)
function requireOrgAccess(req, res, next) {
  if (req.isSuperAdmin) return next();
  const paramOrgId = req.params.orgId || req.params.id;
  if (req.orgId && paramOrgId && req.orgId !== paramOrgId) {
    return res.status(403).json({ error: 'Access denied to this organization' });
  }
  next();
}

module.exports = { requireSuperAdmin, requireAuth, requireOrgAccess };

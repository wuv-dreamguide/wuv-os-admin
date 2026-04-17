/**
 * Admin API auth middleware
 * Validates x-admin-token header against WUV_ADMIN_TOKEN env var
 * Fails hard (500) if token not configured — no insecure fallback
 */

'use strict';

const crypto = require('crypto');

const ADMIN_TOKEN = process.env.WUV_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('[auth] FATAL: WUV_ADMIN_TOKEN env var is not set');
  process.exit(1);
}

module.exports = function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized — token required' });
  }

  // Constant-time comparison to prevent timing attacks
  const provided = Buffer.from(token);
  const expected = Buffer.from(ADMIN_TOKEN);

  if (provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

/**
 * POST /auth/login  — org user login
 * POST /auth/me     — get current user info
 */

'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_TTL    = '7d';

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const database = db.get();
  const user = database.prepare(`
    SELECT u.*, o.name as org_name, o.status as org_status
    FROM org_users u
    JOIN organizations o ON o.id = u.org_id
    WHERE u.email = ? AND u.is_active = 1
  `).get(email.toLowerCase().trim());

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.org_status === 'suspended') return res.status(403).json({ error: 'Organization suspended' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  // Update last login
  database.prepare('UPDATE org_users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);

  const token = jwt.sign(
    { user_id: user.id, org_id: user.org_id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      org_id: user.org_id,
      org_name: user.org_name,
    }
  });
});

router.get('/me', requireAuth, (req, res) => {
  if (req.isSuperAdmin) {
    return res.json({ role: 'superadmin', email: 'admin@wuv.cloud' });
  }
  const user = db.get().prepare(`
    SELECT u.id, u.email, u.full_name, u.role, u.org_id, o.name as org_name
    FROM org_users u JOIN organizations o ON o.id = u.org_id
    WHERE u.id = ?
  `).get(req.orgUser.user_id);
  res.json(user || { error: 'User not found' });
});

module.exports = router;

/**
 * WUV Admin API Server v2.0
 * Multi-tenant fleet management — organizations, licenses, devices
 */

'use strict';

const express = require('express');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');

const db              = require('./db');
const heartbeatRouter = require('./routes/heartbeat');
const nodesRouter     = require('./routes/nodes');
const otaRouter       = require('./routes/ota');
const orgsRouter      = require('./routes/orgs');
const authRouter      = require('./routes/auth');
const { requireSuperAdmin } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3200;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https://media.base44.com'],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'", 'data:'],
      frameSrc:   ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

const ALLOWED_ORIGINS = [
  'https://admin.wuv.cloud',
  'https://fleet.wuv.cloud',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-fleet-key, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(morgan('combined', { stream: { write: msg => process.stdout.write(msg) } }));

// Static — super admin dashboard
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
// Static — org fleet portal
app.use('/fleet', express.static(path.join(__dirname, 'public/fleet')));
// Root serves admin
app.use(express.static(path.join(__dirname, 'public/admin')));

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'wuv-admin', version: '2.0.0', ts: new Date().toISOString() }));

// Fleet heartbeat (fleet-key auth)
app.use('/api/heartbeat', heartbeatRouter);
app.use('/api/register',  heartbeatRouter);

// Auth (org users)
app.use('/auth', authRouter);

// Super admin — nodes & OTA
app.use('/api/nodes', requireSuperAdmin, nodesRouter);
app.use('/api/ota',   requireSuperAdmin, otaRouter);

// Orgs (super admin full, org admin own org)
app.use('/api/orgs', orgsRouter);

// SPA fallback
app.get('/fleet/*', (req, res) => res.sendFile(path.join(__dirname, 'public/fleet/index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

db.init();
app.listen(PORT, '127.0.0.1', () => console.log(`[wuv-admin] v2.0 on 127.0.0.1:${PORT}`));

module.exports = app;

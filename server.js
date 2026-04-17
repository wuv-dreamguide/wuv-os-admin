/**
 * WUV Admin API Server
 * Fleet heartbeats, node registry, OTA management
 * Hosted at admin.wuv.cloud on port 3200 (127.0.0.1 only — behind nginx)
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
const authMiddleware  = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3200;

// ── Security headers (CSP relaxed for dashboard) ─────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],  // inline scripts in dashboard
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https://media.base44.com'],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'", 'data:'],
      frameSrc:   ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS — locked to admin domain only ───────────────────────
const ALLOWED_ORIGINS = [
  'https://admin.wuv.cloud',
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-fleet-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '64kb' }));
app.use(morgan('combined', { stream: { write: msg => process.stdout.write(msg) } }));

// ── Static dashboard (served from /public) ───────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check (no auth) ────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'wuv-admin', ts: new Date().toISOString() });
});

// ── Fleet heartbeat (fleet-key auth) ─────────────────────────
app.use('/api/heartbeat', heartbeatRouter);

// ── Admin API (admin-token auth) ──────────────────────────────
app.use('/api/nodes', authMiddleware, nodesRouter);
app.use('/api/ota',   authMiddleware, otaRouter);

// ── SPA fallback — serve dashboard for any non-API route ─────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
db.init();
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[wuv-admin] Listening on 127.0.0.1:${PORT}`);
});

module.exports = app;

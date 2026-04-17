/**
 * GET  /api/ota/current   — current live version
 * GET  /api/ota/versions  — ISO files on disk
 * POST /api/ota/promote   — promote a version as current stable
 */

'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();

const VERSION_JSON = process.env.VERSION_JSON_PATH || '/var/www/html/iso/version.json';
const ISO_DIR      = process.env.ISO_DIR           || '/var/www/html/iso';

// Sanitise filename — only allow safe ISO names
function safeFilename(name) {
  return /^[a-zA-Z0-9._-]+\.iso$/.test(name);
}

// Current OTA version
router.get('/current', (req, res) => {
  try {
    const raw = fs.readFileSync(VERSION_JSON, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: 'Could not read version.json', detail: e.message });
  }
});

// List available ISOs on disk
router.get('/versions', (req, res) => {
  try {
    const files = fs.readdirSync(ISO_DIR)
      .filter(f => f.endsWith('.iso') && safeFilename(f))
      .map(f => {
        const stat = fs.statSync(path.join(ISO_DIR, f));
        return { filename: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ versions: files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Promote a version as current stable
router.post('/promote', (req, res) => {
  const { version, sha256, size, url } = req.body;

  if (!version) return res.status(400).json({ error: 'version required' });
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return res.status(400).json({ error: 'Invalid version format — use X.Y.Z' });
  }

  const versionData = {
    version,
    channel: 'stable',
    url: url || `https://update.wuv.cloud/iso/wuvos-${version}-x86_64.iso`,
    sha256: sha256 || '',
    size: typeof size === 'number' ? size : 0,
    build_date: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(VERSION_JSON, JSON.stringify(versionData, null, 2));
    res.json({ ok: true, promoted: versionData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

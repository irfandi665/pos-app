const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, recordAuditLog } = require('../auth');
const { requirePermission } = require('../services/rbac');

// GET /api/settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const settings = await db.allAsync('SELECT * FROM settings');
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    res.json({ settings: settingsMap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', authenticateToken, requirePermission('settings.manage'), async (req, res) => {
  try {
    const newSettings = req.body;
    for (const [key, value] of Object.entries(newSettings)) {
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, String(value)]
      );
    }

    await recordAuditLog(req.user.id, 'UPDATE_SETTINGS', 'settings', 'all', newSettings, req);
    res.json({ success: true, message: 'Pengaturan sistem berhasil disimpan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

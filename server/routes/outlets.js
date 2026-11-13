'use strict';

const express = require('express');
const router = express.Router();
const { db, withTransaction } = require('../db');
const { authenticateToken, recordAuditLog } = require('../auth');
const { requirePermission, can } = require('../services/rbac');
const { listAccessibleOutlets, resolveOutletContext, userCanAccessOutlet } = require('../services/outlets');

const OUTLET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

function validateTimezone(timezone) {
  if (!timezone) return true;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (err) {
    return false;
  }
}

function normalizePayload(body = {}) {
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    code: typeof body.code === 'string' ? body.code.trim().toUpperCase() : '',
    address: typeof body.address === 'string' ? body.address.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    timezone: typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : 'Asia/Jakarta',
    is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0)
  };
}

function validatePayload(payload) {
  const errors = [];
  if (!payload.name || payload.name.length < 2 || payload.name.length > 100) {
    errors.push('Nama outlet wajib diisi (2-100 karakter)');
  }
  if (!OUTLET_CODE_PATTERN.test(payload.code)) {
    errors.push('Kode outlet harus 3-20 karakter huruf besar, angka, atau tanda hubung');
  }
  if (payload.address.length > 255) {
    errors.push('Alamat maksimal 255 karakter');
  }
  if (payload.phone.length > 30) {
    errors.push('Nomor telepon maksimal 30 karakter');
  }
  if (!validateTimezone(payload.timezone)) {
    errors.push('Zona waktu tidak valid (contoh: Asia/Jakarta)');
  }
  return errors;
}

// GET /api/outlets - outlets visible to the signed-in user
router.get('/', authenticateToken, requirePermission('outlets.view'), async (req, res) => {
  try {
    const outlets = await listAccessibleOutlets(req.user);
    const canManage = can(req.user.role, 'outlets.manage');
    res.json({ outlets, can_manage: canManage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/outlets/active - currently selected outlet context
router.get('/active', authenticateToken, resolveOutletContext, async (req, res) => {
  res.json({
    active_outlet: req.outlet,
    accessible_outlets: req.accessibleOutlets
  });
});

// GET /api/outlets/:id
router.get('/:id', authenticateToken, requirePermission('outlets.view'), async (req, res) => {
  try {
    const outletId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(outletId) || outletId <= 0) {
      return res.status(400).json({ error: 'ID outlet tidak valid' });
    }

    if (!(await userCanAccessOutlet(req.user, outletId))) {
      return res.status(403).json({
        error: 'Akses ditolak: Anda tidak memiliki akses ke outlet tersebut',
        code: 'OUTLET_FORBIDDEN'
      });
    }

    const outlet = await db.getAsync(
      `SELECT o.*,
         (SELECT COUNT(*) FROM users u WHERE u.outlet_id = o.id) AS user_count,
         (SELECT COUNT(*) FROM products p WHERE p.outlet_id = o.id AND p.is_active = 1) AS product_count,
         (SELECT COUNT(*) FROM orders od WHERE od.outlet_id = o.id) AS order_count
       FROM outlets o WHERE o.id = ?`,
      [outletId]
    );

    if (!outlet) return res.status(404).json({ error: 'Outlet tidak ditemukan' });
    res.json({ outlet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/outlets - owner only
router.post('/', authenticateToken, requirePermission('outlets.manage'), async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const errors = validatePayload(payload);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; '), details: errors });
    }

    const existing = await db.getAsync('SELECT id FROM outlets WHERE code = ?', [payload.code]);
    if (existing) {
      return res.status(409).json({ error: 'Kode outlet sudah digunakan' });
    }

    const result = await db.runAsync(
      `INSERT INTO outlets (name, code, address, phone, timezone, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payload.name, payload.code, payload.address || null, payload.phone || null, payload.timezone, payload.is_active]
    );

    await recordAuditLog(
      req.user.id,
      'CREATE_OUTLET',
      'outlets',
      result.lastID,
      { name: payload.name, code: payload.code },
      req
    );

    const outlet = await db.getAsync('SELECT * FROM outlets WHERE id = ?', [result.lastID]);
    res.status(201).json({ outlet, message: 'Outlet berhasil ditambahkan' });
  } catch (err) {
    if (/UNIQUE constraint failed: outlets\.code/i.test(err.message)) {
      return res.status(409).json({ error: 'Kode outlet sudah digunakan' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/outlets/:id - owner only
router.put('/:id', authenticateToken, requirePermission('outlets.manage'), async (req, res) => {
  try {
    const outletId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(outletId) || outletId <= 0) {
      return res.status(400).json({ error: 'ID outlet tidak valid' });
    }

    const current = await db.getAsync('SELECT * FROM outlets WHERE id = ?', [outletId]);
    if (!current) return res.status(404).json({ error: 'Outlet tidak ditemukan' });

    const payload = normalizePayload({ ...current, ...req.body });
    const errors = validatePayload(payload);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; '), details: errors });
    }

    const duplicate = await db.getAsync(
      'SELECT id FROM outlets WHERE code = ? AND id != ?',
      [payload.code, outletId]
    );
    if (duplicate) {
      return res.status(409).json({ error: 'Kode outlet sudah digunakan' });
    }

    if (!payload.is_active && current.is_active) {
      const activeCount = await db.getAsync('SELECT COUNT(*) AS total FROM outlets WHERE is_active = 1');
      if (activeCount.total <= 1) {
        return res.status(409).json({ error: 'Minimal satu outlet harus tetap aktif' });
      }
    }

    await db.runAsync(
      `UPDATE outlets
       SET name = ?, code = ?, address = ?, phone = ?, timezone = ?, is_active = ?
       WHERE id = ?`,
      [payload.name, payload.code, payload.address || null, payload.phone || null, payload.timezone, payload.is_active, outletId]
    );

    await recordAuditLog(
      req.user.id,
      'UPDATE_OUTLET',
      'outlets',
      outletId,
      {
        before: { name: current.name, code: current.code, is_active: current.is_active },
        after: { name: payload.name, code: payload.code, is_active: payload.is_active }
      },
      req
    );

    const outlet = await db.getAsync('SELECT * FROM outlets WHERE id = ?', [outletId]);
    res.json({ outlet, message: 'Outlet berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/outlets/:id - owner only, only when the outlet is empty
router.delete('/:id', authenticateToken, requirePermission('outlets.manage'), async (req, res) => {
  try {
    const outletId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(outletId) || outletId <= 0) {
      return res.status(400).json({ error: 'ID outlet tidak valid' });
    }

    if (outletId === req.user.outlet_id) {
      return res.status(409).json({ error: 'Tidak dapat menghapus outlet utama akun Anda' });
    }

    const outlet = await db.getAsync('SELECT * FROM outlets WHERE id = ?', [outletId]);
    if (!outlet) return res.status(404).json({ error: 'Outlet tidak ditemukan' });

    const usage = await db.getAsync(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE outlet_id = ?) AS users,
         (SELECT COUNT(*) FROM products WHERE outlet_id = ?) AS products,
         (SELECT COUNT(*) FROM orders WHERE outlet_id = ?) AS orders,
         (SELECT COUNT(*) FROM shifts WHERE outlet_id = ?) AS shifts,
         (SELECT COUNT(*) FROM qris_ledger WHERE outlet_id = ?) AS qris_ledger`,
      [outletId, outletId, outletId, outletId, outletId]
    );

    const inUse = Object.values(usage).some((count) => count > 0);
    if (inUse) {
      return res.status(409).json({
        error: 'Outlet masih memiliki data terkait. Nonaktifkan outlet alih-alih menghapusnya.',
        code: 'OUTLET_IN_USE',
        usage
      });
    }

    await withTransaction(async () => {
      await db.runAsync('DELETE FROM user_outlets WHERE outlet_id = ?', [outletId]);
      await db.runAsync('DELETE FROM outlets WHERE id = ?', [outletId]);
    });

    await recordAuditLog(req.user.id, 'DELETE_OUTLET', 'outlets', outletId, { name: outlet.name }, req);
    res.json({ message: 'Outlet berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

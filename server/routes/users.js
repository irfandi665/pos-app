'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, withTransaction } = require('../db');
const { authenticateToken, recordAuditLog } = require('../auth');
const { requirePermission, can, isValidRole, ROLES } = require('../services/rbac');
const {
  listAccessibleOutlets,
  replaceUserOutlets,
  normalizeOutletIds
} = require('../services/outlets');

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const PIN_PATTERN = /^\d{6}$/;

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password harus 8-128 karakter';
  }
  return null;
}

function validatePin(pin) {
  if (!PIN_PATTERN.test(String(pin || ''))) {
    return 'PIN harus tepat 6 digit angka';
  }
  return null;
}

function publicUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    outlet_id: row.outlet_id,
    outlet_name: row.outlet_name || null,
    is_locked: Boolean(row.is_locked),
    failed_pin_attempts: row.failed_pin_attempts || 0,
    has_pin: Boolean(row.has_pin),
    order_count: row.order_count || 0,
    created_at: row.created_at,
    outlets: []
  };
}

async function loadUserOutlets(userIds) {
  if (!userIds.length) return new Map();

  const placeholders = userIds.map(() => '?').join(', ');
  const rows = await db.allAsync(
    `SELECT uo.user_id, uo.outlet_id, uo.is_primary, o.name, o.code, o.is_active
     FROM user_outlets uo
     JOIN outlets o ON o.id = uo.outlet_id
     WHERE uo.user_id IN (${placeholders})
     ORDER BY uo.is_primary DESC, o.name ASC`,
    userIds
  );

  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.user_id)) grouped.set(row.user_id, []);
    grouped.get(row.user_id).push({
      id: row.outlet_id,
      name: row.name,
      code: row.code,
      is_active: Boolean(row.is_active),
      is_primary: Boolean(row.is_primary)
    });
  });
  return grouped;
}

async function countOwners({ excludeUserId = null, unlockedOnly = false } = {}) {
  let query = `SELECT COUNT(*) AS total FROM users WHERE role = 'owner'`;
  const params = [];

  if (excludeUserId) {
    query += ' AND id != ?';
    params.push(excludeUserId);
  }
  if (unlockedOnly) {
    query += ' AND is_locked = 0';
  }

  const row = await db.getAsync(query, params);
  return row ? row.total : 0;
}

async function ensureOutletIdsValid(rawIds) {
  const { ids, error } = normalizeOutletIds(rawIds);
  if (error) {
    const err = new Error(error);
    err.statusCode = 400;
    throw err;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.allAsync(
    `SELECT id, is_active FROM outlets WHERE id IN (${placeholders})`,
    ids
  );

  if (rows.length !== ids.length) {
    const err = new Error('Salah satu outlet tidak ditemukan');
    err.statusCode = 400;
    throw err;
  }
  if (rows.some((row) => !row.is_active)) {
    const err = new Error('Outlet nonaktif tidak dapat diotorisasi ke staf');
    err.statusCode = 400;
    throw err;
  }

  return ids;
}

// GET /api/users - staff directory
router.get('/', authenticateToken, requirePermission('users.view'), async (req, res) => {
  try {
    const isOwnerRole = can(req.user.role, 'users.manage');
    let query = `
      SELECT u.id, u.username, u.full_name, u.role, u.outlet_id, u.is_locked,
             u.failed_pin_attempts, u.created_at,
             o.name AS outlet_name,
             CASE WHEN u.pin_hash IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
             (SELECT COUNT(*) FROM orders od WHERE od.cashier_id = u.id) AS order_count
      FROM users u
      LEFT JOIN outlets o ON o.id = u.outlet_id
    `;
    const params = [];

    if (!isOwnerRole) {
      const outlets = await listAccessibleOutlets(req.user, { activeOnly: true });
      const outletIds = outlets.map((outlet) => outlet.id);
      if (!outletIds.length) {
        return res.json({ users: [], can_manage: false });
      }
      const placeholders = outletIds.map(() => '?').join(', ');
      query += `
        WHERE u.role != 'owner'
          AND (
            u.id IN (SELECT user_id FROM user_outlets WHERE outlet_id IN (${placeholders}))
            OR u.outlet_id IN (${placeholders})
          )
      `;
      params.push(...outletIds, ...outletIds);
    }

    query += ` ORDER BY CASE u.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, u.full_name ASC`;

    const rows = await db.allAsync(query, params);
    const outletMap = await loadUserOutlets(rows.map((row) => row.id));
    const users = rows.map((row) => {
      const user = publicUserRow(row);
      user.outlets = outletMap.get(row.id) || [];
      return user;
    });

    res.json({ users, can_manage: isOwnerRole });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users - provision a staff account (owner only)
router.post('/', authenticateToken, requirePermission('users.manage'), async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const fullName = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : '';
    const role = req.body.role;
    const password = req.body.password;
    const pin = req.body.pin;
    const primaryOutletId = req.body.primary_outlet_id ?? req.body.outlet_id;

    const errors = [];
    if (!USERNAME_PATTERN.test(username)) {
      errors.push('Username harus 3-32 karakter (huruf kecil, angka, titik, garis bawah, atau strip)');
    }
    if (!fullName || fullName.length < 2 || fullName.length > 100) {
      errors.push('Nama lengkap wajib diisi (2-100 karakter)');
    }
    if (!isValidRole(role)) {
      errors.push('Peran tidak valid');
    }
    const passwordError = validatePassword(password);
    if (passwordError) errors.push(passwordError);
    if ([ROLES.MANAGER, ROLES.OWNER].includes(role)) {
      const pinError = validatePin(pin);
      if (pinError) errors.push(`PIN Manajer wajib diisi: ${pinError}`);
    } else if (pin && validatePin(pin)) {
      errors.push(validatePin(pin));
    }

    let outletIds = [];
    try {
      outletIds = await ensureOutletIdsValid(req.body.outlet_ids);
    } catch (err) {
      errors.push(err.message);
    }

    const parsedPrimary = Number.parseInt(primaryOutletId ?? outletIds[0], 10);
    if (!outletIds.includes(parsedPrimary)) {
      errors.push('Outlet utama harus termasuk dalam daftar outlet yang diotorisasi');
    }

    if (errors.length) {
      return res.status(400).json({ error: errors.join('; '), details: errors });
    }

    const duplicate = await db.getAsync('SELECT id FROM users WHERE username = ?', [username]);
    if (duplicate) {
      return res.status(409).json({ error: 'Username sudah digunakan' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const pinHash = pin ? bcrypt.hashSync(String(pin), salt) : null;

    const userId = await withTransaction(async () => {
      const result = await db.runAsync(
        `INSERT INTO users (outlet_id, username, password_hash, full_name, role, pin_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [parsedPrimary, username, passwordHash, fullName, role, pinHash]
      );

      const newId = result.lastID;
      for (const outletId of outletIds) {
        await db.runAsync(
          `INSERT INTO user_outlets (user_id, outlet_id, is_primary) VALUES (?, ?, ?)`,
          [newId, outletId, outletId === parsedPrimary ? 1 : 0]
        );
      }
      return newId;
    });

    await recordAuditLog(
      req.user.id,
      'CREATE_USER',
      'users',
      userId,
      { username, full_name: fullName, role, outlet_ids: outletIds, primary_outlet_id: parsedPrimary, has_pin: Boolean(pin) },
      req
    );

    const row = await db.getAsync(
      `SELECT u.id, u.username, u.full_name, u.role, u.outlet_id, u.is_locked,
              u.failed_pin_attempts, u.created_at, o.name AS outlet_name,
              CASE WHEN u.pin_hash IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
              0 AS order_count
       FROM users u LEFT JOIN outlets o ON o.id = u.outlet_id
       WHERE u.id = ?`,
      [userId]
    );

    const user = publicUserRow(row);
    user.outlets = (await loadUserOutlets([userId])).get(userId) || [];
    res.status(201).json({ user, message: 'Akun staf berhasil dibuat' });
  } catch (err) {
    if (/UNIQUE constraint failed: users\.username/i.test(err.message)) {
      return res.status(409).json({ error: 'Username sudah digunakan' });
    }
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// PUT /api/users/:id - update staff account (owner only)
router.put('/:id', authenticateToken, requirePermission('users.manage'), async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'ID pengguna tidak valid' });
    }

    const existing = await db.getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!existing) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });

    const updates = {};
    const errors = [];

    if (req.body.full_name !== undefined) {
      const fullName = String(req.body.full_name || '').trim();
      if (fullName.length < 2 || fullName.length > 100) {
        errors.push('Nama lengkap wajib diisi (2-100 karakter)');
      } else {
        updates.full_name = fullName;
      }
    }

    if (req.body.role !== undefined && req.body.role !== existing.role) {
      if (!isValidRole(req.body.role)) {
        errors.push('Peran tidak valid');
      } else {
        updates.role = req.body.role;
      }
    }

    if (req.body.password !== undefined && req.body.password !== '') {
      const passwordError = validatePassword(req.body.password);
      if (passwordError) errors.push(passwordError);
      else updates.password_hash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
    }

    if (req.body.clear_pin === true) {
      updates.pin_hash = null;
    } else if (req.body.pin !== undefined && req.body.pin !== '') {
      const pinError = validatePin(req.body.pin);
      if (pinError) errors.push(pinError);
      else updates.pin_hash = bcrypt.hashSync(String(req.body.pin), bcrypt.genSaltSync(10));
    }

    const targetRole = updates.role || existing.role;
    if ([ROLES.MANAGER, ROLES.OWNER].includes(targetRole)) {
      const willHavePin = updates.pin_hash === null ? false : Boolean(updates.pin_hash || existing.pin_hash);
      if (!willHavePin) errors.push('PIN Manajer wajib dimiliki oleh peran manager atau owner');
    }

    if (req.body.is_locked !== undefined) {
      const locked = Boolean(req.body.is_locked);
      if (locked && userId === req.user.id) {
        errors.push('Anda tidak dapat mengunci akun sendiri');
      }
      updates.is_locked = locked ? 1 : 0;
      if (!locked) updates.failed_pin_attempts = 0;
    }

    if (existing.role === ROLES.OWNER && targetRole !== ROLES.OWNER) {
      const otherOwners = await countOwners({ excludeUserId: userId, unlockedOnly: true });
      if (otherOwners === 0) {
        errors.push('Tidak dapat mengubah peran owner terakhir');
      }
    }

    if (existing.role === ROLES.OWNER && updates.is_locked === 1) {
      const otherOwners = await countOwners({ excludeUserId: userId, unlockedOnly: true });
      if (otherOwners === 0) {
        errors.push('Tidak dapat mengunci owner aktif terakhir');
      }
    }

    let outletIds = null;
    let primaryOutletId = null;
    if (req.body.outlet_ids !== undefined) {
      try {
        outletIds = await ensureOutletIdsValid(req.body.outlet_ids);
        primaryOutletId = Number.parseInt(
          req.body.primary_outlet_id ?? outletIds[0],
          10
        );
        if (!outletIds.includes(primaryOutletId)) {
          errors.push('Outlet utama harus termasuk dalam daftar outlet yang diotorisasi');
        }
      } catch (err) {
        errors.push(err.message);
      }
    } else if (req.body.primary_outlet_id !== undefined) {
      primaryOutletId = Number.parseInt(req.body.primary_outlet_id, 10);
      if (!Number.isInteger(primaryOutletId) || primaryOutletId <= 0) {
        errors.push('Outlet utama tidak valid');
      } else if (!(await db.getAsync('SELECT id FROM outlets WHERE id = ? AND is_active = 1', [primaryOutletId]))) {
        errors.push('Outlet utama tidak ditemukan atau nonaktif');
      }
    }

    if (errors.length) {
      return res.status(400).json({ error: errors.join('; '), details: errors });
    }

    await withTransaction(async () => {
      const fields = Object.keys(updates);
      if (fields.length) {
        const assignments = fields.map((field) => `${field} = ?`).join(', ');
        await db.runAsync(
          `UPDATE users SET ${assignments} WHERE id = ?`,
          [...fields.map((field) => updates[field]), userId]
        );
      }

      if (outletIds) {
        await replaceUserOutlets(userId, outletIds, primaryOutletId);
      } else if (primaryOutletId) {
        const grant = await db.getAsync(
          'SELECT outlet_id FROM user_outlets WHERE user_id = ? AND outlet_id = ?',
          [userId, primaryOutletId]
        );
        if (!grant) {
          const err = new Error('Outlet utama harus termasuk dalam daftar outlet yang diotorisasi');
          err.statusCode = 400;
          throw err;
        }
        await db.runAsync('UPDATE user_outlets SET is_primary = 0 WHERE user_id = ?', [userId]);
        await db.runAsync(
          'UPDATE user_outlets SET is_primary = 1 WHERE user_id = ? AND outlet_id = ?',
          [userId, primaryOutletId]
        );
        await db.runAsync('UPDATE users SET outlet_id = ? WHERE id = ?', [primaryOutletId, userId]);
      }
    });

    await recordAuditLog(
      req.user.id,
      'UPDATE_USER',
      'users',
      userId,
      {
        username: existing.username,
        changed_fields: Object.keys(updates),
        role: updates.role || existing.role,
        outlet_ids: outletIds,
        primary_outlet_id: primaryOutletId
      },
      req
    );

    const row = await db.getAsync(
      `SELECT u.id, u.username, u.full_name, u.role, u.outlet_id, u.is_locked,
              u.failed_pin_attempts, u.created_at, o.name AS outlet_name,
              CASE WHEN u.pin_hash IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
              (SELECT COUNT(*) FROM orders od WHERE od.cashier_id = u.id) AS order_count
       FROM users u LEFT JOIN outlets o ON o.id = u.outlet_id
       WHERE u.id = ?`,
      [userId]
    );

    const user = publicUserRow(row);
    user.outlets = (await loadUserOutlets([userId])).get(userId) || [];
    res.json({ user, message: 'Akun staf berhasil diperbarui' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// DELETE /api/users/:id - owner only, only for accounts without transaction history
router.delete('/:id', authenticateToken, requirePermission('users.manage'), async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'ID pengguna tidak valid' });
    }

    if (userId === req.user.id) {
      return res.status(409).json({ error: 'Anda tidak dapat menghapus akun sendiri' });
    }

    const existing = await db.getAsync('SELECT * FROM users WHERE id = ?', [userId]);
    if (!existing) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });

    if (existing.role === ROLES.OWNER) {
      const otherOwners = await countOwners({ excludeUserId: userId });
      if (otherOwners === 0) {
        return res.status(409).json({ error: 'Tidak dapat menghapus owner terakhir' });
      }
    }

    const references = await db.getAsync(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE cashier_id = ? OR void_by = ?) AS orders,
         (SELECT COUNT(*) FROM shifts WHERE user_id = ? OR manager_approved_by = ?) AS shifts,
         (SELECT COUNT(*) FROM order_returns WHERE created_by = ? OR approved_by = ?) AS returns`,
      [userId, userId, userId, userId, userId, userId]
    );

    if (Object.values(references).some((count) => count > 0)) {
      return res.status(409).json({
        error: 'Akun memiliki riwayat transaksi atau shift. Kunci akun alih-alih menghapusnya.',
        code: 'USER_HAS_HISTORY',
        references
      });
    }

    await withTransaction(async () => {
      await db.runAsync('DELETE FROM user_outlets WHERE user_id = ?', [userId]);
      await db.runAsync('DELETE FROM users WHERE id = ?', [userId]);
    });

    await recordAuditLog(
      req.user.id,
      'DELETE_USER',
      'users',
      userId,
      { username: existing.username, role: existing.role },
      req
    );

    res.json({ message: 'Akun staf berhasil dihapus' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;

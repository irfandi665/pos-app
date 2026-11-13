const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { generateToken, authenticateToken, verifyManagerPin, recordAuditLog } = require('../auth');
const { permissionsFor } = require('../services/rbac');
const { listAccessibleOutlets } = require('../services/outlets');

/**
 * Builds the session payload consumed by the SPA. Permissions are resolved on
 * the server so the client never has to guess what the active JWT may do.
 */
async function buildSessionUser(user) {
  const outlets = await listAccessibleOutlets(user);
  const primaryOutletId = user.outlet_id || outlets[0]?.id || null;
  const activeOutlet = outlets.find((outlet) => outlet.id === primaryOutletId)
    || outlets.find((outlet) => outlet.is_active)
    || outlets[0]
    || null;

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    outlet_id: activeOutlet ? activeOutlet.id : null,
    outlet_name: activeOutlet ? activeOutlet.name : (user.outlet_name || null),
    active_outlet_id: activeOutlet ? activeOutlet.id : null,
    active_outlet_name: activeOutlet ? activeOutlet.name : null,
    permissions: permissionsFor(user.role),
    outlets: outlets.map((outlet) => ({
      id: outlet.id,
      name: outlet.name,
      code: outlet.code,
      address: outlet.address,
      is_active: Boolean(outlet.is_active),
      is_primary: outlet.id === user.outlet_id
    }))
  };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi' });
    }

    const user = await db.getAsync(
      `SELECT u.*, o.name as outlet_name 
       FROM users u 
       LEFT JOIN outlets o ON u.outlet_id = o.id 
       WHERE u.username = ?`,
      [String(username).trim().toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    if (user.is_locked) {
      return res.status(403).json({
        error: 'Akun Anda terkunci. Hubungi Owner untuk membuka akses.',
        code: 'USER_LOCKED'
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const token = generateToken(user);
    const sessionUser = await buildSessionUser(user);
    await recordAuditLog(user.id, 'LOGIN', 'users', user.id, `User ${user.username} login sukses`, req);

    res.json({ token, user: sessionUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getAsync(
      `SELECT u.*, o.name as outlet_name 
       FROM users u 
       LEFT JOIN outlets o ON u.outlet_id = o.id 
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan', code: 'AUTH_TOKEN_INVALID' });
    }

    const sessionUser = await buildSessionUser(user);
    res.json({ user: sessionUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-pin (Used for Manager PIN verification)
router.post('/verify-pin', authenticateToken, verifyManagerPin, (req, res) => {
  res.json({ 
    success: true, 
    message: 'PIN Manajer berhasil diverifikasi', 
    manager: { id: req.manager.id, full_name: req.manager.full_name } 
  });
});

module.exports = router;

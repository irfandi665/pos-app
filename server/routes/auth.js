const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { generateToken, authenticateToken, verifyManagerPin, recordAuditLog } = require('../auth');

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
      [username.trim()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const token = generateToken(user);
    await recordAuditLog(user.id, 'LOGIN', 'users', user.id, `User ${user.username} login sukses`, req);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        outlet_id: user.outlet_id,
        outlet_name: user.outlet_name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server saat login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getAsync(
      `SELECT u.id, u.username, u.full_name, u.role, u.outlet_id, o.name as outlet_name 
       FROM users u 
       LEFT JOIN outlets o ON u.outlet_id = o.id 
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }
    res.json({ user });
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

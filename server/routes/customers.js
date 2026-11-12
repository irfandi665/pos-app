const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken } = require('../auth');

// GET /api/customers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY name ASC';
    const customers = await db.allAsync(query, params);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, phone, email, birthdate, membership_tier = 'standard' } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nama dan nomor HP pelanggan wajib diisi' });
    }

    const result = await db.runAsync(
      `INSERT INTO customers (name, phone, email, birthdate, points, membership_tier, consent_pdp) 
       VALUES (?, ?, ?, ?, 0, ?, 1)`,
      [name, phone, email || null, birthdate || null, membership_tier]
    );

    res.json({
      success: true,
      customer_id: result.lastID,
      message: 'Pelanggan berhasil didaftarkan (Persetujuan UU PDP tercatat)'
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Nomor HP pelanggan sudah terdaftar' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole } = require('../auth');

// GET /api/audit (Immutable Audit Logs)
router.get('/', authenticateToken, requireRole(['owner', 'manager']), async (req, res) => {
  try {
    const { action, limit = 50 } = req.query;
    let query = `
      SELECT al.*, u.full_name as user_name, u.role as user_role 
      FROM audit_logs al 
      LEFT JOIN users u ON al.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      query += ' AND al.action = ?';
      params.push(action);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const logs = await db.allAsync(query, params);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

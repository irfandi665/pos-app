const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, verifyManagerPin, recordAuditLog } = require('../auth');
const { resolveOutletContext } = require('../services/outlets');

// GET /api/shifts/current (Active cashier shift details & live cash calculations)
router.get('/current', authenticateToken, resolveOutletContext, async (req, res) => {
  try {
    const shift = await db.getAsync(
      `SELECT s.*, u.full_name as cashier_name, out.name as outlet_name 
       FROM shifts s 
       JOIN users u ON s.user_id = u.id 
       JOIN outlets out ON s.outlet_id = out.id 
       WHERE s.user_id = ? AND s.outlet_id = ? AND s.status = 'open' 
       ORDER BY s.id DESC LIMIT 1`,
      [req.user.id, req.outletId]
    );

    if (!shift) {
      return res.json({ active_shift: null });
    }

    // Calculate total cash payments for this shift
    const cashSalesRow = await db.getAsync(
      `SELECT COALESCE(SUM(op.amount), 0) as cash_total 
       FROM order_payments op 
       JOIN orders o ON op.order_id = o.id 
       WHERE o.shift_id = ? AND o.status = 'paid' AND op.payment_method = 'cash'`,
      [shift.id]
    );

    // QRIS payments
    const qrisSalesRow = await db.getAsync(
      `SELECT COALESCE(SUM(op.amount), 0) as qris_total 
       FROM order_payments op 
       JOIN orders o ON op.order_id = o.id 
       WHERE o.shift_id = ? AND o.status = 'paid' AND op.payment_method = 'qris'`,
      [shift.id]
    );

    // Card payments
    const cardSalesRow = await db.getAsync(
      `SELECT COALESCE(SUM(op.amount), 0) as card_total 
       FROM order_payments op 
       JOIN orders o ON op.order_id = o.id 
       WHERE o.shift_id = ? AND o.status = 'paid' AND op.payment_method = 'card'`,
      [shift.id]
    );

    // Cash in / cash out totals
    const cashLogs = await db.allAsync(
      'SELECT * FROM shift_cash_logs WHERE shift_id = ? ORDER BY created_at DESC',
      [shift.id]
    );

    let cashInTotal = 0;
    let cashOutTotal = 0;
    cashLogs.forEach(l => {
      if (l.type === 'cash_in') cashInTotal += l.amount;
      if (l.type === 'cash_out') cashOutTotal += l.amount;
    });

    const cashSales = cashSalesRow ? cashSalesRow.cash_total : 0;
    const qrisSales = qrisSalesRow ? qrisSalesRow.qris_total : 0;
    const cardSales = cardSalesRow ? cardSalesRow.card_total : 0;
    const expectedCash = shift.starting_cash + cashSales + cashInTotal - cashOutTotal;

    res.json({
      active_shift: {
        ...shift,
        cash_sales: cashSales,
        qris_sales: qrisSales,
        card_sales: cardSales,
        total_sales: cashSales + qrisSales + cardSales,
        cash_in: cashInTotal,
        cash_out: cashOutTotal,
        expected_cash: expectedCash,
        cash_logs: cashLogs
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shifts/open (Open cashier shift with cash float)
router.post('/open', authenticateToken, resolveOutletContext, async (req, res) => {
  try {
    const { starting_cash = 0 } = req.body;

    // Check if user already has open shift
    const existing = await db.getAsync(
      'SELECT id FROM shifts WHERE user_id = ? AND status = "open"',
      [req.user.id]
    );

    if (existing) {
      return res.status(400).json({ error: 'Anda sudah memiliki shift yang masih aktif terbuka' });
    }

    const startCash = parseInt(starting_cash || 0, 10);

    const result = await db.runAsync(
      `INSERT INTO shifts (outlet_id, user_id, starting_cash, expected_cash, status) 
       VALUES (?, ?, ?, ?, 'open')`,
      [req.outletId, req.user.id, startCash, startCash]
    );

    await recordAuditLog(
      req.user.id,
      'OPEN_SHIFT',
      'shifts',
      result.lastID,
      { starting_cash: startCash },
      req
    );

    res.json({
      success: true,
      shift_id: result.lastID,
      message: `Shift kasir berhasil dibuka dengan modal awal Rp ${startCash.toLocaleString('id-ID')}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shifts/cash-movement (Petty cash in / out)
router.post('/cash-movement', authenticateToken, async (req, res) => {
  try {
    const { type, amount, reason } = req.body; // type: 'cash_in' | 'cash_out'

    if (!['cash_in', 'cash_out'].includes(type)) {
      return res.status(400).json({ error: 'Tipe kas harus cash_in atau cash_out' });
    }

    const amt = parseInt(amount || 0, 10);
    if (amt <= 0) {
      return res.status(400).json({ error: 'Nominal kas harus lebih dari 0' });
    }

    const shift = await db.getAsync(
      'SELECT id FROM shifts WHERE user_id = ? AND status = "open"',
      [req.user.id]
    );

    if (!shift) {
      return res.status(400).json({ error: 'Tidak ada shift aktif' });
    }

    await db.runAsync(
      `INSERT INTO shift_cash_logs (shift_id, type, amount, reason) VALUES (?, ?, ?, ?)`,
      [shift.id, type, amt, reason || (type === 'cash_in' ? 'Kas Masuk' : 'Kas Keluar / Biaya')]
    );

    await recordAuditLog(
      req.user.id,
      type === 'cash_in' ? 'CASH_IN' : 'CASH_OUT',
      'shifts',
      shift.id,
      { amount: amt, reason },
      req
    );

    res.json({ success: true, message: `Catatan kas ${type === 'cash_in' ? 'masuk' : 'keluar'} berhasil disimpan` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shifts/close (Close shift with cash count & difference handling)
router.post('/close', authenticateToken, async (req, res) => {
  try {
    const { actual_cash, notes, manager_pin } = req.body;

    const shift = await db.getAsync(
      'SELECT * FROM shifts WHERE user_id = ? AND status = "open"',
      [req.user.id]
    );

    if (!shift) {
      return res.status(400).json({ error: 'Tidak ada shift aktif untuk ditutup' });
    }

    const actual = parseInt(actual_cash ?? 0, 10);

    // Calculate sales and cash logs
    const cashSalesRow = await db.getAsync(
      `SELECT COALESCE(SUM(op.amount), 0) as cash_total 
       FROM order_payments op 
       JOIN orders o ON op.order_id = o.id 
       WHERE o.shift_id = ? AND o.status = 'paid' AND op.payment_method = 'cash'`,
      [shift.id]
    );
    const cashSales = cashSalesRow ? cashSalesRow.cash_total : 0;

    const cashLogs = await db.allAsync('SELECT type, amount FROM shift_cash_logs WHERE shift_id = ?', [shift.id]);
    let cashIn = 0;
    let cashOut = 0;
    cashLogs.forEach(l => {
      if (l.type === 'cash_in') cashIn += l.amount;
      if (l.type === 'cash_out') cashOut += l.amount;
    });

    const expectedCash = shift.starting_cash + cashSales + cashIn - cashOut;
    const difference = actual - expectedCash;

    let managerApprovedBy = null;

    // If difference exceeds Rp 10.000, require manager PIN approval
    if (Math.abs(difference) > 10000) {
      if (!manager_pin) {
        return res.status(400).json({
          error: `Terdapat selisih kas sebesar Rp ${difference.toLocaleString('id-ID')} (Ambang batas selisih > Rp 10.000 membutuhkan otorisasi PIN Manajer untuk tutup shift)`,
          requires_manager_pin: true
        });
      }

      // Verify manager PIN
      const bcrypt = require('bcryptjs');
      const managers = await db.allAsync('SELECT id, full_name, pin_hash FROM users WHERE role IN ("manager", "owner")');
      const approvedManager = managers.find(m => m.pin_hash && bcrypt.compareSync(String(manager_pin), m.pin_hash));
      if (!approvedManager) {
        return res.status(401).json({ error: 'PIN Manajer salah. Otorisasi selisih kas gagal.' });
      }
      managerApprovedBy = approvedManager.id;
    }

    await db.runAsync(
      `UPDATE shifts 
       SET status = 'closed', end_time = CURRENT_TIMESTAMP, 
           cash_in = ?, cash_out = ?, expected_cash = ?, actual_cash = ?, 
           cash_difference = ?, manager_approved_by = ?, notes = ? 
       WHERE id = ?`,
      [cashIn, cashOut, expectedCash, actual, difference, managerApprovedBy, notes || null, shift.id]
    );

    await recordAuditLog(
      req.user.id,
      'CLOSE_SHIFT',
      'shifts',
      shift.id,
      { expectedCash, actual, difference, managerApprovedBy },
      req
    );

    res.json({
      success: true,
      message: 'Shift kasir berhasil ditutup.',
      summary: {
        shift_id: shift.id,
        starting_cash: shift.starting_cash,
        cash_sales: cashSales,
        cash_in: cashIn,
        cash_out: cashOut,
        expected_cash: expectedCash,
        actual_cash: actual,
        cash_difference: difference
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shifts/history
router.get('/history', authenticateToken, resolveOutletContext, async (req, res) => {
  try {
    const shifts = await db.allAsync(
      `SELECT s.*, u.full_name as cashier_name, m.full_name as manager_name 
       FROM shifts s 
       JOIN users u ON s.user_id = u.id 
       LEFT JOIN users m ON s.manager_approved_by = m.id 
       WHERE s.outlet_id = ?
       ORDER BY s.id DESC LIMIT 30`,
      [req.outletId]
    );
    res.json({ shifts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

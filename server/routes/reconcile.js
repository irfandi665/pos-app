const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db');
const { authenticateToken, verifyManagerPin, recordAuditLog } = require('../auth');
const { requirePermission } = require('../services/rbac');
const { resolveOutletContext } = require('../services/outlets');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/reconcile/ledger (QRIS Ledger list with filters)
router.get('/ledger', authenticateToken, resolveOutletContext, async (req, res) => {
  try {
    const { start_date, end_date, status, search, limit = 100 } = req.query;

    let query = `
      SELECT ql.*, o.total_amount, o.status as order_status, 
             u.full_name as cashier_name, out.name as outlet_name 
      FROM qris_ledger ql 
      LEFT JOIN orders o ON ql.order_id = o.id 
      LEFT JOIN users u ON ql.cashier_id = u.id 
      LEFT JOIN outlets out ON ql.outlet_id = out.id 
      WHERE ql.outlet_id = ?
    `;
    const params = [req.outletId];

    if (start_date) {
      query += ` AND date(ql.created_at) >= date(?)`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND date(ql.created_at) <= date(?)`;
      params.push(end_date);
    }
    if (status && status !== 'ALL') {
      query += ` AND ql.status = ?`;
      params.push(status);
    }
    if (search) {
      query += ` AND (ql.transaction_ref LIKE ? OR ql.issuer_ref LIKE ? OR ql.order_id LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY ql.created_at DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const ledger = await db.allAsync(query, params);

    // Compute summary metrics
    const summary = await db.getAsync(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'PAID' OR status = 'SETTLED' THEN amount ELSE 0 END) as total_gross,
        SUM(CASE WHEN status = 'PAID' OR status = 'SETTLED' THEN mdr_amount ELSE 0 END) as total_mdr,
        SUM(CASE WHEN status = 'PAID' OR status = 'SETTLED' THEN net_amount ELSE 0 END) as total_net,
        SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paid_unsettled_count,
        SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END) as settled_count,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'DISPUTED' THEN 1 ELSE 0 END) as disputed_count
      FROM qris_ledger
      WHERE outlet_id = ?
    `, [req.outletId]);

    res.json({ ledger, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reconcile/batches (Settlement batch history)
router.get('/batches', authenticateToken, async (req, res) => {
  try {
    const batches = await db.allAsync(
      `SELECT sb.*, u.full_name as uploaded_by_name 
       FROM settlement_batches sb 
       LEFT JOIN users u ON sb.uploaded_by = u.id 
       ORDER BY sb.settlement_date DESC, sb.created_at DESC`
    );
    res.json({ batches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reconcile/batch/:id (Batch details and matched/mismatched rows)
router.get('/batch/:id', authenticateToken, async (req, res) => {
  try {
    const batch = await db.getAsync('SELECT * FROM settlement_batches WHERE id = ?', [req.params.id]);
    if (!batch) return res.status(404).json({ error: 'Batch settlement tidak ditemukan' });

    const items = await db.allAsync(
      `SELECT si.*, ql.order_id, ql.amount as pos_amount, ql.status as pos_status,
              rt.id as ticket_id, rt.ticket_number, rt.status as ticket_status 
       FROM settlement_items si 
       LEFT JOIN qris_ledger ql ON si.qris_ledger_id = ql.id 
       LEFT JOIN reconciliation_tickets rt ON si.id = rt.settlement_item_id 
       WHERE si.settlement_id = ? 
       ORDER BY si.match_status DESC, si.id ASC`,
      [batch.id]
    );

    res.json({ batch, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Run Auto-Reconciliation Algorithm against an array of settlement records
async function runAutoReconciliation(settlementRecords, batchMeta, userId) {
  const batchId = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
  
  let totalGross = 0;
  let totalMdr = 0;
  let totalNet = 0;
  let matchedCount = 0;
  let mismatchCount = 0;

  // Insert batch
  const batchRes = await db.runAsync(
    `INSERT INTO settlement_batches (batch_id, settlement_date, pjp_name, file_name, total_records, uploaded_by) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      batchId,
      batchMeta.settlement_date || new Date().toISOString().split('T')[0],
      batchMeta.pjp_name || 'XENDIT_OR_MIDTRANS',
      batchMeta.file_name || 'Auto-Settlement-Import.csv',
      settlementRecords.length,
      userId || null
    ]
  );
  const settlementBatchId = batchRes.lastID;

  // Track matched ledger IDs
  const matchedLedgerIds = new Set();

  for (const row of settlementRecords) {
    const pjpRef = (row.pjp_ref || row.transaction_ref || '').trim();
    const rrn = (row.rrn || row.issuer_ref || '').trim();
    const gross = parseInt(row.amount_gross || row.amount || 0, 10);
    const mdr = parseInt(row.mdr_amount || Math.round(gross * 0.007), 10);
    const net = parseInt(row.amount_net || (gross - mdr), 10);
    const paidTime = row.paid_time || row.paid_at || new Date().toISOString();

    totalGross += gross;
    totalMdr += mdr;
    totalNet += net;

    // Search in POS QRIS Ledger by pjp_ref or rrn
    let ledger = null;
    if (pjpRef) {
      ledger = await db.getAsync('SELECT * FROM qris_ledger WHERE transaction_ref = ?', [pjpRef]);
    }
    if (!ledger && rrn) {
      ledger = await db.getAsync('SELECT * FROM qris_ledger WHERE issuer_ref = ?', [rrn]);
    }

    let matchStatus = 'MATCHED';
    let discrepancyNotes = 'Cocok sempurna dengan data kasir POS';

    if (!ledger) {
      matchStatus = 'MISSING_IN_POS';
      discrepancyNotes = `Transaksi PJP ${pjpRef} (Rp ${gross.toLocaleString('id-ID')}) tercatat di mutasi PJP tetapi TIDAK ADA di sistem POS`;
      mismatchCount++;
    } else {
      matchedLedgerIds.add(ledger.id);

      if (ledger.amount !== gross) {
        matchStatus = 'AMOUNT_MISMATCH';
        const diff = gross - ledger.amount;
        discrepancyNotes = `Selisih nominal: POS mencatat Rp ${ledger.amount.toLocaleString('id-ID')} vs Settlement PJP Rp ${gross.toLocaleString('id-ID')} (Selisih: ${diff > 0 ? '+' : ''}Rp ${diff.toLocaleString('id-ID')})`;
        mismatchCount++;
      } else {
        matchedCount++;
        // Mark ledger as SETTLED
        await db.runAsync('UPDATE qris_ledger SET status = "SETTLED", settlement_id = ? WHERE id = ?', [settlementBatchId, ledger.id]);
      }
    }

    // Insert into settlement_items
    const itemRes = await db.runAsync(
      `INSERT INTO settlement_items (settlement_id, pjp_ref, rrn, amount_gross, mdr_amount, amount_net, paid_time, match_status, qris_ledger_id, discrepancy_notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlementBatchId,
        pjpRef || 'N/A',
        rrn || null,
        gross,
        mdr,
        net,
        paidTime,
        matchStatus,
        ledger ? ledger.id : null,
        discrepancyNotes
      ]
    );

    // If mismatch, automatically create a discrepancy ticket!
    if (matchStatus !== 'MATCHED') {
      const ticketNum = `TCK-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
      await db.runAsync(
        `INSERT INTO reconciliation_tickets (settlement_item_id, qris_ledger_id, ticket_number, issue_type, status, notes) 
         VALUES (?, ?, ?, ?, 'OPEN', ?)`,
        [itemRes.lastID, ledger ? ledger.id : null, ticketNum, matchStatus, discrepancyNotes]
      );
    }
  }

  // Check for "MISSING_IN_SETTLEMENT": PAID transactions in POS from the same date not present in settlement
  const dateStr = batchMeta.settlement_date || new Date().toISOString().split('T')[0];
  const paidLedgers = await db.allAsync(
    `SELECT * FROM qris_ledger 
     WHERE date(created_at) = date(?) AND status = 'PAID'`,
    [dateStr]
  );

  for (const pl of paidLedgers) {
    if (!matchedLedgerIds.has(pl.id)) {
      mismatchCount++;
      const note = `Transaksi POS ${pl.order_id} (Ref: ${pl.transaction_ref}, Rp ${pl.amount.toLocaleString('id-ID')}) tercatat Lunas di POS, tetapi BELUM TERLIHAT di settlement PJP`;
      const itemRes = await db.runAsync(
        `INSERT INTO settlement_items (settlement_id, pjp_ref, rrn, amount_gross, mdr_amount, amount_net, paid_time, match_status, qris_ledger_id, discrepancy_notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'MISSING_IN_SETTLEMENT', ?, ?)`,
        [
          settlementBatchId,
          pl.transaction_ref,
          pl.issuer_ref,
          pl.amount,
          pl.mdr_amount,
          pl.net_amount,
          pl.paid_at || pl.created_at,
          pl.id,
          note
        ]
      );

      const ticketNum = `TCK-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
      await db.runAsync(
        `INSERT INTO reconciliation_tickets (settlement_item_id, qris_ledger_id, ticket_number, issue_type, status, notes) 
         VALUES (?, ?, ?, 'MISSING_IN_SETTLEMENT', 'OPEN', ?)`,
        [itemRes.lastID, pl.id, ticketNum, note]
      );
    }
  }

  // Update batch totals
  await db.runAsync(
    `UPDATE settlement_batches 
     SET matched_records = ?, mismatch_records = ?, total_gross = ?, total_mdr = ?, total_net = ? 
     WHERE id = ?`,
    [matchedCount, mismatchCount, totalGross, totalMdr, totalNet, settlementBatchId]
  );

  return {
    batch_id: batchId,
    settlementBatchId,
    matched_count: matchedCount,
    mismatch_count: mismatchCount,
    total_records: settlementRecords.length,
    total_gross: totalGross,
    total_net: totalNet
  };
}

// POST /api/reconcile/upload-settlement (Upload CSV settlement file)
router.post('/upload-settlement', authenticateToken, requirePermission('reconcile.manage'), upload.single('settlement_file'), async (req, res) => {
  try {
    let rows = [];
    const fileName = req.file ? req.file.originalname : 'settlement.csv';

    if (req.file) {
      const csvText = req.file.buffer.toString('utf-8');
      const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        return res.status(400).json({ error: 'File CSV kosong atau tidak memiliki baris data' });
      }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = parts[idx] || '';
        });
        rows.push({
          pjp_ref: row.transaction_ref || row.pjp_ref || row.reference_id || row['pjp ref'] || '',
          rrn: row.rrn || row.issuer_ref || '',
          amount_gross: parseInt(row.amount_gross || row.gross_amount || row.amount || row.nominal || 0, 10),
          mdr_amount: parseInt(row.mdr || row.mdr_amount || 0, 10),
          amount_net: parseInt(row.amount_net || row.net_amount || 0, 10),
          paid_time: row.paid_time || row.date || new Date().toISOString()
        });
      }
    } else if (req.body.records && Array.isArray(req.body.records)) {
      rows = req.body.records;
    } else {
      return res.status(400).json({ error: 'File CSV atau data rekonsiliasi settlement tidak ditemukan' });
    }

    const result = await runAutoReconciliation(rows, { file_name: fileName, settlement_date: req.body.settlement_date }, req.user.id);
    await recordAuditLog(req.user.id, 'SETTLEMENT_IMPORT', 'settlement_batches', result.batch_id, result, req);

    res.json({
      success: true,
      result,
      message: `Rekonsiliasi selesai! ${result.matched_count} transaksi cocok (Matched), ${result.mismatch_count} transaksi selisih/perlu perhatian.`
    });
  } catch (err) {
    console.error('Settlement upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reconcile/simulate-auto-settlement (One-click simulated PJP Settlement fetch & reconciliation)
router.post('/simulate-auto-settlement', authenticateToken, requirePermission('reconcile.manage'), async (req, res) => {
  try {
    // Generate simulated settlement rows matching today's and yesterday's QRIS transactions
    const paidQris = await db.allAsync(
      `SELECT * FROM qris_ledger WHERE status IN ('PAID', 'PENDING') ORDER BY created_at DESC LIMIT 10`
    );

    if (paidQris.length === 0) {
      return res.status(400).json({ error: 'Tidak ada transaksi QRIS yang dapat direkonsiliasi. Buat transaksi QRIS terlebih dahulu.' });
    }

    const simulatedRows = [];

    // Most will match perfectly
    for (let i = 0; i < paidQris.length; i++) {
      const q = paidQris[i];
      // Intentionally introduce 1 subtle amount discrepancy on the last item for demo realism if > 2 items
      const isMismatch = (i === paidQris.length - 1 && paidQris.length > 2);
      const gross = isMismatch ? (q.amount - 1000) : q.amount;
      const mdr = Math.round(gross * (q.mdr_percent / 100));
      const net = gross - mdr;

      simulatedRows.push({
        pjp_ref: q.transaction_ref,
        rrn: q.issuer_ref || `RRN-${Math.floor(100000000000 + Math.random() * 900000000000)}`,
        amount_gross: gross,
        mdr_amount: mdr,
        amount_net: net,
        paid_time: q.paid_at || new Date().toISOString()
      });
    }

    // Add 1 extraneous bank settlement row that is missing in POS
    simulatedRows.push({
      pjp_ref: `QRIS-PJP-EXTRANEOUS-${Math.floor(1000 + Math.random() * 9000)}`,
      rrn: `RRN-${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      amount_gross: 25000,
      mdr_amount: 175,
      amount_net: 24825,
      paid_time: new Date().toISOString()
    });

    const result = await runAutoReconciliation(
      simulatedRows,
      { file_name: 'PJP-API-AUTO-SETTLEMENT.csv', pjp_name: 'PJP_GATEWAY_API' },
      req.user.id
    );

    await recordAuditLog(req.user.id, 'SIMULATE_AUTO_SETTLEMENT', 'settlement_batches', result.batch_id, result, req);

    res.json({
      success: true,
      result,
      message: `PJP Settlement berhasil diimpor & direkonsiliasi otomatis: ${result.matched_count} Cocok, ${result.mismatch_count} Selisih/Tiket baru.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reconcile/tickets (Discrepancy Action Queue)
router.get('/tickets', authenticateToken, resolveOutletContext, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT rt.*, si.pjp_ref, si.rrn, si.amount_gross as settlement_gross, si.discrepancy_notes,
             ql.order_id, ql.amount as pos_amount, ql.transaction_ref,
             u.full_name as assigned_to_name 
      FROM reconciliation_tickets rt 
      JOIN settlement_items si ON rt.settlement_item_id = si.id 
      LEFT JOIN qris_ledger ql ON rt.qris_ledger_id = ql.id 
      LEFT JOIN users u ON rt.assigned_to = u.id 
      WHERE (ql.outlet_id = ? OR ql.id IS NULL)
    `;
    const params = [req.outletId];

    if (status && status !== 'ALL') {
      query += ` AND rt.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY CASE rt.status WHEN 'OPEN' THEN 1 WHEN 'INVESTIGATING' THEN 2 ELSE 3 END, rt.created_at DESC`;
    const tickets = await db.allAsync(query, params);
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reconcile/tickets/:id (Update Discrepancy Ticket status & resolution notes with Manager PIN)
router.put('/tickets/:id', authenticateToken, requirePermission('reconcile.manage'), verifyManagerPin, async (req, res) => {
  try {
    const id = req.params.id;
    const { status, resolution, notes } = req.body;

    if (!status || !['OPEN', 'INVESTIGATING', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Status tiket tidak valid (OPEN / INVESTIGATING / RESOLVED)' });
    }

    await db.runAsync(
      `UPDATE reconciliation_tickets 
       SET status = ?, resolution = ?, notes = COALESCE(?, notes), 
           assigned_to = ?, resolved_at = CASE WHEN ? = 'RESOLVED' THEN CURRENT_TIMESTAMP ELSE NULL END 
       WHERE id = ?`,
      [status, resolution || null, notes || null, req.user.id, status, id]
    );

    await recordAuditLog(
      req.user.id,
      'UPDATE_RECON_TICKET',
      'reconciliation_tickets',
      id,
      { status, resolution, manager: req.manager.full_name },
      req
    );

    res.json({ success: true, message: `Tiket selisih rekonsiliasi diperbarui ke status ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reconcile/export-csv (Export QRIS Ledger to CSV for Accountant)
router.get('/export-csv', authenticateToken, requirePermission('reconcile.manage'), async (req, res) => {
  try {
    const records = await db.allAsync(`
      SELECT 
        ql.id, ql.order_id, ql.transaction_ref, ql.issuer_ref, ql.amount, 
        ql.mdr_percent, ql.mdr_amount, ql.net_amount, ql.status, 
        ql.customer_bank_or_wallet, ql.paid_at, ql.created_at,
        u.full_name as cashier_name
      FROM qris_ledger ql 
      LEFT JOIN users u ON ql.cashier_id = u.id 
      ORDER BY ql.created_at DESC
    `);

    let csv = 'ID,Order ID,PJP Ref,RRN (Issuer Trace),Nominal Bruto (IDR),MDR (%),Biaya MDR (IDR),Nominal Bersih (IDR),Status,Bank / E-Wallet,Waktu Bayar,Waktu Dibuat,Kasir\n';

    records.forEach(r => {
      csv += [
        r.id,
        `"${r.order_id || ''}"`,
        `"${r.transaction_ref || ''}"`,
        `"${r.issuer_ref || ''}"`,
        r.amount,
        r.mdr_percent,
        r.mdr_amount,
        r.net_amount,
        r.status,
        `"${r.customer_bank_or_wallet || ''}"`,
        `"${r.paid_at || ''}"`,
        `"${r.created_at || ''}"`,
        `"${r.cashier_name || ''}"`
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="QRIS-Ledger-Report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

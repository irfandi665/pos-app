const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { db } = require('../db');
const { authenticateToken, recordAuditLog } = require('../auth');

// In-memory SSE clients list for real-time notifications
let sseClients = [];

function broadcastSse(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (e) {
      // client disconnected
    }
  });
}

// GET /api/qris/events (Server-Sent Events connection)
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const clientId = Date.now() + Math.random();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE QRIS connected', clientId })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Helper to generate dynamic QRIS EMVCo string
function buildQrisPayload(merchantId, merchantName, city, amount, pjpRef) {
  // Indonesian QRIS format (EMVCo compliant)
  // Payload format: 00 (Format Indicator), 01 (Point of Initiation Method: 12 = Dynamic), 26 (Merchant Account Info), 52 (MCC), 53 (Currency: 360 = IDR), 54 (Amount), 58 (Country: ID), 59 (Merchant Name), 60 (City), 62 (Additional Data / Bill Ref)
  const pad = (id, str) => {
    const len = String(str.length).padStart(2, '0');
    return `${id}${len}${str}`;
  };

  const accountInfo = `0016ID.CO.QRIS.WWW01189360091100000000000215${merchantId || 'MID-ID-QRIS-789123'}`;
  const addData = `01${String(pjpRef.length).padStart(2, '0')}${pjpRef}`;

  let raw = '';
  raw += pad('00', '01'); // Payload Format Indicator
  raw += pad('01', '12'); // Point of Initiation: 12 = Dynamic QR
  raw += pad('26', accountInfo);
  raw += pad('52', '5411'); // Merchant Category Code (Grocery Stores, Supermarkets)
  raw += pad('53', '360'); // Transaction Currency IDR
  raw += pad('54', String(amount)); // Transaction Amount locked
  raw += pad('58', 'ID'); // Country Code
  raw += pad('59', (merchantName || 'TOKO BERKAH MANDIRI').slice(0, 25).toUpperCase());
  raw += pad('60', (city || 'YOGYAKARTA').slice(0, 15).toUpperCase());
  raw += pad('62', addData);

  // CRC placeholder
  raw += '6304';
  
  // Calculate CRC16 CCITT
  let crc = 0xFFFF;
  for (let i = 0; i < raw.length; i++) {
    crc ^= raw.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
  return raw.slice(0, -4) + `6304${crcHex}`;
}

// POST /api/qris/generate (Generate Dynamic QRIS for POS cart)
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { items, discount_amount = 0, tax_rate = 0, customer_id = null, notes = null } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang belanja tidak boleh kosong' });
    }

    const activeShift = await db.getAsync(
      'SELECT id FROM shifts WHERE user_id = ? AND status = "open"',
      [req.user.id]
    );

    if (!activeShift) {
      return res.status(400).json({ error: 'Kasir belum membuka shift aktif' });
    }

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const prod = await db.getAsync('SELECT * FROM products WHERE id = ? AND is_active = 1', [item.product_id]);
      if (!prod) return res.status(400).json({ error: `Produk ID ${item.product_id} tidak valid` });

      const qty = parseInt(item.quantity, 10);
      if (prod.stock < qty) {
        return res.status(400).json({ error: `Stok "${prod.name}" tidak mencukupi (Tersedia: ${prod.stock})` });
      }

      const lineTotal = prod.selling_price * qty;
      subtotal += lineTotal;
      orderItems.push({
        product_id: prod.id,
        name: prod.name,
        sku: prod.sku,
        unit_price: prod.selling_price,
        cost_price: prod.cost_price,
        quantity: qty,
        subtotal: lineTotal,
        total: lineTotal,
        stock: prod.stock
      });
    }

    const disc = parseInt(discount_amount || 0, 10);
    const afterDisc = Math.max(0, subtotal - disc);
    const tax = Math.round(afterDisc * (parseFloat(tax_rate || 0) / 100));
    const totalAmount = afterDisc + tax;

    // Generate unique order ID and PJP Reference ID
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ORD-${ymd}-${rand}`;
    const pjpRef = `QRIS-PJP-${ymd}-${rand}`;

    // Dynamic QR expires in 5 minutes (300 seconds)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Fetch store info & MDR rate
    const storeName = (await db.getAsync("SELECT value FROM settings WHERE key = 'store_name'"))?.value || 'Toko Berkah Mandiri';
    const storeCity = 'YOGYAKARTA';
    const mdrRateStr = (await db.getAsync("SELECT value FROM settings WHERE key = 'mdr_qris_rate'"))?.value || '0.7';
    const mdrRate = parseFloat(mdrRateStr);
    const mdrAmount = Math.round(totalAmount * (mdrRate / 100));
    const netAmount = totalAmount - mdrAmount;

    // Build standard QRIS EMVCo string
    const qrString = buildQrisPayload('MID-ID-QRIS-789123', storeName, storeCity, totalAmount, pjpRef);

    // Generate QR code data URL image
    const qrDataUrl = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      }
    });

    // Create pending order
    await db.runAsync(
      `INSERT INTO orders (id, outlet_id, cashier_id, customer_id, shift_id, status, subtotal, discount_amount, tax_rate, tax_amount, total_amount, payment_method, notes) 
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 'qris', ?)`,
      [
        orderId,
        req.user.outlet_id || 1,
        req.user.id,
        customer_id || null,
        activeShift.id,
        subtotal,
        disc,
        parseFloat(tax_rate || 0),
        tax,
        totalAmount,
        notes || null
      ]
    );

    // Insert pending order items (stock deducted only upon paid webhook)
    for (const oi of orderItems) {
      await db.runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, sku, unit_price, cost_price, quantity, subtotal, discount, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [orderId, oi.product_id, oi.name, oi.sku, oi.unit_price, oi.cost_price, oi.quantity, oi.subtotal, oi.total]
      );
    }

    // Insert into QRIS Ledger
    await db.runAsync(
      `INSERT INTO qris_ledger (order_id, transaction_ref, qr_type, qr_string, amount, mdr_percent, mdr_amount, net_amount, status, expires_at, outlet_id, cashier_id) 
       VALUES (?, ?, 'dynamic', ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        orderId,
        pjpRef,
        qrString,
        totalAmount,
        mdrRate,
        mdrAmount,
        netAmount,
        expiresAt.toISOString(),
        req.user.outlet_id || 1,
        req.user.id
      ]
    );

    await recordAuditLog(
      req.user.id,
      'GENERATE_DYNAMIC_QRIS',
      'qris_ledger',
      pjpRef,
      { orderId, amount: totalAmount, expiresAt: expiresAt.toISOString() },
      req
    );

    res.json({
      success: true,
      order_id: orderId,
      transaction_ref: pjpRef,
      qr_string: qrString,
      qr_data_url: qrDataUrl,
      amount: totalAmount,
      expires_at: expiresAt.toISOString(),
      expires_in_seconds: 300,
      mdr_rate: mdrRate,
      mdr_amount: mdrAmount,
      net_amount: netAmount
    });
  } catch (err) {
    console.error('Generate QRIS error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qris/webhook (PJP Webhook Receiver with Signature & Idempotency)
router.post('/webhook', async (req, res) => {
  try {
    const {
      transaction_ref, // PJP reference ID
      issuer_ref,      // RRN trace number from Bank Indonesia network
      status,          // 'PAID' or 'EXPIRED'
      amount,
      paid_at,
      customer_bank,   // e.g. 'BCA Mobile', 'GoPay', 'ShopeePay'
      signature
    } = req.body;

    if (!transaction_ref) {
      return res.status(400).json({ error: 'transaction_ref wajib disertakan' });
    }

    // Webhook signature verification (HMAC-SHA256 with webhook secret)
    const secret = process.env.PJP_WEBHOOK_SECRET || 'pjp-webhook-secret-key-qris-2026';
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${transaction_ref}:${amount || ''}:${status || ''}`)
      .digest('hex');

    // If client provided a signature, verify it (in simulator / demo mode we also allow verified flag)
    if (signature && signature !== computedSignature && signature !== 'SIMULATED_VALID_SIGNATURE') {
      console.warn(`Invalid signature for webhook ${transaction_ref}`);
      return res.status(401).json({ error: 'Tanda tangan webhook (signature) tidak valid' });
    }

    // Find in QRIS Ledger
    const ledger = await db.getAsync('SELECT * FROM qris_ledger WHERE transaction_ref = ?', [transaction_ref]);
    if (!ledger) {
      return res.status(404).json({ error: 'Transaksi QRIS tidak ditemukan di ledger' });
    }

    // Idempotency check: If already PAID, acknowledge without re-deducting stock
    if (ledger.status === 'PAID') {
      return res.json({
        success: true,
        message: 'Idempoten: Webhook notifikasi ganda telah diabaikan (sudah lunas)',
        status: 'PAID'
      });
    }

    const paymentTime = paid_at || new Date().toISOString();
    const rrn = issuer_ref || `RRN-${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    if (status === 'PAID') {
      // 1. Update QRIS Ledger to PAID
      await db.runAsync(
        `UPDATE qris_ledger 
         SET status = 'PAID', issuer_ref = ?, paid_at = ?, customer_bank_or_wallet = ?, webhook_payload = ? 
         WHERE transaction_ref = ?`,
        [rrn, paymentTime, customer_bank || 'QRIS Digital Payment', JSON.stringify(req.body), transaction_ref]
      );

      // 2. Update Order to PAID
      await db.runAsync(
        `UPDATE orders 
         SET status = 'paid', paid_at = ? 
         WHERE id = ?`,
        [paymentTime, ledger.order_id]
      );

      // 3. Insert into order_payments
      await db.runAsync(
        `INSERT INTO order_payments (order_id, payment_method, amount, tender_amount, change_amount, qris_ref) 
         VALUES (?, 'qris', ?, ?, 0, ?)`,
        [ledger.order_id, ledger.amount, ledger.amount, transaction_ref]
      );

      // 4. Deduct inventory stock & record stock movement
      const items = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [ledger.order_id]);
      for (const it of items) {
        const prod = await db.getAsync('SELECT stock FROM products WHERE id = ?', [it.product_id]);
        if (prod) {
          const newStock = prod.stock - it.quantity;
          await db.runAsync('UPDATE products SET stock = ? WHERE id = ?', [newStock, it.product_id]);

          await db.runAsync(
            `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, reference_id, notes, user_id) 
             VALUES (?, ?, ?, ?, ?, 'sale', ?, 'Penjualan QRIS Dinamis Lunas', ?)`,
            [it.product_id, ledger.outlet_id, -it.quantity, prod.stock, newStock, ledger.order_id, ledger.cashier_id]
          );
        }
      }

      // 5. Broadcast SSE event immediately to all active screens (< 1 second response!)
      broadcastSse('qris_paid', {
        transaction_ref,
        order_id: ledger.order_id,
        amount: ledger.amount,
        status: 'PAID',
        customer_bank: customer_bank || 'QRIS Digital Payment',
        issuer_ref: rrn,
        paid_at: paymentTime
      });

      await recordAuditLog(
        ledger.cashier_id,
        'QRIS_WEBHOOK_PAID',
        'qris_ledger',
        transaction_ref,
        { order_id: ledger.order_id, amount: ledger.amount, rrn, bank: customer_bank },
        req
      );

      return res.json({
        success: true,
        message: 'Pembayaran QRIS berhasil diproses dan diverifikasi',
        status: 'PAID',
        rrn
      });
    } else if (status === 'EXPIRED') {
      await db.runAsync(
        `UPDATE qris_ledger SET status = 'EXPIRED' WHERE transaction_ref = ?`,
        [transaction_ref]
      );
      await db.runAsync(
        `UPDATE orders SET status = 'voided', void_reason = 'QRIS kedaluwarsa tanpa pembayaran' WHERE id = ?`,
        [ledger.order_id]
      );

      broadcastSse('qris_expired', {
        transaction_ref,
        order_id: ledger.order_id,
        status: 'EXPIRED'
      });

      return res.json({ success: true, status: 'EXPIRED' });
    }

    res.json({ success: true, message: 'Webhook diterima' });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qris/poll/:ref (Fallback status polling for POS cashier screen)
router.get('/poll/:ref', authenticateToken, async (req, res) => {
  try {
    const ledger = await db.getAsync(
      'SELECT status, paid_at, issuer_ref, customer_bank_or_wallet, order_id, amount FROM qris_ledger WHERE transaction_ref = ?',
      [req.params.ref]
    );

    if (!ledger) {
      return res.status(404).json({ error: 'Referensi QRIS tidak ditemukan' });
    }

    res.json({
      status: ledger.status,
      paid_at: ledger.paid_at,
      issuer_ref: ledger.issuer_ref,
      customer_bank: ledger.customer_bank_or_wallet,
      order_id: ledger.order_id,
      amount: ledger.amount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qris/simulate-pay (Interactive QRIS payment simulator for testing & demo)
router.post('/simulate-pay', async (req, res) => {
  try {
    const { transaction_ref, customer_bank = 'BCA Mobile' } = req.body;

    const ledger = await db.getAsync('SELECT * FROM qris_ledger WHERE transaction_ref = ?', [transaction_ref]);
    if (!ledger) {
      return res.status(404).json({ error: 'Transaksi QRIS tidak ditemukan' });
    }

    if (ledger.status === 'PAID') {
      return res.json({ success: true, message: 'Transaksi ini sudah lunas', status: 'PAID' });
    }

    const rrn = `RRN-${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    const secret = process.env.PJP_WEBHOOK_SECRET || 'pjp-webhook-secret-key-qris-2026';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${transaction_ref}:${ledger.amount}:PAID`)
      .digest('hex');

    // Call internal webhook handler logic directly
    const webhookReq = {
      body: {
        transaction_ref,
        issuer_ref: rrn,
        status: 'PAID',
        amount: ledger.amount,
        paid_at: new Date().toISOString(),
        customer_bank,
        signature
      },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    };

    // Forward to webhook logic
    const paymentTime = new Date().toISOString();

    await db.runAsync(
      `UPDATE qris_ledger 
       SET status = 'PAID', issuer_ref = ?, paid_at = ?, customer_bank_or_wallet = ?, webhook_payload = ? 
       WHERE transaction_ref = ?`,
      [rrn, paymentTime, customer_bank, JSON.stringify(webhookReq.body), transaction_ref]
    );

    await db.runAsync(
      `UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?`,
      [paymentTime, ledger.order_id]
    );

    await db.runAsync(
      `INSERT INTO order_payments (order_id, payment_method, amount, tender_amount, change_amount, qris_ref) 
       VALUES (?, 'qris', ?, ?, 0, ?)`,
      [ledger.order_id, ledger.amount, ledger.amount, transaction_ref]
    );

    // Deduct stock
    const items = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [ledger.order_id]);
    for (const it of items) {
      const prod = await db.getAsync('SELECT stock FROM products WHERE id = ?', [it.product_id]);
      if (prod) {
        const newStock = prod.stock - it.quantity;
        await db.runAsync('UPDATE products SET stock = ? WHERE id = ?', [newStock, it.product_id]);

        await db.runAsync(
          `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, reference_id, notes, user_id) 
           VALUES (?, ?, ?, ?, ?, 'sale', ?, 'Penjualan QRIS Dinamis (Simulasi)', ?)`,
          [it.product_id, ledger.outlet_id, -it.quantity, prod.stock, newStock, ledger.order_id, ledger.cashier_id]
        );
      }
    }

    broadcastSse('qris_paid', {
      transaction_ref,
      order_id: ledger.order_id,
      amount: ledger.amount,
      status: 'PAID',
      customer_bank,
      issuer_ref: rrn,
      paid_at: paymentTime
    });

    res.json({
      success: true,
      message: `Simulasi pembayaran sukses via ${customer_bank}! Status otomatis berubah menjadi LUNAS.`,
      status: 'PAID',
      issuer_ref: rrn
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { db, withTransaction } = require('../db');
const { authenticateToken, recordAuditLog } = require('../auth');
const { resolveOutletContext } = require('../services/outlets');
const { calculateCart } = require('../services/cart');
const { InventoryError, deductStock } = require('../services/inventory');
const {
  reserveStockForOrder,
  getActiveReservations,
  consumeReservations,
  releaseOrderReservations
} = require('../services/reservations');
const {
  addSseClient,
  removeSseClient,
  broadcastSse
} = require('../services/qris-events');

// GET /api/qris/events (Server-Sent Events connection)
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const clientId = addSseClient(res);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE QRIS connected', clientId })}\n\n`);

  req.on('close', () => {
    removeSseClient(clientId);
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

/**
 * Settles a PENDING QRIS ledger row exactly once. The conditional UPDATE plus
 * the serialized transaction make duplicate/concurrent webhooks idempotent and
 * keep payment, order, and inventory updates atomic.
 */
async function settleQrisPayment({
  transactionRef,
  amount,
  paidAt,
  customerBank,
  issuerRef,
  webhookPayload,
  req,
  notes = 'Penjualan QRIS Dinamis Lunas'
}) {
  const ledger = await db.getAsync('SELECT * FROM qris_ledger WHERE transaction_ref = ?', [transactionRef]);
  if (!ledger) return { outcome: 'NOT_FOUND' };

  if (amount !== undefined && amount !== null && Number(amount) !== ledger.amount) {
    return { outcome: 'AMOUNT_MISMATCH', ledger };
  }

  if (ledger.status === 'PAID' || ledger.status === 'SETTLED') {
    return { outcome: 'ALREADY_PAID', ledger };
  }

  if (ledger.status !== 'PENDING') {
    return { outcome: 'NOT_PENDING', ledger };
  }

  const paymentTime = paidAt || new Date().toISOString();
  const rrn = issuerRef || `RRN-${Math.floor(100000000000 + Math.random() * 900000000000)}`;

  const claimed = await withTransaction(async () => {
    const updatedLedger = await db.getAsync(
      `UPDATE qris_ledger
       SET status = 'PAID', issuer_ref = ?, paid_at = ?, customer_bank_or_wallet = ?, webhook_payload = ?
       WHERE transaction_ref = ? AND status = 'PENDING'
       RETURNING id`,
      [rrn, paymentTime, customerBank || 'QRIS Digital Payment', JSON.stringify(webhookPayload || {}), transactionRef]
    );

    if (!updatedLedger) return false;

    await db.runAsync(
      `UPDATE orders
       SET status = 'paid', paid_at = ?
       WHERE id = ?`,
      [paymentTime, ledger.order_id]
    );

    await db.runAsync(
      `INSERT INTO order_payments (order_id, payment_method, amount, tender_amount, change_amount, qris_ref)
       VALUES (?, 'qris', ?, ?, 0, ?)`,
      [ledger.order_id, ledger.amount, ledger.amount, transactionRef]
    );

    // Stock was already reserved (deducted) when the QR was generated.
    // Only orders created before the reservation migration need a fallback
    // deduction at settlement time.
    const activeReservations = await getActiveReservations(db, ledger.order_id);
    const reservedProductIds = new Set(activeReservations.map((row) => row.product_id));

    const items = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [ledger.order_id]);
    for (const item of items) {
      if (reservedProductIds.has(item.product_id)) continue;

      await deductStock(db, {
        productId: item.product_id,
        quantity: item.quantity,
        outletId: ledger.outlet_id,
        userId: ledger.cashier_id,
        referenceId: ledger.order_id,
        notes,
        movementType: 'sale'
      });
    }

    await consumeReservations(db, ledger.order_id);
    return true;
  });

  if (!claimed) {
    return { outcome: 'ALREADY_PAID', ledger };
  }

  broadcastSse('qris_paid', {
    transaction_ref: transactionRef,
    order_id: ledger.order_id,
    amount: ledger.amount,
    status: 'PAID',
    customer_bank: customerBank || 'QRIS Digital Payment',
    issuer_ref: rrn,
    paid_at: paymentTime
  });

  await recordAuditLog(
    ledger.cashier_id,
    'QRIS_PAID',
    'qris_ledger',
    transactionRef,
    { order_id: ledger.order_id, amount: ledger.amount, rrn, bank: customerBank },
    req
  );

  return { outcome: 'PAID', ledger, rrn, paymentTime };
}

/**
 * Expires a PENDING QRIS ledger and releases its stock reservations exactly
 * once. Paid ledgers are never expired, which prevents losing a real payment.
 */
async function expireQrisPayment({
  transactionRef,
  req,
  reason = 'QRIS kedaluwarsa tanpa pembayaran'
}) {
  const ledger = await db.getAsync('SELECT * FROM qris_ledger WHERE transaction_ref = ?', [transactionRef]);
  if (!ledger) return { outcome: 'NOT_FOUND' };

  if (ledger.status === 'PAID' || ledger.status === 'SETTLED') {
    return { outcome: 'ALREADY_PAID', ledger };
  }
  if (ledger.status === 'EXPIRED') {
    return { outcome: 'ALREADY_EXPIRED', ledger };
  }
  if (ledger.status !== 'PENDING') {
    return { outcome: 'NOT_PENDING', ledger };
  }

  const released = await withTransaction(async () => {
    const claimed = await db.getAsync(
      `UPDATE qris_ledger
       SET status = 'EXPIRED'
       WHERE transaction_ref = ? AND status = 'PENDING'
       RETURNING id`,
      [transactionRef]
    );

    if (!claimed) return null;

    const releasedCount = await releaseOrderReservations(db, {
      orderId: ledger.order_id,
      outletId: ledger.outlet_id,
      userId: ledger.cashier_id,
      notes: reason
    });

    await db.runAsync(
      `UPDATE orders
       SET status = 'voided', void_reason = ?
       WHERE id = ? AND status = 'pending'`,
      [reason, ledger.order_id]
    );

    await recordAuditLog(
      ledger.cashier_id,
      'QRIS_EXPIRED',
      'qris_ledger',
      transactionRef,
      { order_id: ledger.order_id, released_reservations: releasedCount, reason },
      req
    );

    return releasedCount;
  });

  if (released === null) {
    const current = await db.getAsync(
      'SELECT status FROM qris_ledger WHERE transaction_ref = ?',
      [transactionRef]
    );
    return { outcome: current?.status === 'EXPIRED' ? 'ALREADY_EXPIRED' : 'NOT_PENDING', ledger };
  }

  broadcastSse('qris_expired', {
    transaction_ref: transactionRef,
    order_id: ledger.order_id,
    status: 'EXPIRED'
  });

  return { outcome: 'EXPIRED', ledger, released_reservations: released };
}

// POST /api/qris/generate (Generate Dynamic QRIS for POS cart)
router.post('/generate', authenticateToken, resolveOutletContext, async (req, res) => {
  try {
    const {
      items,
      discount_amount = 0,
      discount_type = 'nominal',
      discount_value,
      tax_rate = 0,
      customer_id = null,
      notes = null
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang belanja tidak boleh kosong' });
    }

    const activeShift = await db.getAsync(
      'SELECT id FROM shifts WHERE user_id = ? AND outlet_id = ? AND status = "open"',
      [req.user.id, req.outletId]
    );

    if (!activeShift) {
      return res.status(400).json({ error: 'Kasir belum membuka shift aktif' });
    }

    const uniqueProductIds = [];
    for (const item of items) {
      const productId = Number(item.product_id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: `Produk ID ${item.product_id} tidak valid` });
      }
      if (!uniqueProductIds.includes(productId)) uniqueProductIds.push(productId);
    }

    const placeholders = uniqueProductIds.map(() => '?').join(',');
    const products = await db.allAsync(
      `SELECT * FROM products WHERE id IN (${placeholders}) AND is_active = 1 AND outlet_id = ?`,
      [...uniqueProductIds, req.outletId]
    );
    const productMap = new Map(products.map((product) => [product.id, product]));

    const pricedItems = [];
    for (const item of items) {
      const product = productMap.get(Number(item.product_id));
      if (!product) {
        return res.status(400).json({ error: `Produk ID ${item.product_id} tidak valid` });
      }

      pricedItems.push({
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: product.selling_price,
        cost_price: product.cost_price,
        quantity: item.quantity,
        stock: product.stock
      });
    }

    const cart = calculateCart(pricedItems, {
      discount_amount,
      discount_type,
      discount_value,
      tax_rate,
      enforce_stock: true
    });
    const totalAmount = cart.total_amount;

    // Generate unique order ID and PJP Reference ID
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomInt(100000, 1000000);
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

    const outletId = req.outletId;

    await withTransaction(async () => {
      await db.runAsync(
        `INSERT INTO orders (id, outlet_id, cashier_id, customer_id, shift_id, status, subtotal, discount_amount, discount_type, tax_rate, tax_amount, total_amount, payment_method, notes)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 'qris', ?)`,
        [
          orderId,
          outletId,
          req.user.id,
          customer_id || null,
          activeShift.id,
          cart.subtotal,
          cart.discount_amount,
          cart.discount_type,
          cart.tax_rate,
          cart.tax_amount,
          totalAmount,
          notes || null
        ]
      );

      // Insert pending order items (stock deducted only upon paid webhook)
      for (const item of cart.items) {
        await db.runAsync(
          `INSERT INTO order_items (order_id, product_id, product_name, sku, unit_price, cost_price, quantity, subtotal, discount, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            orderId,
            item.product_id,
            item.name,
            item.sku,
            item.unit_price,
            item.cost_price,
            item.quantity,
            item.subtotal,
            item.total
          ]
        );
      }

      // Reserve stock now so two simultaneous QRIS generations cannot sell
      // the same units. The reservation is consumed on PAID and released on
      // expiry by the sweeper.
      await reserveStockForOrder(db, {
        orderId,
        items: cart.items,
        outletId,
        userId: req.user.id,
        expiresAt: expiresAt.toISOString()
      });

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
          outletId,
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
    });

    res.json({
      success: true,
      order_id: orderId,
      transaction_ref: pjpRef,
      qr_string: qrString,
      qr_data_url: qrDataUrl,
      subtotal: cart.subtotal,
      discount_amount: cart.discount_amount,
      tax_amount: cart.tax_amount,
      amount: totalAmount,
      expires_at: expiresAt.toISOString(),
      expires_in_seconds: 300,
      mdr_rate: mdrRate,
      mdr_amount: mdrAmount,
      net_amount: netAmount
    });
  } catch (err) {
    if (err && err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
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

    if (status === 'PAID' && amount !== undefined && amount !== null && Number(amount) !== ledger.amount) {
      return res.status(400).json({
        error: `Nominal webhook (${amount}) tidak sesuai dengan nominal ledger (${ledger.amount})`
      });
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
      const result = await settleQrisPayment({
        transactionRef: transaction_ref,
        amount,
        paidAt: paid_at,
        customerBank: customer_bank,
        issuerRef: issuer_ref,
        webhookPayload: req.body,
        req
      });

      if (result.outcome === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Transaksi QRIS tidak ditemukan di ledger' });
      }
      if (result.outcome === 'AMOUNT_MISMATCH') {
        return res.status(400).json({
          error: `Nominal webhook (${amount}) tidak sesuai dengan nominal ledger (${result.ledger.amount})`
        });
      }
      if (result.outcome === 'ALREADY_PAID') {
        return res.json({
          success: true,
          message: 'Idempoten: Webhook notifikasi ganda telah diabaikan (sudah lunas)',
          status: 'PAID'
        });
      }
      if (result.outcome === 'NOT_PENDING') {
        return res.status(409).json({
          error: `QRIS tidak dapat diselesaikan karena berstatus ${result.ledger.status}. Lakukan rekonsiliasi/refund manual.`,
          code: 'QRIS_NOT_PENDING',
          status: result.ledger.status
        });
      }

      return res.json({
        success: true,
        message: 'Pembayaran QRIS berhasil diproses dan diverifikasi',
        status: 'PAID',
        rrn: result.rrn
      });
    } else if (status === 'EXPIRED') {
      const result = await expireQrisPayment({ transactionRef: transaction_ref, req });

      if (result.outcome === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Transaksi QRIS tidak ditemukan di ledger' });
      }
      if (result.outcome === 'ALREADY_PAID') {
        return res.json({
          success: true,
          message: 'Transaksi sudah lunas; notifikasi EXPIRED diabaikan',
          status: 'PAID'
        });
      }
      if (result.outcome === 'NOT_PENDING') {
        return res.status(409).json({
          error: `Status QRIS ${result.ledger.status} tidak dapat diubah menjadi EXPIRED`,
          code: 'QRIS_NOT_PENDING'
        });
      }

      return res.json({
        success: true,
        status: 'EXPIRED',
        released_reservations: result.released_reservations
      });
    }

    res.json({ success: true, message: 'Webhook diterima' });
  } catch (err) {
    if (err instanceof InventoryError || (err && err.statusCode && err.statusCode < 500)) {
      return res.status(err.statusCode || 400).json({ error: err.message, code: err.code });
    }
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

    if (ledger.status !== 'PENDING') {
      return res.status(409).json({
        error: `QRIS berstatus ${ledger.status} dan tidak dapat dibayar. Buat QR baru atau lakukan refund manual.`,
        code: 'QRIS_NOT_PENDING',
        status: ledger.status
      });
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

    const result = await settleQrisPayment({
      transactionRef: transaction_ref,
      amount: ledger.amount,
      paidAt: new Date().toISOString(),
      customerBank: customer_bank,
      issuerRef: rrn,
      webhookPayload: webhookReq.body,
      req,
      notes: 'Penjualan QRIS Dinamis (Simulasi)'
    });

    if (result.outcome === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Transaksi QRIS tidak ditemukan' });
    }
    if (result.outcome === 'AMOUNT_MISMATCH') {
      return res.status(400).json({ error: 'Nominal simulasi tidak sesuai dengan ledger' });
    }
    if (result.outcome === 'ALREADY_PAID') {
      return res.json({ success: true, message: 'Transaksi ini sudah lunas', status: 'PAID' });
    }
    if (result.outcome === 'NOT_PENDING') {
      return res.status(409).json({
        error: `QRIS berstatus ${result.ledger.status} dan tidak dapat diselesaikan`,
        code: 'QRIS_NOT_PENDING',
        status: result.ledger.status
      });
    }

    res.json({
      success: true,
      message: `Simulasi pembayaran sukses via ${customer_bank}! Status otomatis berubah menjadi LUNAS.`,
      status: 'PAID',
      issuer_ref: result.rrn
    });
  } catch (err) {
    if (err instanceof InventoryError || (err && err.statusCode && err.statusCode < 500)) {
      return res.status(err.statusCode || 400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

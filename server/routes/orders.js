const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { db, withTransaction } = require('../db');
const { authenticateToken, verifyManagerPin, recordAuditLog } = require('../auth');
const { calculateCart, validatePayments } = require('../services/cart');
const { InventoryError, deductStock, restoreStock } = require('../services/inventory');

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const REFUND_METHODS = new Set(['cash', 'card', 'qris', 'split']);

// Helper to generate readable ID e.g. ORD-20261112-0045
function generateOrderId() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomInt(100000, 1000000);
  return `ORD-${ymd}-${rand}`;
}

function normalizeIdempotencyKey(req) {
  const rawValue = req.headers['x-idempotency-key'] || req.body?.idempotency_key;
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return null;
  }

  const key = String(rawValue).trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    const error = new Error(
      'Idempotency key tidak valid. Gunakan 8-128 karakter alfanumerik, titik, titik dua, garis bawah, atau strip.'
    );
    error.statusCode = 400;
    error.code = 'INVALID_IDEMPOTENCY_KEY';
    throw error;
  }
  return key;
}

function buildCheckoutResponse(order, idempotent = false) {
  return {
    success: true,
    order_id: order.id,
    subtotal: order.subtotal,
    discount_amount: order.discount_amount,
    tax_amount: order.tax_amount,
    total_amount: order.total_amount,
    idempotent,
    message: idempotent
      ? 'Transaksi ini sudah pernah diproses. Respons dikembalikan tanpa membuat transaksi baru.'
      : 'Transaksi berhasil disimpan dan lunas'
  };
}

function isUniqueConstraintError(error) {
  return Boolean(
    error &&
    /UNIQUE constraint failed: orders\.idempotency_key/i.test(String(error.message || ''))
  );
}

function calculateRefundAmount(order, orderItem, quantity) {
  if (!order.subtotal || order.subtotal <= 0) return 0;
  const lineShare = orderItem.unit_price * quantity;
  const proportional = Math.round((lineShare / order.subtotal) * order.total_amount);
  return Math.min(proportional, order.total_amount);
}

// POST /api/orders (Process Cash, Card, or Split Checkout)
router.post('/', authenticateToken, async (req, res) => {
  let idempotencyKey = null;
  try {
    const {
      items,
      payment_method = 'cash', // 'cash', 'card', 'split' (QRIS checkout goes via QRIS route)
      payments, // Array: [{ method: 'cash', amount: 30000, tender: 50000 }, { method: 'card', amount: 20000, ... }]
      discount_amount = 0,
      discount_type = 'nominal',
      discount_value,
      tax_rate = 0,
      customer_id = null,
      notes = null,
      held_id = null
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang belanja tidak boleh kosong' });
    }

    idempotencyKey = normalizeIdempotencyKey(req);

    // Replays must work even if the cashier closed the shift after the first
    // successful request, so check the key before validating shift state.
    if (idempotencyKey) {
      const existingOrder = await db.getAsync(
        'SELECT * FROM orders WHERE idempotency_key = ?',
        [idempotencyKey]
      );

      if (existingOrder) {
        if (existingOrder.cashier_id !== req.user.id) {
          return res.status(409).json({
            error: 'Idempotency key ini sudah digunakan oleh pengguna lain',
            code: 'IDEMPOTENCY_KEY_CONFLICT'
          });
        }
        return res.json(buildCheckoutResponse(existingOrder, true));
      }
    }

    // Verify open shift
    const activeShift = await db.getAsync(
      'SELECT id FROM shifts WHERE user_id = ? AND status = "open"',
      [req.user.id]
    );

    if (!activeShift) {
      return res.status(400).json({
        error: 'Tidak ada shift aktif. Kasir wajib membuka shift kasir terlebih dahulu.'
      });
    }

    // Fetch all products in one query instead of N+1 queries.
    const productIds = [];
    for (const item of items) {
      const productId = Number(item.product_id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: `Produk ID ${item.product_id} tidak valid` });
      }
      productIds.push(productId);
    }

    const uniqueProductIds = [...new Set(productIds)];
    const placeholders = uniqueProductIds.map(() => '?').join(',');
    const products = await db.allAsync(
      `SELECT * FROM products WHERE id IN (${placeholders}) AND is_active = 1`,
      uniqueProductIds
    );
    const productMap = new Map(products.map((product) => [product.id, product]));

    const pricedItems = [];
    for (const item of items) {
      const product = productMap.get(Number(item.product_id));
      if (!product) {
        return res.status(400).json({
          error: `Produk ID ${item.product_id} tidak valid atau dinonaktifkan`
        });
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

    // Server-side calculation is authoritative; never trust client totals.
    const cart = calculateCart(pricedItems, {
      discount_amount,
      discount_type,
      discount_value,
      tax_rate,
      enforce_stock: true
    });
    const paymentSummary = validatePayments(cart.total_amount, payments, payment_method);
    const orderId = generateOrderId();
    const outletId = req.user.outlet_id || 1;

    await withTransaction(async () => {
      await db.runAsync(
        `INSERT INTO orders (id, outlet_id, cashier_id, customer_id, shift_id, status, subtotal, discount_amount, discount_type, tax_rate, tax_amount, total_amount, payment_method, notes, idempotency_key, paid_at)
         VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
          cart.total_amount,
          payment_method,
          notes || null,
          idempotencyKey
        ]
      );

      // Insert order items and deduct inventory atomically.
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

        await deductStock(db, {
          productId: item.product_id,
          quantity: item.quantity,
          outletId,
          userId: req.user.id,
          referenceId: orderId,
          notes: 'Penjualan kasir POS',
          movementType: 'sale'
        });
      }

      for (const payment of paymentSummary.payments) {
        await db.runAsync(
          `INSERT INTO order_payments (order_id, payment_method, amount, tender_amount, change_amount, card_issuer, card_ref, qris_ref)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            payment.method,
            payment.amount,
            payment.tender_amount,
            payment.change_amount,
            payment.card_issuer,
            payment.card_ref,
            payment.qris_ref
          ]
        );
      }

      // Customer loyalty points update (1 point per Rp 10.000).
      if (customer_id) {
        const earnedPoints = Math.floor(cart.total_amount / 10000);
        if (earnedPoints > 0) {
          await db.runAsync('UPDATE customers SET points = points + ? WHERE id = ?', [
            earnedPoints,
            customer_id
          ]);
        }
      }

      // If a held bill was converted, remove child rows before the parent.
      if (held_id) {
        await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [held_id]);
        await db.runAsync('DELETE FROM orders WHERE id = ? AND status = "held"', [held_id]);
      }

      await recordAuditLog(
        req.user.id,
        'COMPLETE_ORDER',
        'orders',
        orderId,
        {
          total_amount: cart.total_amount,
          payment_method,
          items_count: cart.items.length
        },
        req
      );
    });

    res.json({
      success: true,
      order_id: orderId,
      subtotal: cart.subtotal,
      discount_amount: cart.discount_amount,
      tax_amount: cart.tax_amount,
      total_amount: cart.total_amount,
      idempotent: false,
      message: 'Transaksi berhasil disimpan dan lunas'
    });
  } catch (err) {
    // Two identical requests can both pass the initial SELECT before either
    // transaction commits. The unique index then rejects the loser; replay the
    // winner instead of surfacing a 500 or charging twice.
    if (idempotencyKey && isUniqueConstraintError(err)) {
      const existingOrder = await db.getAsync(
        'SELECT * FROM orders WHERE idempotency_key = ?',
        [idempotencyKey]
      );
      if (existingOrder && existingOrder.cashier_id === req.user.id) {
        return res.json(buildCheckoutResponse(existingOrder, true));
      }
    }

    if (err && err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    console.error('Order checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders (Recent orders)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 30, status } = req.query;
    let query = `
      SELECT o.*, u.full_name as cashier_name, c.name as customer_name,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as total_items
      FROM orders o 
      LEFT JOIN users u ON o.cashier_id = u.id 
      LEFT JOIN customers c ON o.customer_id = c.id 
      WHERE o.status != 'held'
    `;
    const params = [];

    if (status) {
      query += ` AND o.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY o.created_at DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const orders = await db.allAsync(query, params);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id (Detailed order for receipt)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await db.getAsync(
      `SELECT o.*, u.full_name as cashier_name, c.name as customer_name, c.phone as customer_phone,
              out.name as outlet_name, out.address as outlet_address, out.phone as outlet_phone 
       FROM orders o 
       LEFT JOIN users u ON o.cashier_id = u.id 
       LEFT JOIN customers c ON o.customer_id = c.id 
       LEFT JOIN outlets out ON o.outlet_id = out.id 
       WHERE o.id = ?`,
      [req.params.id]
    );

    if (!order) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    const items = await db.allAsync(
      `SELECT oi.*, p.unit 
       FROM order_items oi 
       LEFT JOIN products p ON oi.product_id = p.id 
       WHERE oi.order_id = ?`,
      [order.id]
    );

    const payments = await db.allAsync(
      'SELECT * FROM order_payments WHERE order_id = ?',
      [order.id]
    );

    const qrisLedger = await db.getAsync(
      'SELECT * FROM qris_ledger WHERE order_id = ?',
      [order.id]
    );

    res.json({ order, items, payments, qrisLedger });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/hold (Save Bill)
router.post('/hold', authenticateToken, async (req, res) => {
  try {
    const { items, held_name, notes, discount_amount = 0, tax_rate = 0, customer_id = null } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang belanja tidak boleh kosong' });
    }

    const orderId = `HOLD-${Date.now().toString().slice(-6)}`;
    let subtotal = 0;

    for (const item of items) {
      subtotal += parseInt(item.selling_price || 0, 10) * parseInt(item.quantity || 1, 10);
    }

    const disc = parseInt(discount_amount || 0, 10);
    const tax = Math.round((subtotal - disc) * (parseFloat(tax_rate || 0) / 100));
    const totalAmount = subtotal - disc + tax;

    await db.runAsync(
      `INSERT INTO orders (id, outlet_id, cashier_id, customer_id, status, subtotal, discount_amount, tax_rate, tax_amount, total_amount, payment_method, held_name, notes) 
       VALUES (?, ?, ?, ?, 'held', ?, ?, ?, ?, ?, 'cash', ?, ?)`,
      [
        orderId,
        req.user.outlet_id || 1,
        req.user.id,
        customer_id || null,
        subtotal,
        disc,
        parseFloat(tax_rate || 0),
        tax,
        totalAmount,
        held_name || `Antrean #${orderId.replace('HOLD-', '')}`,
        notes || null
      ]
    );

    for (const item of items) {
      await db.runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, sku, unit_price, cost_price, quantity, subtotal, discount, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          orderId,
          item.product_id,
          item.name,
          item.sku || '',
          item.selling_price,
          item.cost_price || 0,
          item.quantity,
          item.selling_price * item.quantity,
          item.selling_price * item.quantity
        ]
      );
    }

    res.json({ success: true, held_id: orderId, message: 'Pesanan berhasil disimpan (Save Bill)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/held/list
router.get('/held/list', authenticateToken, async (req, res) => {
  try {
    const heldOrders = await db.allAsync(
      `SELECT o.*, u.full_name as cashier_name,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
       FROM orders o 
       LEFT JOIN users u ON o.cashier_id = u.id 
       WHERE o.status = 'held' 
       ORDER BY o.created_at DESC`
    );

    // Fetch items for each held order
    for (const h of heldOrders) {
      h.items = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [h.id]);
    }

    res.json({ heldOrders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/held/:id
router.delete('/held/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [id]);
    await db.runAsync('DELETE FROM orders WHERE id = ? AND status = "held"', [id]);
    res.json({ success: true, message: 'Pesanan tertahan dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/void (Void transaction with Manager PIN authorization)
router.post('/:id/void', authenticateToken, verifyManagerPin, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Alasan pembatalan (void) wajib diisi' });
    }

    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    if (order.status === 'voided') {
      return res.status(400).json({ error: 'Transaksi ini sudah pernah dibatalkan (voided)' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({
        error: `Hanya transaksi berstatus lunas yang dapat di-void (status saat ini: ${order.status})`
      });
    }

    const items = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    await withTransaction(async () => {
      for (const item of items) {
        await restoreStock(db, {
          productId: item.product_id,
          quantity: item.quantity,
          outletId: order.outlet_id,
          userId: req.user.id,
          referenceId: orderId,
          notes: `Void Transaksi: ${reason} (Otorisasi: ${req.manager.full_name})`,
          movementType: 'void'
        });
      }

      await db.runAsync(
        `UPDATE orders
         SET status = 'voided', void_reason = ?, void_by = ?
         WHERE id = ?`,
        [reason, req.manager.id, orderId]
      );

      // If QRIS was used, mark ledger as disputed/voided.
      await db.runAsync(
        `UPDATE qris_ledger SET status = 'DISPUTED' WHERE order_id = ?`,
        [orderId]
      );

      await recordAuditLog(
        req.user.id,
        'VOID_ORDER',
        'orders',
        orderId,
        { reason, manager: req.manager.full_name, amount: order.total_amount },
        req
      );
    });

    res.json({
      success: true,
      message: `Transaksi ${orderId} berhasil dibatalkan (void). Stok barang telah dikembalikan.`,
      manager: req.manager.full_name
    });
  } catch (err) {
    if (err instanceof InventoryError || (err && err.statusCode && err.statusCode < 500)) {
      return res.status(err.statusCode || 400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/return (Process product return with Manager PIN)
router.post('/:id/return', authenticateToken, verifyManagerPin, async (req, res) => {
  try {
    const orderId = req.params.id;
    const {
      product_id,
      return_qty,
      reason,
      restock = true,
      refund_method
    } = req.body;

    const productId = Number(product_id);
    const qty = Number(return_qty);

    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      !Number.isInteger(qty) ||
      qty <= 0
    ) {
      return res.status(400).json({ error: 'Produk dan kuantitas retur wajib valid' });
    }

    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    if (order.status !== 'paid') {
      return res.status(400).json({
        error: `Hanya transaksi berstatus lunas yang dapat diretur (status saat ini: ${order.status})`
      });
    }

    const orderItem = await db.getAsync(
      'SELECT * FROM order_items WHERE order_id = ? AND product_id = ?',
      [orderId, productId]
    );

    if (!orderItem) {
      return res.status(404).json({ error: 'Item produk tidak ditemukan dalam transaksi ini' });
    }

    const paymentMethod = refund_method || order.payment_method;
    if (!REFUND_METHODS.has(paymentMethod)) {
      return res.status(400).json({
        error: `Metode refund "${paymentMethod}" tidak dikenal`,
        code: 'INVALID_REFUND_METHOD'
      });
    }

    // Return quantities are tracked in the return ledger, not in stock
    // movements, so no-restock returns still consume the returnable quantity.
    const returnedRow = await db.getAsync(
      `SELECT COALESCE(SUM(ori.quantity), 0) AS returned_qty
       FROM order_return_items ori
       JOIN order_returns r ON r.id = ori.return_id
       WHERE r.order_id = ? AND ori.product_id = ? AND r.status = 'completed'`,
      [orderId, productId]
    );
    const alreadyReturned = returnedRow ? returnedRow.returned_qty : 0;

    if (alreadyReturned + qty > orderItem.quantity) {
      return res.status(400).json({
        error: `Jumlah retur melebihi sisa pembelian (Sudah diretur: ${alreadyReturned}, Dibeli: ${orderItem.quantity})`,
        code: 'RETURN_QUANTITY_EXCEEDED'
      });
    }

    const refundedRow = await db.getAsync(
      `SELECT COALESCE(SUM(refund_amount), 0) AS refunded_total
       FROM order_returns
       WHERE order_id = ? AND status = 'completed'`,
      [orderId]
    );
    const alreadyRefunded = refundedRow ? refundedRow.refunded_total : 0;
    const remainingRefundable = Math.max(0, order.total_amount - alreadyRefunded);
    const calculatedRefund = calculateRefundAmount(order, orderItem, qty);
    const refundAmount = Math.min(calculatedRefund, remainingRefundable);

    if (refundAmount <= 0 && remainingRefundable <= 0) {
      return res.status(400).json({
        error: 'Nilai refund sudah mencapai total transaksi',
        code: 'REFUND_LIMIT_REACHED'
      });
    }

    let returnId = null;

    await withTransaction(async () => {
      const header = await db.runAsync(
        `INSERT INTO order_returns
           (order_id, refund_amount, refund_method, reason, status, approved_by, created_by)
         VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
        [
          orderId,
          refundAmount,
          paymentMethod,
          reason || 'Retur pelanggan',
          req.manager.id,
          req.user.id
        ]
      );
      returnId = header.lastID;

      await db.runAsync(
        `INSERT INTO order_return_items
           (return_id, order_item_id, product_id, quantity, unit_price, refund_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          returnId,
          orderItem.id,
          productId,
          qty,
          orderItem.unit_price,
          refundAmount
        ]
      );

      if (restock !== false) {
        await restoreStock(db, {
          productId,
          quantity: qty,
          outletId: order.outlet_id,
          userId: req.user.id,
          referenceId: orderId,
          notes: `Retur Barang: ${reason || 'Retur pelanggan'} (Otorisasi: ${req.manager.full_name})`,
          movementType: 'return'
        });
      }

      await recordAuditLog(
        req.user.id,
        'RETURN_ITEM',
        'order_items',
        orderItem.id,
        {
          orderId,
          returnId,
          product_id: productId,
          return_qty: qty,
          refund_amount: refundAmount,
          refund_method: paymentMethod,
          restock: restock !== false,
          reason,
          manager: req.manager.full_name
        },
        req
      );
    });

    res.json({
      success: true,
      return_id: returnId,
      refund_amount: refundAmount,
      refund_method: paymentMethod,
      restocked: restock !== false,
      already_returned: alreadyReturned + qty,
      remaining_refundable: Math.max(0, remainingRefundable - refundAmount),
      message: `Retur ${qty} item berhasil diproses${restock !== false ? '. Stok barang diperbarui.' : '.'}`
    });
  } catch (err) {
    if (err instanceof InventoryError || (err && err.statusCode && err.statusCode < 500)) {
      return res.status(err.statusCode || 400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id/returns (Refund and return ledger for an order)
router.get('/:id/returns', authenticateToken, async (req, res) => {
  try {
    const order = await db.getAsync('SELECT id, total_amount FROM orders WHERE id = ?', [
      req.params.id
    ]);
    if (!order) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    const returns = await db.allAsync(
      `SELECT r.*, u.full_name AS approved_by_name
       FROM order_returns r
       LEFT JOIN users u ON r.approved_by = u.id
       WHERE r.order_id = ?
       ORDER BY r.created_at DESC, r.id DESC`,
      [req.params.id]
    );

    for (const item of returns) {
      item.items = await db.allAsync(
        `SELECT ori.*, p.name AS product_name
         FROM order_return_items ori
         LEFT JOIN products p ON p.id = ori.product_id
         WHERE ori.return_id = ?`,
        [item.id]
      );
    }

    const totalRefunded = returns
      .filter((item) => item.status === 'completed')
      .reduce((sum, item) => sum + item.refund_amount, 0);

    res.json({
      order_id: order.id,
      total_refunded: totalRefunded,
      remaining_refundable: Math.max(0, order.total_amount - totalRefunded),
      returns
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

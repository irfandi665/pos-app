const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, verifyManagerPin, recordAuditLog } = require('../auth');

// Helper to generate readable ID e.g. ORD-20261112-0045
function generateOrderId() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${ymd}-${rand}`;
}

// POST /api/orders (Process Cash, Card, or Split Checkout)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      items,
      payment_method, // 'cash', 'card', 'split' (QRIS checkout goes via QRIS route)
      payments, // Array: [{ method: 'cash', amount: 30000, tender: 50000, change: 20000 }, { method: 'card', amount: 20000, card_issuer: 'BCA', card_ref: '00123' }]
      discount_amount = 0,
      discount_type = 'nominal',
      tax_rate = 0,
      customer_id = null,
      notes = null,
      held_id = null
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang belanja tidak boleh kosong' });
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

    const orderId = generateOrderId();
    let subtotal = 0;
    const orderItems = [];

    // Verify item prices and calculate subtotal
    for (const item of items) {
      const prod = await db.getAsync('SELECT * FROM products WHERE id = ? AND is_active = 1', [item.product_id]);
      if (!prod) {
        return res.status(400).json({ error: `Produk ID ${item.product_id} tidak valid atau dinonaktifkan` });
      }

      const qty = parseInt(item.quantity, 10);
      if (qty <= 0) {
        return res.status(400).json({ error: `Jumlah barang ${prod.name} tidak valid` });
      }

      if (prod.stock < qty) {
        return res.status(400).json({ 
          error: `Stok barang "${prod.name}" tidak mencukupi (Tersedia: ${prod.stock}, Diminta: ${qty})` 
        });
      }

      const itemTotal = prod.selling_price * qty;
      subtotal += itemTotal;

      orderItems.push({
        product_id: prod.id,
        name: prod.name,
        sku: prod.sku,
        unit_price: prod.selling_price,
        cost_price: prod.cost_price,
        quantity: qty,
        subtotal: itemTotal,
        total: itemTotal,
        current_stock: prod.stock
      });
    }

    const disc = parseInt(discount_amount || 0, 10);
    const afterDisc = Math.max(0, subtotal - disc);
    const tax = Math.round(afterDisc * (parseFloat(tax_rate || 0) / 100));
    const totalAmount = afterDisc + tax;

    // Verify payment totals
    let totalPaid = 0;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      for (const p of payments) {
        totalPaid += parseInt(p.amount || 0, 10);
      }
    } else {
      totalPaid = totalAmount;
    }

    if (totalPaid < totalAmount) {
      return res.status(400).json({ 
        error: `Nominal pembayaran (Rp ${totalPaid.toLocaleString('id-ID')}) kurang dari total tagihan (Rp ${totalAmount.toLocaleString('id-ID')})` 
      });
    }

    // Insert order
    await db.runAsync(
      `INSERT INTO orders (id, outlet_id, cashier_id, customer_id, shift_id, status, subtotal, discount_amount, discount_type, tax_rate, tax_amount, total_amount, payment_method, notes, paid_at) 
       VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        orderId,
        req.user.outlet_id || 1,
        req.user.id,
        customer_id || null,
        activeShift.id,
        subtotal,
        disc,
        discount_type,
        parseFloat(tax_rate || 0),
        tax,
        totalAmount,
        payment_method || 'cash',
        notes || null
      ]
    );

    // Insert order items & deduct stock
    for (const oi of orderItems) {
      await db.runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, sku, unit_price, cost_price, quantity, subtotal, discount, total) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [orderId, oi.product_id, oi.name, oi.sku, oi.unit_price, oi.cost_price, oi.quantity, oi.subtotal, oi.total]
      );

      const newStock = oi.current_stock - oi.quantity;
      await db.runAsync('UPDATE products SET stock = ? WHERE id = ?', [newStock, oi.product_id]);

      await db.runAsync(
        `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, reference_id, notes, user_id) 
         VALUES (?, ?, ?, ?, ?, 'sale', ?, 'Penjualan kasir POS', ?)`,
        [oi.product_id, req.user.outlet_id || 1, -oi.quantity, oi.current_stock, newStock, orderId, req.user.id]
      );
    }

    // Insert payment splits
    if (payments && Array.isArray(payments) && payments.length > 0) {
      for (const p of payments) {
        await db.runAsync(
          `INSERT INTO order_payments (order_id, payment_method, amount, tender_amount, change_amount, card_issuer, card_ref) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            p.method,
            parseInt(p.amount, 10),
            parseInt(p.tender || p.amount, 10),
            parseInt(p.change || 0, 10),
            p.card_issuer || null,
            p.card_ref || null
          ]
        );
      }
    } else {
      await db.runAsync(
        `INSERT INTO order_payments (order_id, payment_method, amount, tender_amount, change_amount) 
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, payment_method || 'cash', totalAmount, totalAmount, 0]
      );
    }

    // Customer loyalty points update (e.g., 1 point per Rp 10.000)
    if (customer_id) {
      const earnedPoints = Math.floor(totalAmount / 10000);
      if (earnedPoints > 0) {
        await db.runAsync('UPDATE customers SET points = points + ? WHERE id = ?', [earnedPoints, customer_id]);
      }
    }

    // If held bill was converted to order, delete from held
    if (held_id) {
      await db.runAsync('DELETE FROM orders WHERE id = ? AND status = "held"', [held_id]);
      await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [held_id]);
    }

    await recordAuditLog(
      req.user.id,
      'COMPLETE_ORDER',
      'orders',
      orderId,
      { total_amount: totalAmount, payment_method, items_count: orderItems.length },
      req
    );

    res.json({
      success: true,
      order_id: orderId,
      total_amount: totalAmount,
      message: 'Transaksi berhasil disimpan dan lunas'
    });
  } catch (err) {
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

    // Restore stock
    const items = await db.allAsync('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    for (const it of items) {
      const prod = await db.getAsync('SELECT stock FROM products WHERE id = ?', [it.product_id]);
      if (prod) {
        const newStock = prod.stock + it.quantity;
        await db.runAsync('UPDATE products SET stock = ? WHERE id = ?', [newStock, it.product_id]);

        await db.runAsync(
          `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, reference_id, notes, user_id) 
           VALUES (?, ?, ?, ?, ?, 'void', ?, ?, ?)`,
          [
            it.product_id,
            order.outlet_id,
            it.quantity,
            prod.stock,
            newStock,
            orderId,
            `Void Transaksi: ${reason} (Otorisasi: ${req.manager.full_name})`,
            req.user.id
          ]
        );
      }
    }

    // Update order status
    await db.runAsync(
      `UPDATE orders 
       SET status = 'voided', void_reason = ?, void_by = ? 
       WHERE id = ?`,
      [reason, req.manager.id, orderId]
    );

    // If QRIS was used, mark ledger as disputed/voided
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

    res.json({
      success: true,
      message: `Transaksi ${orderId} berhasil dibatalkan (void). Stok barang telah dikembalikan.`,
      manager: req.manager.full_name
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/return (Process product return with Manager PIN)
router.post('/:id/return', authenticateToken, verifyManagerPin, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { product_id, return_qty, reason, restock = true } = req.body;

    if (!product_id || !return_qty || parseInt(return_qty, 10) <= 0) {
      return res.status(400).json({ error: 'Produk dan kuantitas retur wajib valid' });
    }

    const orderItem = await db.getAsync(
      'SELECT * FROM order_items WHERE order_id = ? AND product_id = ?',
      [orderId, product_id]
    );

    if (!orderItem) {
      return res.status(404).json({ error: 'Item produk tidak ditemukan dalam transaksi ini' });
    }

    const qty = parseInt(return_qty, 10);
    if (qty > orderItem.quantity) {
      return res.status(400).json({ error: 'Jumlah retur melebihi jumlah pembelian pada transaksi' });
    }

    if (restock) {
      const prod = await db.getAsync('SELECT stock FROM products WHERE id = ?', [product_id]);
      if (prod) {
        const newStock = prod.stock + qty;
        await db.runAsync('UPDATE products SET stock = ? WHERE id = ?', [newStock, product_id]);

        await db.runAsync(
          `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, reference_id, notes, user_id) 
           VALUES (?, ?, ?, ?, ?, 'return', ?, ?, ?)`,
          [
            product_id,
            req.user.outlet_id || 1,
            qty,
            prod.stock,
            newStock,
            orderId,
            `Retur Barang: ${reason || 'Retur pelanggan'} (Otorisasi: ${req.manager.full_name})`,
            req.user.id
          ]
        );
      }
    }

    await recordAuditLog(
      req.user.id,
      'RETURN_ITEM',
      'order_items',
      orderItem.id,
      { orderId, product_id, return_qty: qty, reason, manager: req.manager.full_name },
      req
    );

    res.json({
      success: true,
      message: `Retur ${qty} item berhasil diproses. Stok barang diperbarui.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

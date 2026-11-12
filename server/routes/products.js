const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireRole, verifyManagerPin, recordAuditLog } = require('../auth');

// GET /api/products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category_id, search, low_stock } = req.query;
    let query = `
      SELECT p.*, c.name as category_name, c.color as category_color 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = 1
    `;
    const params = [];

    if (category_id) {
      query += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (search) {
      query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (low_stock === 'true') {
      query += ` AND p.stock <= p.min_stock`;
    }

    query += ` ORDER BY p.name ASC`;
    const products = await db.allAsync(query, params);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categories
router.get('/categories/list', authenticateToken, async (req, res) => {
  try {
    const categories = await db.allAsync(
      `SELECT c.*, COUNT(p.id) as product_count 
       FROM categories c 
       LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1 
       GROUP BY c.id 
       ORDER BY c.name ASC`
    );
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories
router.post('/categories', authenticateToken, requireRole(['manager', 'owner']), async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama kategori wajib diisi' });

    const result = await db.runAsync(
      `INSERT INTO categories (outlet_id, name, color, icon) VALUES (?, ?, ?, ?)`,
      [req.user.outlet_id || 1, name, color || '#4F46E5', icon || 'Package']
    );

    res.json({ id: result.lastID, name, message: 'Kategori berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products
router.post('/', authenticateToken, requireRole(['manager', 'owner']), async (req, res) => {
  try {
    const { category_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, image_url } = req.body;
    if (!name || !sku || selling_price === undefined) {
      return res.status(400).json({ error: 'Nama, SKU, dan harga jual wajib diisi' });
    }

    const result = await db.runAsync(
      `INSERT INTO products (outlet_id, category_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, image_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.outlet_id || 1,
        category_id || null,
        name,
        sku,
        barcode || null,
        unit || 'pcs',
        parseInt(cost_price || 0, 10),
        parseInt(selling_price || 0, 10),
        parseInt(stock || 0, 10),
        parseInt(min_stock || 5, 10),
        image_url || null
      ]
    );

    const newProdId = result.lastID;
    const initialStock = parseInt(stock || 0, 10);

    if (initialStock > 0) {
      await db.runAsync(
        `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, notes, user_id) 
         VALUES (?, ?, ?, 0, ?, 'stock_in', 'Penambahan produk baru', ?)`,
        [newProdId, req.user.outlet_id || 1, initialStock, initialStock, req.user.id]
      );
    }

    await recordAuditLog(req.user.id, 'CREATE_PRODUCT', 'products', newProdId, { name, sku, selling_price, stock }, req);

    res.json({ id: newProdId, message: 'Produk berhasil disimpan' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'SKU produk sudah digunakan' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', authenticateToken, requireRole(['manager', 'owner']), async (req, res) => {
  try {
    const id = req.params.id;
    const { category_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, image_url } = req.body;

    const existing = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    // If price changed, requires manager PIN check or audit
    const newCost = parseInt(cost_price ?? existing.cost_price, 10);
    const newSelling = parseInt(selling_price ?? existing.selling_price, 10);
    const newStock = parseInt(stock ?? existing.stock, 10);

    await db.runAsync(
      `UPDATE products 
       SET category_id = ?, name = ?, sku = ?, barcode = ?, unit = ?, cost_price = ?, selling_price = ?, stock = ?, min_stock = ?, image_url = ? 
       WHERE id = ?`,
      [
        category_id ?? existing.category_id,
        name ?? existing.name,
        sku ?? existing.sku,
        barcode ?? existing.barcode,
        unit ?? existing.unit,
        newCost,
        newSelling,
        newStock,
        parseInt(min_stock ?? existing.min_stock, 10),
        image_url ?? existing.image_url,
        id
      ]
    );

    if (newStock !== existing.stock) {
      const diff = newStock - existing.stock;
      await db.runAsync(
        `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, notes, user_id) 
         VALUES (?, ?, ?, ?, ?, 'opname_adjustment', 'Penyesuaian manual edit produk', ?)`,
        [id, req.user.outlet_id || 1, diff, existing.stock, newStock, req.user.id]
      );
    }

    await recordAuditLog(req.user.id, 'UPDATE_PRODUCT', 'products', id, { old: existing, updated: req.body }, req);

    res.json({ message: 'Produk berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticateToken, requireRole(['manager', 'owner']), verifyManagerPin, async (req, res) => {
  try {
    const id = req.params.id;
    await db.runAsync('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    await recordAuditLog(req.user.id, 'DEACTIVATE_PRODUCT', 'products', id, 'Produk dinonaktifkan dengan PIN manajer', req);
    res.json({ message: 'Produk berhasil dinonaktifkan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/movements (Stock movements audit log)
router.get('/history/movements', authenticateToken, async (req, res) => {
  try {
    const { product_id, limit = 50 } = req.query;
    let query = `
      SELECT sm.*, p.name as product_name, p.sku, u.full_name as user_name 
      FROM stock_movements sm 
      JOIN products p ON sm.product_id = p.id 
      LEFT JOIN users u ON sm.user_id = u.id 
    `;
    const params = [];

    if (product_id) {
      query += ` WHERE sm.product_id = ?`;
      params.push(product_id);
    }

    query += ` ORDER BY sm.created_at DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const movements = await db.allAsync(query, params);
    res.json({ movements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/opname (Stock Opname submit with Manager PIN verification)
router.post('/opname', authenticateToken, requireRole(['manager', 'owner']), verifyManagerPin, async (req, res) => {
  try {
    const { items, notes } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Daftar item opname tidak boleh kosong' });
    }

    let totalDiscrepancyQty = 0;
    let totalShrinkageAmount = 0;

    const opnameRes = await db.runAsync(
      `INSERT INTO stock_opnames (outlet_id, user_id, manager_id, total_items_checked, notes) 
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.outlet_id || 1, req.user.id, req.manager.id, items.length, notes || 'Sesi stock opname']
    );
    const opnameId = opnameRes.lastID;

    for (const item of items) {
      const prod = await db.getAsync('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!prod) continue;

      const physicalQty = parseInt(item.physical_qty, 10);
      const systemQty = prod.stock;
      const discrepancyQty = physicalQty - systemQty;
      const shrinkage = discrepancyQty < 0 ? Math.abs(discrepancyQty) * prod.cost_price : 0;

      totalDiscrepancyQty += Math.abs(discrepancyQty);
      totalShrinkageAmount += shrinkage;

      // Insert opname item
      await db.runAsync(
        `INSERT INTO stock_opname_items (opname_id, product_id, system_qty, physical_qty, discrepancy_qty, cost_price, shrinkage_amount, reason) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [opnameId, prod.id, systemQty, physicalQty, discrepancyQty, prod.cost_price, shrinkage, item.reason || 'Hasil opname fisik']
      );

      // Adjust actual product stock
      if (discrepancyQty !== 0) {
        await db.runAsync('UPDATE products SET stock = ? WHERE id = ?', [physicalQty, prod.id]);

        await db.runAsync(
          `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, reference_id, notes, user_id) 
           VALUES (?, ?, ?, ?, ?, 'opname_adjustment', ?, ?, ?)`,
          [
            prod.id,
            req.user.outlet_id || 1,
            discrepancyQty,
            systemQty,
            physicalQty,
            `OPNAME-${opnameId}`,
            `Penyesuaian Opname: ${item.reason || 'Selisih fisik'} (Shrinkage: Rp ${shrinkage.toLocaleString('id-ID')})`,
            req.user.id
          ]
        );
      }
    }

    // Update opname totals
    await db.runAsync(
      `UPDATE stock_opnames 
       SET total_discrepancy_qty = ?, total_shrinkage_amount = ? 
       WHERE id = ?`,
      [totalDiscrepancyQty, totalShrinkageAmount, opnameId]
    );

    await recordAuditLog(
      req.user.id,
      'STOCK_OPNAME',
      'stock_opnames',
      opnameId,
      { total_items: items.length, totalDiscrepancyQty, totalShrinkageAmount, manager: req.manager.full_name },
      req
    );

    res.json({
      success: true,
      opname_id: opnameId,
      total_items_checked: items.length,
      total_discrepancy_qty: totalDiscrepancyQty,
      total_shrinkage_amount: totalShrinkageAmount,
      message: `Stock Opname selesai. Total penyusutan: Rp ${totalShrinkageAmount.toLocaleString('id-ID')}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/opnames/list
router.get('/opnames/list', authenticateToken, async (req, res) => {
  try {
    const opnames = await db.allAsync(
      `SELECT so.*, u.full_name as created_by_name, m.full_name as approved_by_name 
       FROM stock_opnames so 
       LEFT JOIN users u ON so.user_id = u.id 
       LEFT JOIN users m ON so.manager_id = m.id 
       ORDER BY so.opname_date DESC LIMIT 20`
    );
    res.json({ opnames });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
